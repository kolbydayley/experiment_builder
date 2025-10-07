/**
 * Feature Flag System for Gradual Rollout
 * Allows safe A/B testing and immediate rollback capability
 */
class FeatureFlags {
  constructor() {
    this.flags = {
      'workspace_v2': false,           // New unified interface
      'conversation_first': false,     // Chat-driven workflow
      'smart_auto_actions': false,     // Intelligent automation
      'command_palette': false,        // Universal command access
      'progressive_disclosure': false,  // Advanced features hiding
      'performance_monitoring': true   // Always enabled for safety
    };
    
    this.userSegments = {
      'beta_testers': ['user_id_1', 'user_id_2'], // Specific user IDs
      'power_users': [],                           // Users with advanced usage
      'new_users': []                              // First-time users
    };
    
    this.rolloutPercentages = {
      'workspace_v2': 0,           // Start at 0%, gradually increase
      'conversation_first': 0,
      'smart_auto_actions': 0,
      'command_palette': 0,
      'progressive_disclosure': 0
    };
  }

  async initialize() {
    // Load flags from storage
    const stored = await chrome.storage.local.get(['featureFlags', 'userSegment']);
    if (stored.featureFlags) {
      Object.assign(this.flags, stored.featureFlags);
    }
    
    // Determine user segment
    this.userSegment = stored.userSegment || await this.determineUserSegment();
    
    // Apply rollout logic
    this.applyRolloutLogic();
  }

  async determineUserSegment() {
    // Analyze usage patterns to segment users
    const usage = await chrome.storage.local.get(['usageStats', 'firstUse']);
    
    if (!usage.firstUse) {
      return 'new_users';
    }
    
    const stats = usage.usageStats || {};
    if (stats.advancedFeaturesUsed > 10) {
      return 'power_users';
    }
    
    return 'general_users';
  }

  applyRolloutLogic() {
    // Apply segment-specific overrides
    if (this.userSegment === 'beta_testers') {
      // Beta testers get all new features
      Object.keys(this.flags).forEach(flag => {
        if (flag !== 'performance_monitoring') {
          this.flags[flag] = true;
        }
      });
    } else if (this.userSegment === 'new_users') {
      // New users get simplified interface by default when ready
      this.flags.workspace_v2 = this.rolloutPercentages.workspace_v2 > Math.random() * 100;
    }
  }

  isEnabled(flagName) {
    return this.flags[flagName] === true;
  }

  async enable(flagName) {
    this.flags[flagName] = true;
    await this.save();
    this.notifyChange(flagName, true);
  }

  async disable(flagName) {
    this.flags[flagName] = false;
    await this.save();
    this.notifyChange(flagName, false);
  }

  async save() {
    await chrome.storage.local.set({
      featureFlags: this.flags,
      userSegment: this.userSegment
    });
  }

  notifyChange(flagName, enabled) {
    // Notify components of flag changes
    window.dispatchEvent(new CustomEvent('featureFlagChanged', {
      detail: { flagName, enabled }
    }));
  }

  // Emergency rollback - instantly disable all experimental features
  async emergencyRollback() {
    const safeFlags = {
      'workspace_v2': false,
      'conversation_first': false,
      'smart_auto_actions': false,
      'command_palette': false,
      'progressive_disclosure': false,
      'performance_monitoring': true
    };
    
    this.flags = safeFlags;
    await this.save();
    
    // Force reload to original interface
    window.location.reload();
  }

  // Performance monitoring integration
  reportPerformance(metric, value) {
    if (this.isEnabled('performance_monitoring')) {
      // Log performance metrics for analysis
      chrome.storage.local.get(['performanceMetrics']).then(result => {
        const metrics = result.performanceMetrics || {};
        const timestamp = Date.now();
        
        if (!metrics[metric]) metrics[metric] = [];
        metrics[metric].push({ timestamp, value, interface: this.getActiveInterface() });
        
        // Keep only last 100 measurements per metric
        metrics[metric] = metrics[metric].slice(-100);
        
        chrome.storage.local.set({ performanceMetrics: metrics });
      });
    }
  }

  getActiveInterface() {
    return this.isEnabled('workspace_v2') ? 'v2' : 'v1';
  }
}

// Global instance
window.featureFlags = new FeatureFlags();

// Initialize on load
window.featureFlags.initialize().catch(console.error);