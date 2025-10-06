// Settings page JavaScript
console.log('Settings page loaded');

class SettingsManager {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    await this.renderAPIKeys();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings', 'convertApiKeys']);
      this.settings = result.settings || {};
      this.convertApiKeys = result.convertApiKeys || [];
      
      // Load OpenAI key
      if (this.settings.authToken) {
        document.getElementById('openaiApiKey').value = this.settings.authToken;
      }
      
      // Load model selection
      if (this.settings.model) {
        document.getElementById('modelSelect').value = this.settings.model;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showAlert('Failed to load settings', 'error');
    }
  }

  setupEventListeners() {
    // Add API Key
    document.getElementById('addApiKeyBtn').addEventListener('click', () => {
      this.addAPIKey();
    });

    // Save OpenAI Key
    document.getElementById('saveOpenAIKeyBtn').addEventListener('click', () => {
      this.saveOpenAIKey();
    });

    // Model selection
    document.getElementById('modelSelect').addEventListener('change', (e) => {
      this.saveModel(e.target.value);
    });

    // Enter key support
    document.getElementById('apiKeyLabel').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('apiKeyValue').focus();
      }
    });

    document.getElementById('apiKeyValue').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('apiSecretValue').focus();
      }
    });

    document.getElementById('apiSecretValue').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addAPIKey();
      }
    });

    document.getElementById('openaiApiKey').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveOpenAIKey();
      }
    });
  }

  async addAPIKey() {
    const label = document.getElementById('apiKeyLabel').value.trim();
    const apiKey = document.getElementById('apiKeyValue').value.trim();
    const apiSecret = document.getElementById('apiSecretValue').value.trim();

    if (!label || !apiKey || !apiSecret) {
      this.showAlert('Please fill in label, API key, and API secret', 'error');
      return;
    }

    // Check if label already exists
    if (this.convertApiKeys.some(k => k.label === label)) {
      this.showAlert('A key with this label already exists', 'error');
      return;
    }

    const newKey = {
      id: Date.now().toString(),
      label,
      apiKey,
      apiSecret,
      createdAt: Date.now()
    };

    this.convertApiKeys.push(newKey);

    try {
      await chrome.storage.local.set({ convertApiKeys: this.convertApiKeys });
      this.showAlert(`API credentials "${label}" added successfully`, 'success');
      
      // Clear form
      document.getElementById('apiKeyLabel').value = '';
      document.getElementById('apiKeyValue').value = '';
      document.getElementById('apiSecretValue').value = '';
      
      // Re-render list
      await this.renderAPIKeys();
    } catch (error) {
      console.error('Failed to save API credentials:', error);
      this.showAlert('Failed to save API credentials', 'error');
    }
  }

  async deleteAPIKey(id) {
    if (!confirm('Are you sure you want to delete this API key?')) {
      return;
    }

    this.convertApiKeys = this.convertApiKeys.filter(k => k.id !== id);

    try {
      await chrome.storage.local.set({ convertApiKeys: this.convertApiKeys });
      this.showAlert('API key deleted successfully', 'success');
      await this.renderAPIKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      this.showAlert('Failed to delete API key', 'error');
    }
  }

  async renderAPIKeys() {
    const container = document.getElementById('apiKeysList');

    if (this.convertApiKeys.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔑</div>
          <p>No API keys added yet</p>
          <p style="font-size: 12px; margin-top: 8px;">Add your first Convert.com API key above</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.convertApiKeys.map(key => `
      <div class="api-key-item">
        <div class="api-key-info">
          <div class="api-key-label">${this.escapeHtml(key.label)}</div>
          <div class="api-key-value">
            Key: ${this.maskAPIKey(key.apiKey)}<br>
            Secret: ${this.maskAPIKey(key.apiSecret || 'Not set')}
          </div>
        </div>
        <div class="api-key-actions">
          <button class="btn btn-small btn-danger" onclick="settingsManager.deleteAPIKey('${key.id}')">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  async saveOpenAIKey() {
    const apiKey = document.getElementById('openaiApiKey').value.trim();

    if (!apiKey) {
      this.showAlert('Please enter an OpenAI API key', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      this.showAlert('Invalid OpenAI API key format (should start with "sk-")', 'error');
      return;
    }

    try {
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      settings.authToken = apiKey;
      
      await chrome.storage.local.set({ settings });
      this.settings = settings;
      
      this.showAlert('OpenAI API key saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save OpenAI key:', error);
      this.showAlert('Failed to save OpenAI key', 'error');
    }
  }

  async saveModel(model) {
    try {
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      settings.model = model;
      
      await chrome.storage.local.set({ settings });
      this.settings = settings;
      
      this.showAlert(`Model changed to ${model}`, 'success');
    } catch (error) {
      console.error('Failed to save model:', error);
      this.showAlert('Failed to save model', 'error');
    }
  }

  maskAPIKey(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return '••••••••';
    }
    const start = apiKey.substring(0, 4);
    const end = apiKey.substring(apiKey.length - 4);
    return `${start}${'•'.repeat(Math.min(apiKey.length - 8, 20))}${end}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;
    alert.textContent = message;
    
    container.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Initialize
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
  settingsManager = new SettingsManager();
});
