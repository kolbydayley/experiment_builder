/**
 * Test Script Executor
 * Executes AI-generated test scripts in MAIN world
 * Captures screenshots, states, and validates outcomes
 */

class TestScriptExecutor {
  constructor(options = {}) {
    this.defaultTimeout = options.timeout || 10000; // 10 seconds
    this.screenshotCapture = options.screenshotCapture || null; // Function to capture screenshots
  }

  /**
   * Execute test script in page context
   * @param {string} testScript - Test function code
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Test results
   */
  async executeTestScript(testScript, options = {}) {
    console.log('[Test Executor] Starting test execution...');

    const timeout = options.timeout || this.defaultTimeout;
    const captureScreenshots = options.captureScreenshots !== false;

    try {
      // Create execution promise with timeout
      const executionPromise = this.executeInPage(testScript, captureScreenshots);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test execution timed out after ${timeout}ms`));
        }, timeout);
      });

      // Race between execution and timeout
      const results = await Promise.race([executionPromise, timeoutPromise]);

      console.log('[Test Executor] Test completed:', results);
      return {
        success: true,
        results,
        executionTime: Date.now() - results.startTime
      };
    } catch (error) {
      console.error('[Test Executor] Test execution failed:', error);
      return {
        success: false,
        error: error.message,
        results: null
      };
    }
  }

  /**
   * Execute test in page context via chrome.scripting
   * @param {string} testScript - Test function code
   * @param {boolean} captureScreenshots - Whether to capture screenshots
   * @returns {Promise<Object>} - Test results
   */
  async executeInPage(testScript, captureScreenshots) {
    // This method is called from service worker or side panel
    // It sends a message to service worker to execute the script
    // This is a placeholder - actual implementation depends on where it's called from

    throw new Error('executeInPage must be implemented by caller (service worker or side panel)');
  }

  /**
   * Build complete test execution code
   * Includes test patterns, test script, and execution wrapper
   * @param {string} testScript - Test function code
   * @returns {string} - Complete executable code
   */
  buildExecutionCode(testScript) {
    // Read test patterns code (this would be loaded from file)
    const testPatternsCode = this.getTestPatternsCode();

    return `
// ============================================
// TEST EXECUTION WRAPPER
// ============================================
(async function() {
  const executionResults = {
    startTime: Date.now(),
    endTime: null,
    duration: null,
    status: 'running',
    error: null,
    testResults: null
  };

  try {
    // Inject TestPatterns utilities
    ${testPatternsCode}

    // Inject test script
    ${testScript}

    // Execute test
    console.log('[Test Executor] Running testVariation()...');
    const results = await testVariation();

    executionResults.testResults = results;
    executionResults.status = results.overallStatus || 'completed';
    executionResults.endTime = Date.now();
    executionResults.duration = executionResults.endTime - executionResults.startTime;

    console.log('[Test Executor] Test completed successfully');
    return executionResults;
  } catch (error) {
    console.error('[Test Executor] Test execution error:', error);
    executionResults.status = 'error';
    executionResults.error = error.message;
    executionResults.endTime = Date.now();
    executionResults.duration = executionResults.endTime - executionResults.startTime;
    return executionResults;
  }
})();
`;
  }

  /**
   * Get TestPatterns code as string
   * @returns {string} - TestPatterns code
   */
  getTestPatternsCode() {
    // This would typically be loaded from test-patterns.js
    // For now, returning inline version
    return `
const TestPatterns = {
  async waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(\`[Test] ✓ Found element: \${selector}\`);
        return element;
      }
      await this.wait(100);
    }
    throw new Error(\`Element not found after \${timeout}ms: \${selector}\`);
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async simulateClick(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.click();
      console.log(\`[Test] ✓ Clicked: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(300);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Click failed:', error);
      return false;
    }
  },

  async simulateHover(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      console.log(\`[Test] ✓ Hovered: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(200);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Hover failed:', error);
      return false;
    }
  },

  async simulateExitIntent() {
    try {
      // Trigger both mouseout and mouseleave to cover both patterns
      document.dispatchEvent(new MouseEvent('mouseout', {
        bubbles: true,
        cancelable: true,
        clientY: -10,
        relatedTarget: null
      }));

      document.dispatchEvent(new MouseEvent('mouseleave', {
        bubbles: true,
        cancelable: true,
        clientY: -10,
        relatedTarget: null
      }));

      console.log('[Test] ✓ Exit intent triggered');
      await this.wait(800); // Wait longer for modal/popup to appear and animate
      return true;
    } catch (error) {
      console.error('[Test] ✗ Exit intent failed:', error);
      return false;
    }
  },

  async scrollTo(yPosition) {
    try {
      window.scrollTo({ top: yPosition, behavior: 'smooth' });
      console.log(\`[Test] ✓ Scrolled to: \${yPosition}px\`);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll failed:', error);
      return false;
    }
  },

  async scrollToElement(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log(\`[Test] ✓ Scrolled to element: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll to element failed:', error);
      return false;
    }
  },

  async fillInput(target, value) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(\`[Test] ✓ Filled input: \${typeof target === 'string' ? target : element.tagName}\`);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Fill input failed:', error);
      return false;
    }
  },

  isVisible(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const isHidden = style.display === 'none' ||
                      style.visibility === 'hidden' ||
                      style.opacity === '0';
      return !isHidden && element.offsetParent !== null;
    } catch (error) {
      return false;
    }
  },

  exists(selector) {
    return !!document.querySelector(selector);
  },

  getStyle(target, property) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      if (!element) return null;
      return window.getComputedStyle(element)[property];
    } catch (error) {
      return null;
    }
  },

  getSessionStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ SessionStorage access failed:', error);
      return null;
    }
  },

  getLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ LocalStorage access failed:', error);
      return null;
    }
  },

  countElements(selector) {
    return document.querySelectorAll(selector).length;
  },

  getText(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      return element ? element.textContent.trim() : null;
    } catch (error) {
      return null;
    }
  },

  captureState(label = 'unnamed') {
    return {
      label,
      timestamp: Date.now(),
      url: window.location.href,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  },

  async validate(testName, condition, expectedValue = '', actualValue = '') {
    const passed = typeof condition === 'function' ? await condition() : condition;
    const result = {
      test: testName,
      passed,
      expected: expectedValue,
      actual: actualValue,
      timestamp: Date.now()
    };
    console.log(\`[Test] \${passed ? '✓' : '✗'} \${testName}\`);
    if (!passed && expectedValue && actualValue) {
      console.log(\`  Expected: \${expectedValue}, Actual: \${actualValue}\`);
    }
    return result;
  }
};

if (typeof window !== 'undefined') {
  window.TestPatterns = TestPatterns;
}
`;
  }

  /**
   * Parse test results and extract screenshot markers
   * @param {Object} results - Test execution results
   * @returns {Array} - Screenshot markers with labels
   */
  extractScreenshotMarkers(results) {
    if (!results || !results.testResults) {
      return [];
    }

    const screenshots = results.testResults.screenshots || [];
    return screenshots.filter(s => s.capture).map(s => ({
      label: s.label,
      timestamp: s.timestamp || Date.now()
    }));
  }

  /**
   * Validate test results structure
   * @param {Object} results - Test results to validate
   * @returns {boolean} - Whether results are valid
   */
  validateResults(results) {
    if (!results) return false;

    // Check required fields
    if (!results.testResults) return false;
    if (!Array.isArray(results.testResults.validations)) return false;

    // Check result structure
    const validations = results.testResults.validations;
    return validations.every(v =>
      typeof v.test === 'string' &&
      typeof v.passed === 'boolean'
    );
  }
}

// Export for Chrome extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestScriptExecutor;
}
