/**
 * Convert.com API Integration Service
 * Handles all interactions with Convert.com REST API
 *
 * API Documentation: https://api.convert.com/doc/serving/
 */
class ConvertAPI {
  constructor() {
    this.BASE_URL = 'https://api.convert.com/v1';
  }

  /**
   * Make authenticated API request
   * @private
   */
  async makeRequest(endpoint, credentials, options = {}) {
    const { apiKey, apiSecret } = credentials;

    if (!apiKey || !apiSecret) {
      throw new Error('API credentials required');
    }

    const url = `${this.BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}:${apiSecret}`
    };

    try {
      console.log(`[Convert API] ${options.method || 'GET'} ${endpoint}`);

      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Convert API] Error ${response.status}:`, errorText);
        throw new Error(`Convert.com API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log(`[Convert API] Success:`, data);
      return data;
    } catch (error) {
      console.error('[Convert API] Request failed:', error);
      throw error;
    }
  }

  /**
   * List all accounts accessible with the API key
   * @param {object} credentials - { apiKey, apiSecret }
   * @returns {Promise<Array>} - Array of accounts
   */
  async listAccounts(credentials) {
    try {
      const response = await this.makeRequest('/accounts', credentials);
      return response.data || [];
    } catch (error) {
      console.error('[Convert API] Failed to list accounts:', error);
      throw error;
    }
  }

  /**
   * List all projects for a specific account
   * @param {object} credentials - { apiKey, apiSecret }
   * @param {string} accountId - Account ID
   * @returns {Promise<Array>} - Array of projects
   */
  async listProjects(credentials, accountId) {
    try {
      const response = await this.makeRequest(
        `/accounts/${accountId}/projects`,
        credentials
      );
      return response.data || [];
    } catch (error) {
      console.error('[Convert API] Failed to list projects:', error);
      throw error;
    }
  }

  /**
   * Create a new experience (A/B test) in Convert.com
   * @param {object} credentials - { apiKey, apiSecret }
   * @param {string} projectId - Project ID
   * @param {object} experimentData - Experiment data from extension
   * @returns {Promise<object>} - Created experience object
   */
  async createExperience(credentials, projectId, experimentData) {
    try {
      const { name, pageUrl, variations, globalCSS, globalJS } = experimentData;

      // Format variations for Convert.com
      const formattedVariations = this.formatVariationsForConvert(
        variations,
        globalCSS,
        globalJS
      );

      const payload = {
        name: name || 'Unnamed Experiment',
        site_area: {
          match_type: 'simple',
          match_string: pageUrl || window.location.href
        },
        type: 'ab',
        status: 'draft',
        variations: formattedVariations
      };

      console.log('[Convert API] Creating experience:', payload);

      const response = await this.makeRequest(
        `/projects/${projectId}/experiences`,
        credentials,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      return response.data;
    } catch (error) {
      console.error('[Convert API] Failed to create experience:', error);
      throw error;
    }
  }

  /**
   * Update an existing experience
   * @param {object} credentials - { apiKey, apiSecret }
   * @param {string} experienceId - Experience ID
   * @param {object} experimentData - Updated experiment data
   * @returns {Promise<object>} - Updated experience object
   */
  async updateExperience(credentials, experienceId, experimentData) {
    try {
      const { variations, globalCSS, globalJS } = experimentData;

      // Format variations for Convert.com
      const formattedVariations = this.formatVariationsForConvert(
        variations,
        globalCSS,
        globalJS
      );

      const payload = {
        variations: formattedVariations
      };

      console.log('[Convert API] Updating experience:', experienceId, payload);

      const response = await this.makeRequest(
        `/experiences/${experienceId}`,
        credentials,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        }
      );

      return response.data;
    } catch (error) {
      console.error('[Convert API] Failed to update experience:', error);
      throw error;
    }
  }

  /**
   * Format variations for Convert.com API
   * Convert.com requires all code in JavaScript (CSS wrapped in JS)
   * @private
   */
  formatVariationsForConvert(variations, globalCSS, globalJS) {
    if (!variations || !Array.isArray(variations)) {
      throw new Error('Variations must be an array');
    }

    return variations.map((variation, index) => {
      // Combine variation CSS with global CSS
      const fullCSS = [
        globalCSS || '',
        variation.css || ''
      ].filter(Boolean).join('\n\n');

      // Combine variation JS with global JS
      const fullJS = [
        globalJS || '',
        variation.js || ''
      ].filter(Boolean).join('\n\n');

      // Wrap CSS in JavaScript (Convert.com requirement)
      const cssAsJS = fullCSS ? this.wrapCSSInJS(fullCSS) : '';

      // Combine CSS-as-JS with actual JS
      const finalJS = [cssAsJS, fullJS]
        .filter(Boolean)
        .join('\n\n');

      return {
        name: variation.name || `Variation ${index + 1}`,
        js: finalJS,
        // Note: Convert.com only uses JS field, but we include css for reference
        css: '', // Leave empty since CSS is wrapped in JS
        traffic_allocation: index === 0 ? 50 : Math.floor(50 / (variations.length - 1))
      };
    });
  }

  /**
   * Wrap CSS in JavaScript for Convert.com
   * Convert.com requires all changes in JS, so CSS must be injected via script
   * @private
   */
  wrapCSSInJS(css) {
    if (!css || !css.trim()) return '';

    // Escape backticks and backslashes in CSS
    const escapedCSS = css
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`');

    return `(function() {
  var convertStyle = document.createElement('style');
  convertStyle.id = 'convert-injected-css-' + Date.now();
  convertStyle.textContent = \`${escapedCSS}\`;
  document.head.appendChild(convertStyle);

  // Cleanup function (optional - Convert.com handles cleanup)
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerElement(convertStyle, 'Convert.com injected CSS');
  }
})();`;
  }

  /**
   * Get experience details
   * @param {object} credentials - { apiKey, apiSecret }
   * @param {string} experienceId - Experience ID
   * @returns {Promise<object>} - Experience object
   */
  async getExperience(credentials, experienceId) {
    try {
      const response = await this.makeRequest(
        `/experiences/${experienceId}`,
        credentials
      );
      return response.data;
    } catch (error) {
      console.error('[Convert API] Failed to get experience:', error);
      throw error;
    }
  }

  /**
   * Validate API credentials
   * @param {object} credentials - { apiKey, apiSecret }
   * @returns {Promise<boolean>} - True if valid
   */
  async validateCredentials(credentials) {
    try {
      await this.listAccounts(credentials);
      return true;
    } catch (error) {
      console.error('[Convert API] Invalid credentials:', error);
      return false;
    }
  }

  /**
   * Helper: Get credentials from stored API key
   * @param {string} apiKeyId - API key ID from settings
   * @returns {Promise<object>} - { apiKey, apiSecret }
   */
  async getCredentialsFromStorage(apiKeyId) {
    try {
      const result = await chrome.storage.local.get(['convertApiKeys']);
      const apiKeys = result.convertApiKeys || [];

      const stored = apiKeys.find(k => k.id === apiKeyId);
      if (!stored) {
        throw new Error('API key not found');
      }

      return {
        apiKey: stored.apiKey,
        apiSecret: stored.apiSecret
      };
    } catch (error) {
      console.error('[Convert API] Failed to get credentials:', error);
      throw error;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConvertAPI;
}
