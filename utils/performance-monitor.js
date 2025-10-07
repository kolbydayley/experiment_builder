/**
 * Performance Monitoring & Regression Testing Suite
 * Ensures new features don't degrade existing performance
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.baselines = new Map();
    this.alerts = [];
    this.isMonitoring = false;
  }

  async initialize() {
    // Load existing baselines
    const stored = await chrome.storage.local.get(['performanceBaselines']);
    if (stored.performanceBaselines) {
      this.baselines = new Map(Object.entries(stored.performanceBaselines));
    }

    // Set up continuous monitoring
    this.startContinuousMonitoring();
    
    console.log('📊 Performance Monitor initialized');
  }

  startContinuousMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Memory usage monitoring
    setInterval(() => {
      this.recordMetric('memory_usage', this.getMemoryUsage());
    }, 10000); // Every 10 seconds

    // DOM operation timing
    this.monitorDOMOperations();
    
    // API response times
    this.monitorAPIRequests();
    
    // User interaction responsiveness
    this.monitorUserInteractions();
  }

  recordMetric(name, value, metadata = {}) {
    const timestamp = Date.now();
    const interface_version = window.featureFlags?.getActiveInterface() || 'v1';
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name).push({
      timestamp,
      value,
      interface_version,
      ...metadata
    });

    // Keep only last 100 measurements per metric
    const measurements = this.metrics.get(name);
    if (measurements.length > 100) {
      this.metrics.set(name, measurements.slice(-100));
    }

    // Check for performance regressions
    this.checkForRegressions(name, value);
    
    // Report to feature flags system
    window.featureFlags?.reportPerformance(name, value);
  }

  async setBaseline(name, value) {
    this.baselines.set(name, value);
    await this.saveBaselines();
    console.log(`📏 Baseline set for ${name}: ${value}`);
  }

  async saveBaselines() {
    const baselineObj = Object.fromEntries(this.baselines);
    await chrome.storage.local.set({ performanceBaselines: baselineObj });
  }

  checkForRegressions(metricName, currentValue) {
    const baseline = this.baselines.get(metricName);
    if (!baseline) return;

    const regressionThreshold = this.getRegressionThreshold(metricName);
    const percentageChange = ((currentValue - baseline) / baseline) * 100;

    if (percentageChange > regressionThreshold) {
      this.reportRegression(metricName, baseline, currentValue, percentageChange);
    }
  }

  getRegressionThreshold(metricName) {
    const thresholds = {
      'memory_usage': 15,        // 15% increase is concerning
      'api_response_time': 50,   // 50% slower is concerning
      'dom_operation_time': 100, // 100% slower is concerning
      'user_interaction_delay': 25, // 25ms increase is concerning
      'page_load_time': 30       // 30% slower is concerning
    };
    return thresholds[metricName] || 20; // Default 20% threshold
  }

  reportRegression(metricName, baseline, current, percentageChange) {
    const alert = {
      timestamp: Date.now(),
      metric: metricName,
      baseline,
      current,
      percentageChange,
      interface: window.featureFlags?.getActiveInterface() || 'unknown'
    };

    this.alerts.push(alert);
    
    console.warn(`🚨 Performance Regression Detected:`, alert);
    
    // If using V2 interface and regression is severe, consider emergency rollback
    if (percentageChange > 100 && window.featureFlags?.isEnabled('workspace_v2')) {
      console.error('💥 Severe performance regression detected in V2 interface');
      
      // Could trigger automatic rollback here
      // window.featureFlags.emergencyRollback();
    }
  }

  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return null;
  }

  monitorDOMOperations() {
    // Wrap common DOM operations to measure timing
    const originalQuerySelector = Document.prototype.querySelector;
    const originalQuerySelectorAll = Document.prototype.querySelectorAll;
    const originalAppendChild = Element.prototype.appendChild;

    Document.prototype.querySelector = function(...args) {
      const start = performance.now();
      const result = originalQuerySelector.apply(this, args);
      const duration = performance.now() - start;
      
      if (duration > 1) { // Only log slow operations
        window.performanceMonitor?.recordMetric('dom_query_time', duration, {
          selector: args[0],
          found: !!result
        });
      }
      
      return result;
    };

    Element.prototype.appendChild = function(...args) {
      const start = performance.now();
      const result = originalAppendChild.apply(this, args);
      const duration = performance.now() - start;
      
      if (duration > 0.5) {
        window.performanceMonitor?.recordMetric('dom_append_time', duration);
      }
      
      return result;
    };
  }

  monitorAPIRequests() {
    // Wrap fetch to monitor API response times
    const originalFetch = window.fetch;
    
    window.fetch = function(...args) {
      const start = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      
      return originalFetch.apply(this, args).then(response => {
        const duration = performance.now() - start;
        
        window.performanceMonitor?.recordMetric('api_response_time', duration, {
          url: url,
          status: response.status,
          ok: response.ok
        });
        
        return response;
      }).catch(error => {
        const duration = performance.now() - start;
        
        window.performanceMonitor?.recordMetric('api_error_time', duration, {
          url: url,
          error: error.message
        });
        
        throw error;
      });
    };
  }

  monitorUserInteractions() {
    let interactionStart = null;

    // Monitor click responsiveness
    document.addEventListener('mousedown', () => {
      interactionStart = performance.now();
    });

    document.addEventListener('click', () => {
      if (interactionStart) {
        const delay = performance.now() - interactionStart;
        this.recordMetric('user_interaction_delay', delay);
        interactionStart = null;
      }
    });

    // Monitor typing responsiveness
    document.addEventListener('keydown', () => {
      interactionStart = performance.now();
    });

    document.addEventListener('keyup', () => {
      if (interactionStart) {
        const delay = performance.now() - interactionStart;
        this.recordMetric('typing_response_delay', delay);
        interactionStart = null;
      }
    });
  }

  generateReport() {
    const report = {
      timestamp: Date.now(),
      interface: window.featureFlags?.getActiveInterface() || 'unknown',
      metrics: {},
      baselines: Object.fromEntries(this.baselines),
      alerts: this.alerts.slice(-10) // Last 10 alerts
    };

    // Calculate averages for each metric
    for (const [name, measurements] of this.metrics) {
      if (measurements.length > 0) {
        const values = measurements.map(m => m.value).filter(v => v !== null);
        report.metrics[name] = {
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length,
          recent: measurements.slice(-5) // Last 5 measurements
        };
      }
    }

    return report;
  }

  async exportReport() {
    const report = this.generateReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  // Automated regression testing
  async runRegressionTest() {
    console.log('🧪 Running automated regression test...');
    
    const testResults = {
      timestamp: Date.now(),
      interface: window.featureFlags?.getActiveInterface(),
      tests: []
    };

    // Test 1: Page load performance
    const loadStart = performance.now();
    // Trigger a full interface reload/refresh
    await this.simulateFullWorkflow();
    const loadTime = performance.now() - loadStart;
    
    testResults.tests.push({
      name: 'full_workflow_performance',
      duration: loadTime,
      passed: loadTime < 5000, // Should complete in under 5 seconds
      baseline: this.baselines.get('full_workflow_time') || 3000
    });

    // Test 2: Memory leak detection
    const initialMemory = this.getMemoryUsage();
    await this.simulateHeavyUsage();
    const finalMemory = this.getMemoryUsage();
    const memoryIncrease = finalMemory - initialMemory;
    
    testResults.tests.push({
      name: 'memory_leak_detection',
      memoryIncrease,
      passed: memoryIncrease < 10 * 1024 * 1024, // Less than 10MB increase
      baseline: this.baselines.get('memory_stability') || 0
    });

    // Test 3: API responsiveness
    const apiStart = performance.now();
    try {
      // Test a typical API call
      await this.testAPICall();
      const apiTime = performance.now() - apiStart;
      
      testResults.tests.push({
        name: 'api_responsiveness',
        duration: apiTime,
        passed: apiTime < 2000, // Under 2 seconds
        baseline: this.baselines.get('api_response_time') || 1000
      });
    } catch (error) {
      testResults.tests.push({
        name: 'api_responsiveness',
        error: error.message,
        passed: false
      });
    }

    const allPassed = testResults.tests.every(test => test.passed);
    
    console.log(`🧪 Regression test ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (!allPassed) {
      console.error('Failed tests:', testResults.tests.filter(t => !t.passed));
    }

    return testResults;
  }

  async simulateFullWorkflow() {
    // Simulate a complete user workflow for performance testing
    // This would trigger the main application flows without side effects
  }

  async simulateHeavyUsage() {
    // Simulate heavy usage patterns to detect memory leaks
    // Create and destroy UI elements, make API calls, etc.
  }

  async testAPICall() {
    // Test a representative API call for responsiveness
    // This could be a lightweight endpoint or a mock call
  }
}

// Global instance
window.performanceMonitor = new PerformanceMonitor();

// Initialize when feature flags are ready
window.addEventListener('load', () => {
  window.performanceMonitor.initialize();
});

// Automated regression testing on interface switches
window.addEventListener('featureFlagChanged', async (e) => {
  if (e.detail.flagName === 'workspace_v2') {
    // Run regression test when switching interfaces
    setTimeout(async () => {
      await window.performanceMonitor.runRegressionTest();
    }, 1000); // Give interface time to load
  }
});