/**
 * Experiment History Manager
 * Manages per-domain experiment storage and retrieval
 * Provides session continuity by persisting experiment data
 */
class ExperimentHistory {
  constructor() {
    this.STORAGE_KEY = 'experimentHistory';
    this.MAX_EXPERIMENTS_PER_DOMAIN = 10;
    this.MAX_TOTAL_SIZE_BYTES = 4 * 1024 * 1024; // 4MB conservative limit (Chrome limit is ~5MB)
    this.MAX_SCREENSHOT_SIZE = 500 * 1024; // 500KB max per screenshot (after compression)
    this.COMPRESSION_QUALITY = 0.6; // JPEG quality (0-1)
  }

  /**
   * Compress screenshot to reduce storage size
   * Converts to JPEG and resizes if needed
   */
  async compressScreenshot(dataUrl, maxSizeKB = 500) {
    try {
      // If already small enough, return as-is
      if (dataUrl.length <= maxSizeKB * 1024) {
        console.log(`✅ Screenshot already small enough: ${Math.round(dataUrl.length / 1024)}KB`);
        return dataUrl;
      }

      console.log(`🔄 Compressing screenshot from ${Math.round(dataUrl.length / 1024)}KB...`);

      // Create image element
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      // Calculate new dimensions (max 1200px wide to reduce size)
      const MAX_WIDTH = 1200;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels until we get under the limit
      let quality = this.COMPRESSION_QUALITY;
      let compressed = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        compressed = canvas.toDataURL('image/jpeg', quality);
        const compressedSizeKB = compressed.length / 1024;

        console.log(`  Attempt ${attempt + 1}: quality=${quality.toFixed(2)}, size=${Math.round(compressedSizeKB)}KB`);

        if (compressedSizeKB <= maxSizeKB) {
          console.log(`✅ Screenshot compressed: ${Math.round(dataUrl.length / 1024)}KB → ${Math.round(compressedSizeKB)}KB`);
          return compressed;
        }

        // Reduce quality for next attempt
        quality *= 0.7;
      }

      // If still too large after all attempts, return the best we got
      console.warn(`⚠️ Screenshot still large after compression: ${Math.round(compressed.length / 1024)}KB`);
      return compressed;

    } catch (error) {
      console.error('Screenshot compression failed:', error);
      // Return null if compression fails
      return null;
    }
  }

  /**
   * Extract domain from URL
   */
  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      console.error('Invalid URL:', url);
      return null;
    }
  }

  /**
   * Generate unique experiment ID
   */
  generateExperimentId() {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save or update an experiment
   * @param {string} url - Current page URL
   * @param {object} experimentData - Experiment data to save
   * @returns {Promise<string>} - Experiment ID
   */
  async saveExperiment(url, experimentData) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) {
        throw new Error('Invalid URL for experiment save');
      }

      // Load existing history
      const history = await this.loadHistory();

      // Initialize domain array if needed
      if (!history[domain]) {
        history[domain] = [];
      }

      // Create or update experiment
      const experimentId = experimentData.id || this.generateExperimentId();
      const timestamp = Date.now();

      // Compress screenshot if present
      let optimizedScreenshot = null;
      if (experimentData.screenshot) {
        const originalSize = experimentData.screenshot.length;
        console.log(`📸 Processing screenshot: ${Math.round(originalSize / 1024)}KB`);

        // Compress screenshot to fit storage limits
        optimizedScreenshot = await this.compressScreenshot(
          experimentData.screenshot,
          Math.round(this.MAX_SCREENSHOT_SIZE / 1024)
        );

        if (optimizedScreenshot) {
          const finalSize = optimizedScreenshot.length;
          const savings = Math.round(((originalSize - finalSize) / originalSize) * 100);
          console.log(`✅ Screenshot saved: ${Math.round(finalSize / 1024)}KB (${savings}% reduction)`);
        } else {
          console.warn(`⚠️ Screenshot compression failed, skipping screenshot`);
        }
      }

      // Generate AI title if not provided
      let aiTitle = experimentData.title;
      if (!aiTitle && experimentData.generatedCode) {
        aiTitle = await this.generateAITitle(experimentData);
      }

      const experiment = {
        id: experimentId,
        domain,
        url,
        title: aiTitle || this.extractTitle(experimentData),
        aiGenerated: !!aiTitle && !experimentData.title, // Track if title was AI-generated
        pageTitle: experimentData.pageTitle || '',
        timestamp: experimentData.timestamp || timestamp,
        lastModified: timestamp,

        // Core experiment data
        variations: experimentData.variations || [],
        generatedCode: experimentData.generatedCode || null,

        // Optional metadata
        description: experimentData.description || '',
        screenshot: optimizedScreenshot,
        chatHistory: experimentData.chatHistory || [], // 🆕 Save chat history

        // Convert.com sync metadata
        convertMetadata: experimentData.convertMetadata || {
          accountId: null,
          projectId: null,
          experienceId: null,
          lastSyncedAt: null,
          createdInConvert: false,
          apiKeyId: null // Which API key was used
        },

        // NEVER save pageData - it's huge and causes quota issues
        pageData: null
      };

      // Find and update existing, or add new
      const existingIndex = history[domain].findIndex(exp => exp.id === experimentId);
      if (existingIndex >= 0) {
        history[domain][existingIndex] = experiment;
        console.log(`✅ Updated experiment ${experimentId} for ${domain}`);
      } else {
        history[domain].unshift(experiment); // Add to beginning
        console.log(`✅ Saved new experiment ${experimentId} for ${domain}`);
      }

      // Enforce limits
      this.enforceStorageLimits(history, domain);

      // Check total size before saving
      const historySize = this.estimateSize(history);
      if (historySize > this.MAX_TOTAL_SIZE_BYTES) {
        console.warn(`⚠️ Storage too large (${Math.round(historySize / 1024 / 1024 * 10) / 10}MB), removing old experiments...`);
        this.aggressiveCleanup(history);
      }

      // Save back to storage
      await chrome.storage.local.set({ [this.STORAGE_KEY]: history });

      return experimentId;
    } catch (error) {
      console.error('Failed to save experiment:', error);
      throw error;
    }
  }

  /**
   * Get all experiments for a specific domain
   * @param {string} url - Page URL to extract domain from
   * @returns {Promise<Array>} - Array of experiments, sorted by date (newest first)
   */
  async getExperimentsForDomain(url) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) return [];

      const history = await this.loadHistory();
      let experiments = history[domain] || [];

      // Remove experiments older than 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const beforeCount = experiments.length;
      experiments = experiments.filter(exp => exp.lastModified > thirtyDaysAgo);

      // If any were removed, update storage
      if (experiments.length < beforeCount) {
        history[domain] = experiments;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: history });
        console.log(`🗑️ Removed ${beforeCount - experiments.length} expired experiments (>30 days old)`);
      }

      // Sort by lastModified descending
      return experiments.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      console.error('Failed to get experiments for domain:', error);
      return [];
    }
  }

  /**
   * Get a specific experiment
   * @param {string} url - Page URL
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<object|null>} - Experiment data or null
   */
  async getExperiment(url, experimentId) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) return null;

      const history = await this.loadHistory();
      const experiments = history[domain] || [];

      return experiments.find(exp => exp.id === experimentId) || null;
    } catch (error) {
      console.error('Failed to get experiment:', error);
      return null;
    }
  }

  /**
   * Delete an experiment
   * @param {string} url - Page URL
   * @param {string} experimentId - Experiment ID to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteExperiment(url, experimentId) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) return false;

      const history = await this.loadHistory();
      if (!history[domain]) return false;

      const initialLength = history[domain].length;
      history[domain] = history[domain].filter(exp => exp.id !== experimentId);

      if (history[domain].length === initialLength) {
        return false; // Nothing deleted
      }

      // Clean up empty domain arrays
      if (history[domain].length === 0) {
        delete history[domain];
      }

      await chrome.storage.local.set({ [this.STORAGE_KEY]: history });
      console.log(`✅ Deleted experiment ${experimentId} from ${domain}`);
      return true;
    } catch (error) {
      console.error('Failed to delete experiment:', error);
      return false;
    }
  }

  /**
   * Delete all experiments for a specific URL/domain
   * @param {string} url - Page URL
   * @returns {Promise<boolean>} - Success status
   */
  async deleteAllExperiments(url) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) return false;

      const history = await this.loadHistory();
      if (!history[domain] || history[domain].length === 0) {
        return false; // Nothing to delete
      }

      const count = history[domain].length;

      // Remove all experiments for this domain
      delete history[domain];

      await chrome.storage.local.set({ [this.STORAGE_KEY]: history });
      console.log(`✅ Deleted all ${count} experiments from ${domain}`);
      return true;
    } catch (error) {
      console.error('Failed to delete all experiments:', error);
      return false;
    }
  }

  /**
   * Get all domains with saved experiments
   * @returns {Promise<Array>} - Array of domain names
   */
  async getAllDomains() {
    try {
      const history = await this.loadHistory();
      return Object.keys(history).sort();
    } catch (error) {
      console.error('Failed to get all domains:', error);
      return [];
    }
  }

  /**
   * Get storage usage statistics
   * @returns {Promise<object>} - Storage stats
   */
  async getStorageStats() {
    try {
      const history = await this.loadHistory();
      const domains = Object.keys(history);
      const totalExperiments = domains.reduce((sum, domain) => {
        return sum + history[domain].length;
      }, 0);

      const sizeBytes = this.estimateSize(history);
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      const percentUsed = ((sizeBytes / this.MAX_TOTAL_SIZE_BYTES) * 100).toFixed(1);

      return {
        domains: domains.length,
        totalExperiments,
        sizeMB,
        sizeBytes,
        percentUsed,
        maxSizeMB: (this.MAX_TOTAL_SIZE_BYTES / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { domains: 0, totalExperiments: 0, sizeMB: 0, sizeBytes: 0, percentUsed: 0 };
    }
  }

  /**
   * Clear all experiment history (use with caution)
   * @returns {Promise<boolean>} - Success status
   */
  async clearAllHistory() {
    try {
      await chrome.storage.local.remove([this.STORAGE_KEY]);
      console.log('✅ Cleared all experiment history');
      return true;
    } catch (error) {
      console.error('Failed to clear history:', error);
      return false;
    }
  }

  /**
   * Manually optimize storage by removing old data
   * @returns {Promise<object>} - Cleanup stats
   */
  async optimizeStorage() {
    try {
      const history = await this.loadHistory();
      const beforeSize = this.estimateSize(history);

      // Remove screenshots from experiments older than 3 per domain
      let screenshotsRemoved = 0;
      const domains = Object.keys(history);

      for (const domain of domains) {
        history[domain].forEach((exp, index) => {
          if (index >= 3 && exp.screenshot) {
            exp.screenshot = null;
            screenshotsRemoved++;
          }
        });
      }

      // Save optimized history
      await chrome.storage.local.set({ [this.STORAGE_KEY]: history });

      const afterSize = this.estimateSize(history);
      const savedBytes = beforeSize - afterSize;

      console.log(`🧹 Storage optimized: Removed ${screenshotsRemoved} screenshots, saved ${Math.round(savedBytes / 1024)}KB`);

      return {
        screenshotsRemoved,
        savedBytes,
        savedKB: Math.round(savedBytes / 1024),
        beforeSizeMB: (beforeSize / (1024 * 1024)).toFixed(2),
        afterSizeMB: (afterSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error('Failed to optimize storage:', error);
      throw error;
    }
  }

  /**
   * Load history from storage
   * @private
   */
  async loadHistory() {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      return result[this.STORAGE_KEY] || {};
    } catch (error) {
      console.error('Failed to load history:', error);
      return {};
    }
  }

  /**
   * Enforce storage limits (max experiments per domain)
   * @private
   */
  enforceStorageLimits(history, domain) {
    if (!history[domain]) return;

    // Limit experiments per domain
    if (history[domain].length > this.MAX_EXPERIMENTS_PER_DOMAIN) {
      // Sort by lastModified descending
      history[domain].sort((a, b) => b.lastModified - a.lastModified);

      // Keep only the most recent N
      const removed = history[domain].splice(this.MAX_EXPERIMENTS_PER_DOMAIN);
      console.log(`⚠️ Removed ${removed.length} old experiments from ${domain} (limit: ${this.MAX_EXPERIMENTS_PER_DOMAIN})`);
    }
  }

  /**
   * Estimate size of history object in bytes
   * @private
   */
  estimateSize(history) {
    try {
      const jsonString = JSON.stringify(history);
      return new Blob([jsonString]).size;
    } catch (error) {
      console.error('Failed to estimate size:', error);
      return 0;
    }
  }

  /**
   * Aggressive cleanup when storage is too large
   * Removes old experiments across all domains
   * @private
   */
  aggressiveCleanup(history) {
    const domains = Object.keys(history);
    let totalRemoved = 0;

    // First pass: Remove screenshots from old experiments
    for (const domain of domains) {
      history[domain].forEach((exp, index) => {
        if (index >= 3 && exp.screenshot) { // Keep screenshots only for 3 most recent
          exp.screenshot = null;
          totalRemoved++;
        }
      });
    }

    console.log(`🧹 Aggressive cleanup: Removed ${totalRemoved} screenshots from old experiments`);

    // Second pass: If still too large, reduce experiment count per domain
    const currentSize = this.estimateSize(history);
    if (currentSize > this.MAX_TOTAL_SIZE_BYTES) {
      const reducedLimit = 5; // Reduce to 5 experiments per domain
      for (const domain of domains) {
        if (history[domain].length > reducedLimit) {
          const removed = history[domain].splice(reducedLimit);
          console.log(`🧹 Removed ${removed.length} old experiments from ${domain}`);
        }
      }
    }
  }

  /**
   * Extract a meaningful title from experiment data
   * @private
   */
  extractTitle(experimentData) {
    // Try various sources for title
    if (experimentData.generatedCode?.variations?.[0]?.name) {
      return experimentData.generatedCode.variations[0].name;
    }

    if (experimentData.variations?.[0]?.name) {
      return experimentData.variations[0].name;
    }

    if (experimentData.variations?.[0]?.description) {
      const desc = experimentData.variations[0].description;
      return desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
    }

    if (experimentData.pageTitle) {
      return `Experiment on ${experimentData.pageTitle}`;
    }

    return 'Untitled Experiment';
  }

  /**
   * Format timestamp as relative time
   */
  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  /**
   * Create a lightweight experiment snapshot (without heavy data)
   * Useful for listing experiments without loading full page data
   */
  createSnapshot(experimentData) {
    return {
      id: experimentData.id,
      title: experimentData.title,
      timestamp: experimentData.timestamp,
      lastModified: experimentData.lastModified,
      variationCount: experimentData.variations?.length || 0,
      hasScreenshot: !!experimentData.screenshot,
      url: experimentData.url,
      pageTitle: experimentData.pageTitle,
      isSyncedToConvert: !!experimentData.convertMetadata?.experienceId
    };
  }

  /**
   * Mark experiment as synced to Convert.com
   * @param {string} url - Page URL
   * @param {string} experimentId - Experiment ID
   * @param {object} syncData - { accountId, projectId, experienceId, apiKeyId }
   * @returns {Promise<boolean>} - Success status
   */
  async markAsSynced(url, experimentId, syncData) {
    try {
      const experiment = await this.getExperiment(url, experimentId);
      if (!experiment) {
        throw new Error('Experiment not found');
      }

      experiment.convertMetadata = {
        accountId: syncData.accountId,
        projectId: syncData.projectId,
        experienceId: syncData.experienceId,
        apiKeyId: syncData.apiKeyId,
        lastSyncedAt: Date.now(),
        createdInConvert: true
      };

      await this.saveExperiment(url, experiment);
      console.log(`✅ Marked experiment ${experimentId} as synced to Convert.com`);
      return true;
    } catch (error) {
      console.error('Failed to mark as synced:', error);
      return false;
    }
  }

  /**
   * Update last synced timestamp
   * @param {string} url - Page URL
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncTimestamp(url, experimentId) {
    try {
      const experiment = await this.getExperiment(url, experimentId);
      if (!experiment) {
        throw new Error('Experiment not found');
      }

      if (experiment.convertMetadata) {
        experiment.convertMetadata.lastSyncedAt = Date.now();
        await this.saveExperiment(url, experiment);
        console.log(`✅ Updated sync timestamp for experiment ${experimentId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to update sync timestamp:', error);
      return false;
    }
  }

  /**
   * Generate AI-based title for experiment
   * @param {object} experimentData - Experiment data
   * @returns {Promise<string|null>} - Generated title or null
   */
  async generateAITitle(experimentData) {
    try {
      // Extract variation info for the AI prompt
      const variationInfo = experimentData.generatedCode?.variations?.[0];
      if (!variationInfo) return null;

      // Build a compact summary of what the experiment does
      const summary = [];
      if (variationInfo.name) summary.push(variationInfo.name);
      if (variationInfo.description) summary.push(variationInfo.description);

      // Extract key changes from chat history if available
      const chatContext = experimentData.chatHistory?.slice(0, 3)
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join(' | ');

      if (chatContext) summary.push(chatContext);

      if (summary.length === 0) return null;

      // Call service worker to generate title
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_EXPERIMENT_NAME',
        summary: summary.join(' - ').substring(0, 500) // Limit context size
      });

      if (response.success && response.title) {
        return response.title;
      }

      return null;
    } catch (error) {
      console.warn('AI title generation failed, using fallback:', error);
      return null;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExperimentHistory;
}
