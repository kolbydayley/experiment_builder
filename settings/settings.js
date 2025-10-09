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

      // Load provider selection
      const provider = this.settings.provider || 'anthropic';
      document.getElementById('providerSelect').value = provider;
      this.updateProviderSections(provider);

      // Load OpenAI key
      if (this.settings.authToken) {
        document.getElementById('openaiApiKey').value = this.settings.authToken;
      }

      // Load Anthropic key
      if (this.settings.anthropicApiKey) {
        document.getElementById('anthropicApiKey').value = this.settings.anthropicApiKey;
      }

      // Load model selection
      if (this.settings.model) {
        document.getElementById('modelSelect').value = this.settings.model;
      }

      // Load code generation preferences
      document.getElementById('preferCSS').checked = this.settings.preferCSS !== false;
      document.getElementById('includeDOMChecks').checked = this.settings.includeDOMChecks !== false;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showAlert('Failed to load settings', 'error');
    }
  }

  setupEventListeners() {
    // Template Manager Event Listeners
    this.setupTemplateEventListeners();
    
    // Provider selection
    document.getElementById('providerSelect').addEventListener('change', (e) => {
      const provider = e.target.value;
      this.saveProvider(provider);
      this.updateProviderSections(provider);
    });

    // Add API Key
    document.getElementById('addApiKeyBtn').addEventListener('click', () => {
      this.addAPIKey();
    });

    // Save OpenAI Key
    document.getElementById('saveOpenAIKeyBtn').addEventListener('click', () => {
      this.saveOpenAIKey();
    });

    // Save Anthropic Key
    document.getElementById('saveAnthropicKeyBtn').addEventListener('click', () => {
      this.saveAnthropicKey();
    });

    // Model selection
    document.getElementById('modelSelect').addEventListener('change', (e) => {
      this.saveModel(e.target.value);
    });

    // Code generation preferences
    document.getElementById('preferCSS')?.addEventListener('change', (e) => {
      this.saveCodePreference('preferCSS', e.target.checked);
    });

    document.getElementById('includeDOMChecks')?.addEventListener('change', (e) => {
      this.saveCodePreference('includeDOMChecks', e.target.checked);
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

  async saveProvider(provider) {
    try {
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      settings.provider = provider;

      // Set default model based on provider
      if (provider === 'anthropic' && !settings.model?.startsWith('claude')) {
        settings.model = 'claude-3-5-sonnet-20240620'; // Claude 3.5 Sonnet (stable)
      } else if (provider === 'openai' && !settings.model?.startsWith('gpt')) {
        settings.model = 'gpt-4o-mini';
      }

      await chrome.storage.local.set({ settings });
      this.settings = settings;

      // Update model selector
      document.getElementById('modelSelect').value = settings.model;

      this.showAlert(`Provider changed to ${provider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI GPT'}`, 'success');
    } catch (error) {
      console.error('Failed to save provider:', error);
      this.showAlert('Failed to save provider', 'error');
    }
  }

  updateProviderSections(provider) {
    const openaiSection = document.getElementById('openaiSection');
    const anthropicSection = document.getElementById('anthropicSection');

    if (provider === 'anthropic') {
      openaiSection.style.display = 'none';
      anthropicSection.style.display = 'block';
    } else {
      openaiSection.style.display = 'block';
      anthropicSection.style.display = 'none';
    }
  }

  async saveAnthropicKey() {
    try {
      const apiKey = document.getElementById('anthropicApiKey').value.trim();

      if (!apiKey) {
        this.showAlert('Please enter an Anthropic API key', 'error');
        return;
      }

      if (!apiKey.startsWith('sk-ant-')) {
        this.showAlert('Invalid Anthropic API key format (should start with sk-ant-)', 'error');
        return;
      }

      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      settings.anthropicApiKey = apiKey;

      await chrome.storage.local.set({ settings });
      this.settings = settings;

      this.showAlert('Anthropic API key saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save Anthropic key:', error);
      this.showAlert('Failed to save Anthropic API key', 'error');
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

  async saveCodePreference(key, value) {
    try {
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      settings[key] = value;

      await chrome.storage.local.set({ settings });
      this.settings = settings;

      const label = key === 'preferCSS' ? 'CSS preference' : 'DOM checks';
      this.showAlert(`${label} ${value ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      console.error('Failed to save code preference:', error);
      this.showAlert('Failed to save preference', 'error');
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

  // TEMPLATE MANAGER METHODS
  setupTemplateEventListeners() {
    // Add new template button
    document.getElementById('addNewTemplateBtn').addEventListener('click', () => {
      this.showAddTemplateForm();
    });

    // Cancel template form
    document.getElementById('cancelTemplateBtn').addEventListener('click', () => {
      this.hideAddTemplateForm();
    });

    // Add variation button
    document.getElementById('addVariationBtn').addEventListener('click', () => {
      this.addVariationForm();
    });

    // Save template button
    document.getElementById('saveTemplateBtn').addEventListener('click', () => {
      this.saveNewTemplate();
    });

    // Import template
    document.getElementById('importTemplateBtn').addEventListener('click', () => {
      this.showImportModal();
    });

    // Export templates
    document.getElementById('exportTemplatesBtn').addEventListener('click', () => {
      this.exportTemplates();
    });

    // Import modal buttons
    document.getElementById('confirmImportBtn').addEventListener('click', () => {
      this.importTemplate();
    });

    document.getElementById('cancelImportBtn').addEventListener('click', () => {
      this.hideImportModal();
    });

    // Close modals on background click
    document.getElementById('templateEditModal').addEventListener('click', (e) => {
      if (e.target.id === 'templateEditModal') {
        this.hideEditModal();
      }
    });

    document.getElementById('importTemplateModal').addEventListener('click', (e) => {
      if (e.target.id === 'importTemplateModal') {
        this.hideImportModal();
      }
    });
  }

  async loadTemplates() {
    try {
      const result = await chrome.storage.local.get(['customTemplates']);
      this.customTemplates = result.customTemplates || {};

      // Merge built-in templates with custom templates
      // Built-in templates from default-templates.js are available as DEFAULT_TEMPLATES
      this.allTemplates = {
        ...DEFAULT_TEMPLATES,  // Built-in templates
        ...this.customTemplates  // Custom templates (can override built-in)
      };

      this.renderTemplates();
    } catch (error) {
      console.error('Failed to load templates:', error);
      this.showAlert('Failed to load templates', 'error');
    }
  }

  async init() {
    await this.loadSettings();
    await this.loadTemplates();
    this.setupEventListeners();
    this.setupTemplateEventListeners();
    await this.renderAPIKeys();
  }

  renderTemplates() {
    const container = document.getElementById('templatesList');

    if (!this.allTemplates || Object.keys(this.allTemplates).length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p>No templates available</p>
        </div>
      `;
      return;
    }

    container.innerHTML = Object.entries(this.allTemplates).map(([id, template]) => {
      const isBuiltIn = DEFAULT_TEMPLATES.hasOwnProperty(id);
      const isCustom = this.customTemplates.hasOwnProperty(id);

      return `
        <div class="template-item">
          <div class="template-info">
            <div class="template-header">
              <span style="font-size: 18px;">${template.icon}</span>
              <span class="template-name">${template.name}</span>
              ${isBuiltIn && !isCustom ? '<span class="variation-tag" style="background: #28a745;">Built-in</span>' : ''}
              ${isCustom ? '<span class="variation-tag" style="background: #007bff;">Custom</span>' : ''}
              <span class="variation-tag">${template.variations.length} variation${template.variations.length === 1 ? '' : 's'}</span>
            </div>
            <div class="template-description">${template.description}</div>
            <div class="template-variations">
              ${template.variations.map(v => `<span class="variation-tag">${v.name}</span>`).join('')}
            </div>
          </div>
          <div class="template-actions">
            ${isCustom ? `
              <button class="btn btn-primary btn-small" onclick="settingsManager.editTemplate('${id}')">
                Edit
              </button>
            ` : `
              <button class="btn btn-primary btn-small" onclick="settingsManager.duplicateTemplate('${id}')">
                Copy to Custom
              </button>
            `}
            <button class="btn btn-primary btn-small" onclick="settingsManager.exportTemplate('${id}')">
              Export
            </button>
            ${isCustom ? `
              <button class="btn btn-danger btn-small" onclick="settingsManager.deleteTemplate('${id}')">
                Delete
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  showAddTemplateForm() {
    document.getElementById('newTemplateForm').style.display = 'block';
    document.getElementById('addNewTemplateBtn').style.display = 'none';
    this.clearTemplateForm();
    this.addVariationForm(); // Add first variation
  }

  hideAddTemplateForm() {
    document.getElementById('newTemplateForm').style.display = 'none';
    document.getElementById('addNewTemplateBtn').style.display = 'block';
    this.clearTemplateForm();
  }

  clearTemplateForm() {
    document.getElementById('templateId').value = '';
    document.getElementById('templateName').value = '';
    document.getElementById('templateDescription').value = '';
    document.getElementById('templateIcon').value = '';
    document.getElementById('variationsContainer').innerHTML = '';
  }

  addVariationForm() {
    const container = document.getElementById('variationsContainer');
    const variationCount = container.children.length + 1;
    
    const variationForm = document.createElement('div');
    variationForm.className = 'variation-form';
    variationForm.innerHTML = `
      <div class="variation-header">
        <span class="variation-number">Variation ${variationCount}</span>
        <button type="button" class="remove-variation-btn" onclick="this.parentElement.parentElement.remove()">
          Remove
        </button>
      </div>
      <div class="form-group">
        <label>Variation Name</label>
        <input type="text" class="variation-name" placeholder="e.g., Bold Red Button" required>
      </div>
      <div class="form-group">
        <label>Instructions</label>
        <textarea class="variation-instructions" placeholder="Describe what changes this variation should make..." required></textarea>
      </div>
    `;
    
    container.appendChild(variationForm);
  }

  async saveNewTemplate() {
    try {
      const templateId = document.getElementById('templateId').value.trim();
      const templateName = document.getElementById('templateName').value.trim();
      const templateDescription = document.getElementById('templateDescription').value.trim();
      const templateIcon = document.getElementById('templateIcon').value.trim();

      if (!templateId || !templateName || !templateDescription || !templateIcon) {
        this.showAlert('Please fill in all required fields', 'error');
        return;
      }

      if (!/^[a-z0-9-]+$/.test(templateId)) {
        this.showAlert('Template ID must be lowercase letters, numbers, and hyphens only', 'error');
        return;
      }

      if (this.customTemplates[templateId]) {
        this.showAlert('Template ID already exists', 'error');
        return;
      }

      // Collect variations
      const variationForms = document.querySelectorAll('.variation-form');
      if (variationForms.length === 0) {
        this.showAlert('Please add at least one variation', 'error');
        return;
      }

      const variations = [];
      for (const form of variationForms) {
        const name = form.querySelector('.variation-name').value.trim();
        const instructions = form.querySelector('.variation-instructions').value.trim();
        
        if (!name || !instructions) {
          this.showAlert('Please fill in all variation fields', 'error');
          return;
        }

        variations.push({ name, instructions });
      }

      // Save template
      const template = {
        name: templateName,
        description: templateDescription,
        icon: templateIcon,
        variations: variations,
        created: new Date().toISOString(),
        custom: true
      };

      this.customTemplates[templateId] = template;
      await chrome.storage.local.set({ customTemplates: this.customTemplates });

      this.showAlert('Template saved successfully!', 'success');
      this.hideAddTemplateForm();
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      this.showAlert('Failed to save template', 'error');
    }
  }

  async deleteTemplate(templateId) {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      delete this.customTemplates[templateId];
      await chrome.storage.local.set({ customTemplates: this.customTemplates });
      
      this.showAlert('Template deleted successfully', 'success');
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      this.showAlert('Failed to delete template', 'error');
    }
  }

  duplicateTemplate(templateId) {
    // Get template from allTemplates (could be built-in or custom)
    const template = this.allTemplates[templateId];
    if (!template) return;

    const newId = `${templateId}-copy`;
    let counter = 1;
    let finalId = newId;

    // Check both custom and built-in to ensure unique ID
    while (this.allTemplates[finalId]) {
      finalId = `${newId}-${counter}`;
      counter++;
    }

    // Save to customTemplates (not built-in)
    this.customTemplates[finalId] = {
      ...template,
      id: finalId,
      name: `${template.name} (Copy)`,
      created: new Date().toISOString()
    };

    chrome.storage.local.set({ customTemplates: this.customTemplates });
    this.showAlert('Template copied to custom templates', 'success');
    this.loadTemplates(); // Reload to refresh allTemplates
  }

  exportTemplate(templateId) {
    // Export from allTemplates (works for both built-in and custom)
    const template = this.allTemplates[templateId];
    if (!template) return;

    const exportData = {
      [templateId]: template
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `template-${templateId}.json`;
    link.click();

    this.showAlert('Template exported successfully', 'success');
  }

  exportTemplates() {
    if (Object.keys(this.customTemplates).length === 0) {
      this.showAlert('No templates to export', 'error');
      return;
    }

    const dataStr = JSON.stringify(this.customTemplates, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'all-templates.json';
    link.click();
    
    this.showAlert('All templates exported successfully', 'success');
  }

  showImportModal() {
    document.getElementById('importTemplateModal').style.display = 'block';
    document.getElementById('importTemplateData').value = '';
  }

  hideImportModal() {
    document.getElementById('importTemplateModal').style.display = 'none';
  }

  async importTemplate() {
    try {
      const jsonData = document.getElementById('importTemplateData').value.trim();
      if (!jsonData) {
        this.showAlert('Please paste template JSON data', 'error');
        return;
      }

      const templates = JSON.parse(jsonData);
      
      let importedCount = 0;
      let skippedCount = 0;

      for (const [id, template] of Object.entries(templates)) {
        if (this.customTemplates[id]) {
          skippedCount++;
          continue;
        }

        // Validate template structure
        if (!template.name || !template.variations || !Array.isArray(template.variations)) {
          this.showAlert('Invalid template format', 'error');
          return;
        }

        this.customTemplates[id] = {
          ...template,
          imported: new Date().toISOString(),
          custom: true
        };
        importedCount++;
      }

      await chrome.storage.local.set({ customTemplates: this.customTemplates });
      
      let message = `${importedCount} template(s) imported successfully`;
      if (skippedCount > 0) {
        message += `, ${skippedCount} skipped (already exists)`;
      }
      
      this.showAlert(message, 'success');
      this.hideImportModal();
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to import template:', error);
      this.showAlert('Failed to import template. Please check the JSON format.', 'error');
    }
  }

  editTemplate(templateId) {
    const template = this.customTemplates[templateId];
    if (!template) return;

    const modal = document.getElementById('templateEditModal');
    const content = document.getElementById('editTemplateContent');
    
    content.innerHTML = `
      <div class="form-group">
        <label>Template Name</label>
        <input type="text" id="editTemplateName" value="${template.name}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="editTemplateDescription" value="${template.description}">
      </div>
      <div class="form-group">
        <label>Icon</label>
        <input type="text" id="editTemplateIcon" value="${template.icon}" maxlength="2">
      </div>
      <div class="form-group">
        <label>Variations</label>
        <div id="editVariationsContainer">
          ${template.variations.map((variation, index) => `
            <div class="variation-form">
              <div class="variation-header">
                <span class="variation-number">Variation ${index + 1}</span>
                <button type="button" class="remove-variation-btn" onclick="this.parentElement.parentElement.remove()">
                  Remove
                </button>
              </div>
              <div class="form-group">
                <label>Name</label>
                <input type="text" class="variation-name" value="${variation.name}">
              </div>
              <div class="form-group">
                <label>Instructions</label>
                <textarea class="variation-instructions">${variation.instructions}</textarea>
              </div>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn btn-primary btn-small" onclick="settingsManager.addEditVariationForm()">
          Add Variation
        </button>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button class="btn btn-primary" onclick="settingsManager.saveEditedTemplate('${templateId}')">
          Save Changes
        </button>
        <button class="btn btn-danger" onclick="settingsManager.hideEditModal()">
          Cancel
        </button>
      </div>
    `;
    
    modal.style.display = 'block';
  }

  addEditVariationForm() {
    const container = document.getElementById('editVariationsContainer');
    const variationCount = container.children.length + 1;
    
    const variationForm = document.createElement('div');
    variationForm.className = 'variation-form';
    variationForm.innerHTML = `
      <div class="variation-header">
        <span class="variation-number">Variation ${variationCount}</span>
        <button type="button" class="remove-variation-btn" onclick="this.parentElement.parentElement.remove()">
          Remove
        </button>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" class="variation-name" placeholder="Variation name" required>
      </div>
      <div class="form-group">
        <label>Instructions</label>
        <textarea class="variation-instructions" placeholder="Instructions for this variation" required></textarea>
      </div>
    `;
    
    container.appendChild(variationForm);
  }

  async saveEditedTemplate(templateId) {
    try {
      const name = document.getElementById('editTemplateName').value.trim();
      const description = document.getElementById('editTemplateDescription').value.trim();
      const icon = document.getElementById('editTemplateIcon').value.trim();

      if (!name || !description || !icon) {
        this.showAlert('Please fill in all required fields', 'error');
        return;
      }

      // Collect variations
      const variationForms = document.querySelectorAll('#editVariationsContainer .variation-form');
      if (variationForms.length === 0) {
        this.showAlert('Please add at least one variation', 'error');
        return;
      }

      const variations = [];
      for (const form of variationForms) {
        const varName = form.querySelector('.variation-name').value.trim();
        const instructions = form.querySelector('.variation-instructions').value.trim();
        
        if (!varName || !instructions) {
          this.showAlert('Please fill in all variation fields', 'error');
          return;
        }

        variations.push({ name: varName, instructions });
      }

      // Update template
      this.customTemplates[templateId] = {
        ...this.customTemplates[templateId],
        name,
        description,
        icon,
        variations,
        modified: new Date().toISOString()
      };

      await chrome.storage.local.set({ customTemplates: this.customTemplates });
      
      this.showAlert('Template updated successfully', 'success');
      this.hideEditModal();
      this.renderTemplates();
    } catch (error) {
      console.error('Failed to update template:', error);
      this.showAlert('Failed to update template', 'error');
    }
  }

  hideEditModal() {
    document.getElementById('templateEditModal').style.display = 'none';
  }
}

// Initialize
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
  settingsManager = new SettingsManager();
});
