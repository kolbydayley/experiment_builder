// Experiment Builder - Redesigned with Auto-Iteration
console.log('🎨 Experiment Builder Loading...');

class ExperimentBuilder {
  constructor() {
    this.currentPageData = null;
    this.variations = [{ id: 1, name: 'Variation 1', description: '' }];
    this.generatedCode = null;
    this.editedCode = {}; // Track edited code blocks
    this.settings = {
      preferCSS: true,
      includeDOMChecks: true,
      authToken: '',
      model: 'gpt-4o-mini'
    };

    this.focusedVariationId = this.variations[0].id;
    this.aiActivity = { status: 'idle', message: '' };

    this.activePanel = 'build';
    this.conversation = [];
    this.chatState = { sending: false };
    this.messageCounter = 0;

    // Auto-iteration state
    this.autoIteration = {
      active: false,
      currentVariation: null,
      iterations: 0,
      maxIterations: 5,
      startTime: null
    };

    // Usage tracking
    this.usageStats = {
      tokens: 0,
      cost: 0
    };

    // Persisted usage storage area
    this.usageStorage = this.getUsageStorageArea();

    // Manual preview state tracking
    this.previewState = {
      activeVariation: null
    };

    // Capture mode (full page or element)
    this.captureMode = 'full';

    // Initialize utility classes
    this.sessionManager = new SessionManager(this);
    this.keyboardShortcuts = new KeyboardShortcuts(this);
    this.promptAssistant = new PromptAssistant();
    this.designFileManager = new DesignFileManager();
    this.convertSmartLists = new ConvertSmartLists();

    this.initializeConvertState();

    this.initializeUI();
    this.bindEvents();
    this.loadSettings();
    this.loadUsageStats();
    this.loadCurrentPage();
    this.loadConvertAPIKeys(); // Load Convert.com API keys

    // Initialize utilities
    this.initializeUtilities();
  }

  initializeUI() {
    this.initializeNavigation();
    this.renderVariations();
    this.updateFocusedVariationWorkspace();
    this.updateCharCounter();
    this.renderConversation();
    this.setAiActivity('idle', 'Ready to review updates.');
    this.addStatusLog('Ready to generate experiments', 'info');
  }

  bindEvents() {
    // Capture events
    document.getElementById('captureBtn').addEventListener('click', () => this.capturePage());
    document.getElementById('recaptureBtn')?.addEventListener('click', () => this.capturePage());

    // Text input
    document.getElementById('descriptionText').addEventListener('input', () => this.updateCharCounter());

    // Variations
    document.getElementById('addVariationBtn').addEventListener('click', () => this.addVariation());

    // Settings
    const openSettingsBtn = document.getElementById('openFullSettingsBtn');
    openSettingsBtn?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    const preferCSS = document.getElementById('preferCSS');
    preferCSS?.addEventListener('change', (e) => {
      this.settings.preferCSS = e.target.checked;
      this.saveSettings();
    });

    const includeDOMChecks = document.getElementById('includeDOMChecks');
    includeDOMChecks?.addEventListener('change', (e) => {
      this.settings.includeDOMChecks = e.target.checked;
      this.saveSettings();
    });

    const modelSelect = document.getElementById('modelSelect');
    modelSelect?.addEventListener('change', (e) => {
      this.settings.model = e.target.value;
      this.saveSettings();
    });

    const editVariationsBtn = document.getElementById('editVariationsBtn');
    editVariationsBtn?.addEventListener('click', () => {
      this.switchPanel('build');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const switchFocusBtn = document.getElementById('switchFocusBtn');
    switchFocusBtn?.addEventListener('click', () => this.showVariationSwitcher());

    // Generate
    document.getElementById('generateBtn').addEventListener('click', () => this.generateAndAutoTest());

    // Results actions
    document.getElementById('stopIterationBtn')?.addEventListener('click', () => this.stopIteration());
    document.getElementById('exportAllBtn')?.addEventListener('click', () => this.exportAll());
    document.getElementById('clearResultsBtn')?.addEventListener('click', () => this.clearResults());
    document.getElementById('copyLogBtn')?.addEventListener('click', () => this.copyLog());
    document.getElementById('clearPreviewBtn')?.addEventListener('click', () => this.clearVariationPreview());

    const chatForm = document.getElementById('chatComposer');
    if (chatForm) {
      chatForm.addEventListener('submit', (event) => this.handleChatSubmit(event));
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          this.handleChatSubmit(event);
        }
      });
    }
    
    // Convert.com integration
    document.getElementById('manageConvertKeysBtn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('convertApiKeySelect')?.addEventListener('change', () => this.onConvertApiKeyChange());
    document.getElementById('convertAccountSelect')?.addEventListener('change', () => this.onConvertAccountChange());
    document.getElementById('convertProjectSelect')?.addEventListener('change', () => this.onConvertProjectChange());
    document.getElementById('convertExperienceSelect')?.addEventListener('change', () => this.onConvertExperienceChange());
    document.getElementById('refreshConvertProjectsBtn')?.addEventListener('click', () => this.refreshConvertProjects(true));
    document.getElementById('refreshConvertExperiencesBtn')?.addEventListener('click', () => this.refreshConvertExperiences(true));
    document.getElementById('importExperienceBtn')?.addEventListener('click', () => this.importConvertExperience());
    document.getElementById('pushExperienceBtn')?.addEventListener('click', () => this.pushConvertExperience());
    document.getElementById('runConvertPreviewBtn')?.addEventListener('click', () => this.runConvertPreview());
  }

  initializeNavigation() {
    const buttons = Array.from(document.querySelectorAll('.nav-btn'));
    if (!buttons.length) {
      return;
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-panel');
        if (target) {
          this.switchPanel(target);
        }
      });
    });

    this.switchPanel(this.activePanel || 'build');
  }

  switchPanel(panelId) {
    if (!panelId) return;

    this.activePanel = panelId;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-panel') === panelId;
      btn.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.panel-view').forEach(section => {
      const sectionId = section.id?.replace('panel-', '');
      section.classList.toggle('active', sectionId === panelId);
    });
  }

  async loadCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        document.getElementById('currentUrl').textContent = this.formatUrl(tab.url);
      }
    } catch (error) {
      console.error('Failed to load current page:', error);
    }
  }

  async capturePage() {
    const btn = document.getElementById('captureBtn');
    this.setButtonLoading(btn, true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) throw new Error('No active tab found');

      // Check capture mode
      if (this.captureMode === 'element') {
        // Activate element selector
        await this.captureElement(tab.id);
      } else {
        // Standard full page capture
        const response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_PAGE',
          tabId: tab.id
        });

        if (response.success) {
          this.currentPageData = response.data;
          this.displayPagePreview(response.data);
          this.addStatusLog('✓ Page captured successfully', 'success');
          this.showSuccess('Page captured successfully!');
        } else {
          throw new Error(response.error || 'Capture failed');
        }
      }
    } catch (error) {
      console.error('Capture failed:', error);
      this.addStatusLog(`✗ Capture failed: ${error.message}`, 'error');
      this.showError(error.message);
    } finally {
      this.setButtonLoading(btn, false);
    }
  }

  async captureElement(tabId) {
    this.addStatusLog('🎯 Click any element on the page to select it', 'info');

    // Send message to activate element selector
    const response = await chrome.runtime.sendMessage({
      type: 'START_ELEMENT_SELECTION',
      tabId: tabId
    });

    if (response.success) {
      this.addStatusLog('✓ Element selected and captured', 'success');
      this.showSuccess('Element captured successfully!');

      // Store element data as focused capture
      this.currentPageData = {
        ...this.currentPageData,
        selectedElement: response.data,
        captureMode: 'element'
      };

      // Show element preview
      this.displaySelectedElementPreview(response.data);

      // Also show in main preview area
      if (response.data.screenshot) {
        const preview = document.getElementById('pagePreview');
        const img = document.getElementById('screenshotPreview');
        const time = document.getElementById('captureTime');

        img.src = response.data.screenshot;
        time.textContent = `Element captured: ${response.data.selector}`;
        preview.classList.remove('hidden');
      }
    } else {
      throw new Error(response.error || 'Element selection failed');
    }
  }

  displaySelectedElementPreview(elementData) {
    const selectionHint = document.getElementById('elementSelectionHint');
    const selectedPreview = document.getElementById('selectedElementPreview');
    const elementScreenshot = document.getElementById('elementScreenshot');
    const elementSelector = document.getElementById('elementSelector');
    const elementDimensions = document.getElementById('elementDimensions');
    const elementTag = document.getElementById('elementTag');

    if (!selectedPreview || !elementData) return;

    // Hide hint, show preview
    selectionHint?.classList.add('hidden');
    selectedPreview.classList.remove('hidden');

    // Update preview content
    if (elementScreenshot && elementData.screenshot) {
      elementScreenshot.src = elementData.screenshot;
    }

    if (elementSelector && elementData.selector) {
      elementSelector.textContent = elementData.selector;
    }

    if (elementDimensions && elementData.dimensions) {
      const { width, height } = elementData.dimensions;
      elementDimensions.textContent = `${Math.round(width)}×${Math.round(height)}px`;
    }

    if (elementTag && elementData.tag) {
      elementTag.textContent = elementData.tag.toUpperCase();
    }
  }

  displayPagePreview(pageData) {
    const preview = document.getElementById('pagePreview');
    const img = document.getElementById('screenshotPreview');
    const time = document.getElementById('captureTime');

    if (pageData.screenshot) {
      img.src = pageData.screenshot;
      time.textContent = `Captured ${this.formatTime(pageData.timestamp)}`;
      preview.classList.remove('hidden');
    }
  }

  updateCharCounter() {
    const textarea = document.getElementById('descriptionText');
    const counter = document.getElementById('charCount');
    counter.textContent = textarea.value.length;
  }

  addVariation() {
    const newId = Math.max(...this.variations.map(v => v.id), 0) + 1;
    const newVariation = {
      id: newId,
      name: `Variation ${newId}`,
      description: ''
    };
    this.variations.push(newVariation);
    this.focusedVariationId = newVariation.id;
    this.renderVariations();
    this.updateFocusedVariationWorkspace();
    if (this.generatedCode?.variations?.length) {
      this.autoPreviewLatestCode('focus-change');
    }
  }

  removeVariation(id) {
    if (this.variations.length <= 1) {
      this.showError('At least one variation is required');
      return;
    }
    this.variations = this.variations.filter(v => v.id !== id);
    if (!this.variations.some(v => v.id === this.focusedVariationId)) {
      this.focusedVariationId = this.variations[0]?.id || null;
    }
    this.renderVariations();
    this.updateFocusedVariationWorkspace();
    if (this.generatedCode?.variations?.length) {
      this.autoPreviewLatestCode('focus-change');
    }
  }

  renderVariations() {
    const container = document.getElementById('variationsList');
    if (!container) return;

    container.innerHTML = this.variations.map((v, index) => {
      const isFocused = this.focusedVariationId === v.id;
      return `
        <div class="variation-item ${isFocused ? 'focused' : ''}" data-variation-id="${v.id}">
          <div class="variation-header">
            <div class="variation-title">
              <span class="variation-badge">V${index + 1}</span>
              <span class="variation-name">${this.escapeHtml(v.name)}</span>
            </div>
            <div class="variation-controls">
              <button class="btn-small btn-secondary variation-focus" data-variation-id="${v.id}" ${isFocused ? 'disabled' : ''}>${isFocused ? 'Focused' : 'Focus'}</button>
              ${this.variations.length > 1 ? `<button class="variation-remove" data-variation-id="${v.id}" aria-label="Remove variation ${index + 1}">×</button>` : ''}
            </div>
          </div>
          <label class="variation-label" for="variation-notes-${v.id}">Variation instructions</label>
          <textarea 
            id="variation-notes-${v.id}"
            placeholder="Explain exactly what this variation should change, test, or emphasise."
            data-variation-id="${v.id}"
            class="variation-textarea"
          >${this.escapeHtml(v.description || '')}</textarea>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.variation-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-variation-id'), 10);
        this.removeVariation(id);
      });
    });

    container.querySelectorAll('.variation-textarea').forEach(textarea => {
      textarea.addEventListener('input', () => {
        const id = parseInt(textarea.getAttribute('data-variation-id'), 10);
        this.updateVariation(id, textarea.value);
      });
    });

    container.querySelectorAll('.variation-focus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-variation-id'), 10);
        this.setFocusedVariation(id);
      });
    });

    this.updateFocusedVariationWorkspace();
  }

  updateVariation(id, description) {
    const variation = this.variations.find(v => v.id === id);
    if (variation) {
      variation.description = description;
      if (this.focusedVariationId === id) {
        this.updateFocusedVariationWorkspace();
        this.updatePreviewActiveState();
      }
    }
  }

  setFocusedVariation(id) {
    if (!this.variations.some(v => v.id === id)) {
      return;
    }

    if (this.focusedVariationId !== id) {
      this.focusedVariationId = id;
      this.renderVariations();
      this.updatePreviewActiveState();
      if (this.generatedCode?.variations?.length) {
        this.autoPreviewLatestCode('focus-change');
      }
    } else {
      this.updateFocusedVariationWorkspace();
    }
  }

  setFocusedVariationByNumber(number) {
    if (!this.generatedCode?.variations?.length) return;
    const index = this.generatedCode.variations.findIndex(v => v.number === number);
    if (index === -1) return;
    const variation = this.variations[index];
    if (variation) {
      this.setFocusedVariation(variation.id);
    }
  }

  getFocusedVariationConfig() {
    if (!this.variations.length) return null;
    return this.variations.find(v => v.id === this.focusedVariationId) || this.variations[0];
  }

  getVariationIndexById(id) {
    return this.variations.findIndex(v => v.id === id);
  }

  getVariationNumberByConfigId(id) {
    const index = this.getVariationIndexById(id);
    if (index === -1) return null;
    const generated = Array.isArray(this.generatedCode?.variations)
      ? this.generatedCode.variations[index]
      : null;
    return generated?.number || this.variations[index]?.id || null;
  }

  getFocusedVariationNumber() {
    if (!this.variations.length) return null;
    const number = this.getVariationNumberByConfigId(this.focusedVariationId);
    if (number) return number;
    return this.generatedCode?.variations?.[0]?.number || this.variations[0]?.id || null;
  }

  updateFocusedVariationWorkspace() {
    const titleEl = document.getElementById('focusedVariationTitle');
    const summaryEl = document.getElementById('focusedVariationSummary');
    const statusEl = document.getElementById('focusedVariationStatus');
    if (!titleEl || !summaryEl) return;

    const focused = this.getFocusedVariationConfig();
    if (!focused) {
      titleEl.textContent = 'No variation selected';
      summaryEl.textContent = 'Add variations in the Build tab to get started.';
      if (statusEl) statusEl.textContent = 'No variations';
      return;
    }

    titleEl.textContent = focused.name || `Variation ${focused.id}`;
    summaryEl.textContent = focused.description?.trim()
      ? focused.description
      : 'No specific instructions yet - this variation will use shared context only.';

    // Update status based on generation state
    if (statusEl) {
      if (!this.generatedCode) {
        statusEl.textContent = 'Not generated';
        statusEl.className = 'variation-status-indicator status-pending';
      } else {
        const generatedVariation = this.generatedCode.variations?.find(v => v.number === focused.id);
        if (generatedVariation) {
          const hasCode = generatedVariation.css || generatedVariation.js;
          if (hasCode) {
            statusEl.textContent = 'Code ready';
            statusEl.className = 'variation-status-indicator status-ready';
          } else {
            statusEl.textContent = 'Empty code';
            statusEl.className = 'variation-status-indicator status-warning';
          }
        } else {
          statusEl.textContent = 'Missing in generated code';
          statusEl.className = 'variation-status-indicator status-error';
        }
      }
    }
  }

  showVariationSwitcher() {
    if (!this.variations.length) {
      this.showError('No variations available. Add variations in the Build tab first.');
      return;
    }

    // Create modal overlay
    const existingModal = document.querySelector('.variation-switcher-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'variation-switcher-modal';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="this.closest('.variation-switcher-modal').remove()"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>Switch Focused Variation</h3>
          <button class="modal-close" onclick="this.closest('.variation-switcher-modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>Choose which variation to focus on. The focused variation will auto-apply when you make changes.</p>
          <div class="variation-switcher-list">
            ${this.variations.map(v => {
              const isFocused = v.id === this.focusedVariationId;
              const generatedVariation = this.generatedCode?.variations?.find(gv => gv.number === v.id);
              const hasCode = generatedVariation && (generatedVariation.css || generatedVariation.js);
              
              return `
                <div class="variation-switcher-item ${isFocused ? 'focused' : ''}" data-variation-id="${v.id}">
                  <div class="variation-switcher-info">
                    <h4>${v.name || `Variation ${v.id}`}</h4>
                    <p>${v.description || 'No specific instructions'}</p>
                    <span class="variation-switcher-status ${hasCode ? 'has-code' : 'no-code'}">
                      ${hasCode ? '✓ Code generated' : '◦ No code yet'}
                    </span>
                  </div>
                  <button class="btn-small variation-switcher-btn ${isFocused ? 'btn-secondary' : 'btn-primary'}" 
                          ${isFocused ? 'disabled' : ''}>
                    ${isFocused ? 'Currently Focused' : 'Focus This'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind click events to switcher buttons
    modal.querySelectorAll('.variation-switcher-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.variation-switcher-item');
        const variationId = parseInt(item.dataset.variationId);
        this.switchFocusToVariation(variationId);
        modal.remove();
      });
    });
  }

  async switchFocusToVariation(variationId) {
    if (this.focusedVariationId === variationId) {
      return; // Already focused
    }

    const variation = this.variations.find(v => v.id === variationId);
    if (!variation) {
      this.showError('Variation not found');
      return;
    }

    this.focusedVariationId = variationId;
    this.updateFocusedVariationWorkspace();
    this.updateVariationPreview(); // Update preview list to show new focus

    const variationName = variation.name || `Variation ${variationId}`;
    this.addStatusLog(`🎯 Focus switched to ${variationName}`, 'info');

    // If there's generated code, auto-preview the newly focused variation
    if (this.generatedCode?.variations?.length) {
      await this.autoPreviewLatestCode('focus-change');
    }

    this.showSuccess(`Now focused on ${variationName}`);
  }

  setAiActivity(status = 'idle', message = '') {
    this.aiActivity = { status, message };
    const banner = document.getElementById('aiActivityBanner');
    if (!banner) return;
    banner.dataset.status = status;
    banner.textContent = message?.trim() || (status === 'idle'
      ? 'Ready to review updates.'
      : status === 'working'
        ? 'Working...'
        : '');
  }

  async autoPreviewLatestCode(origin = 'auto') {
    if (!this.generatedCode?.variations?.length) {
      return;
    }

    const number = this.getFocusedVariationNumber();
    if (!number) {
      return;
    }

    const variation = this.generatedCode.variations.find(v => v.number === number);
    const label = variation?.name || `Variation ${number}`;
    const workingMessage = origin === 'focus-change'
      ? `Switching focus to ${label}...`
      : 'Applying the latest updates to the active tab...';
    const inAutoIteration = origin === 'iteration' || (origin === 'auto' && this.autoIteration?.active);
    if (!inAutoIteration) {
      this.setAiActivity('working', workingMessage);
    }

    try {
      await this.previewVariation(number, { silent: true });
      const previewMessage = origin === 'focus-change'
        ? `${label} is now active on the page.`
        : `Latest updates applied to ${label}.`;
      if (!inAutoIteration) {
        this.setAiActivity('preview', previewMessage);
      }
    } catch (error) {
      console.warn('Auto preview failed:', error);
      this.setAiActivity('error', 'Auto preview failed. Preview manually from the list.');
    }
  }

  isVariationFocusedByNumber(number) {
    if (!this.generatedCode?.variations?.length) return false;
    const index = this.generatedCode.variations.findIndex(v => v.number === number);
    if (index === -1) return false;
    const variation = this.variations[index];
    return variation?.id === this.focusedVariationId;
  }

  // ============================================
  // Conversation Methods
  // ============================================

  addConversationMessage(message) {
    if (!message || !message.content) {
      return;
    }

    const entry = {
      id: ++this.messageCounter,
      role: ['assistant', 'system'].includes(message.role) ? 'assistant' : 'user',
      content: message.content.trim(),
      timestamp: message.timestamp || Date.now(),
      meta: message.meta || {}
    };

    if (!entry.content) {
      return;
    }

    this.conversation.push(entry);
    if (this.conversation.length > 50) {
      this.conversation = this.conversation.slice(-50);
    }

    this.renderConversation();
  }

  renderConversation() {
    const thread = document.getElementById('chatThread');
    const emptyState = document.getElementById('chatEmptyState');
    if (!thread) return;

    thread.querySelectorAll('.chat-message').forEach(node => node.remove());

    if (!this.conversation.length) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    this.conversation.forEach(message => {
      thread.appendChild(this.createChatMessageElement(message));
    });

    thread.scrollTop = thread.scrollHeight;
  }

  createChatMessageElement(message) {
    const wrapper = document.createElement('div');
    const classes = ['chat-message', message.role];
    if (message.meta?.tone === 'error') {
      classes.push('error');
    }
    wrapper.className = classes.join(' ');

    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const author = message.role === 'assistant' ? 'AI' : 'You';
    meta.textContent = `${author} • ${this.formatChatTimestamp(message.timestamp)}`;

    const body = document.createElement('div');
    body.className = 'chat-message-body';
    body.textContent = message.content;

    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    return wrapper;
  }

  formatChatTimestamp(timestamp) {
    if (!timestamp) {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  setChatStatus(text) {
    const status = document.getElementById('chatStatus');
    if (!status) return;
    status.textContent = text || '';
  }

  getConversationHistoryForAI(limit = 12) {
    if (!Array.isArray(this.conversation) || !this.conversation.length) {
      return [];
    }

    return this.conversation
      .slice(-limit)
      .map(entry => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: entry.content
      }));
  }

  handleChatSubmit(event) {
    if (event?.type === 'keydown') {
      if (!((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
        return;
      }
      event.preventDefault();
    } else if (event?.preventDefault) {
      event.preventDefault();
    }

    if (this.chatState.sending) {
      return;
    }

    const textarea = document.getElementById('chatInput');
    if (!textarea) {
      return;
    }

    const message = textarea.value.trim();
    if (!message) {
      this.showError('Describe what you need before sending a chat message');
      return;
    }

    if (!this.generatedCode) {
      this.showError('Generate code in the Build tab before starting a chat');
      this.switchPanel('build');
      return;
    }

    textarea.value = '';
    this.addConversationMessage({
      role: 'user',
      content: message,
      meta: { type: 'chat-request' }
    });

    if (this.activePanel !== 'review') {
      this.switchPanel('review');
    }
    this.processChatRequest(message);
  }

  async processChatRequest(message) {
    if (this.chatState.sending) {
      return;
    }

    this.chatState.sending = true;
    this.setChatStatus('Working…');
    this.addStatusLog('🗨️ Chat refinement requested', 'info');
    this.setAiActivity('working', 'Processing your request and updating code...');

    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
    }

    try {
      const adjusted = await this.adjustCode(message, null, { includeConversation: true });
      if (!adjusted) {
        throw new Error('No response from AI');
      }

      // Clear current preview before applying changes
      await this.clearVariationPreview(false);
      
      // Update the generated code
      this.generatedCode = adjusted.code;
      this.recordUsage(adjusted.usage);
      this.displayGeneratedCode(adjusted.code);

      // Auto-apply the focused variation after updates
      if (this.focusedVariationId && this.generatedCode?.variations?.length) {
        this.setAiActivity('working', 'Auto-applying updated variation...');
        await this.previewVariation(this.focusedVariationId, { silent: true });
        this.setAiActivity('preview', `Updated variation ${this.focusedVariationId} applied automatically.`);
      } else {
        this.setAiActivity('idle', 'Code updated. Select a variation to preview changes.');
      }

      const summary = this.buildAdjustmentSummary(adjusted.code);
      this.addConversationMessage({
        role: 'assistant',
        content: summary,
        meta: { type: 'chat-response' }
      });

      this.addStatusLog('✓ Chat adjustments applied and auto-previewed', 'success');
      this.setChatStatus(`Updated • ${this.formatChatTimestamp(Date.now())}`);
    } catch (error) {
      console.error('Chat request failed:', error);
      this.addConversationMessage({
        role: 'assistant',
        content: `I couldn’t adjust the code: ${error.message || error}`,
        meta: { type: 'chat-error', tone: 'error' }
      });
      this.addStatusLog(`✗ Chat adjustment failed: ${error.message}`, 'error');
      this.showError(error.message || 'Chat adjustment failed');
      this.setChatStatus('Something went wrong.');
      this.setAiActivity('error', 'Chat adjustment failed. Review the status log.');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
      }
      this.chatState.sending = false;
      const textarea = document.getElementById('chatInput');
      textarea?.focus();
      setTimeout(() => this.setChatStatus(''), 4000);
    }
  }

  buildAdjustmentSummary(codeData) {
    if (!codeData?.variations?.length) {
      return 'Code refreshed. Review the updates in the Review tab.';
    }

    const names = codeData.variations
      .map(v => v.name || `Variation ${v.number}`)
      .filter(Boolean);

    const visible = names.slice(0, 3).join(', ');
    const remaining = names.length > 3 ? ` +${names.length - 3} more` : '';

    const extras = [];
    if (codeData.globalCSS) extras.push('global CSS');
    if (codeData.globalJS) extras.push('global JS');
    const extrasText = extras.length ? ` Global assets refreshed (${extras.join(', ')}).` : '';

    return `Updated ${names.length} variation${names.length === 1 ? '' : 's'}: ${visible}${remaining}.${extrasText} Review the Review tab to preview or retest.`;
  }

  buildGenerationSummary(codeData) {
    if (!codeData?.variations?.length) {
      return 'No variations were generated. Check the status log for details.';
    }

    const names = codeData.variations
      .map(v => v.name || `Variation ${v.number}`)
      .filter(Boolean);

    const visible = names.slice(0, 3).join(', ');
    const remaining = names.length > 3 ? ` +${names.length - 3} more` : '';

    const extras = [];
    if (codeData.globalCSS) extras.push('global CSS');
    if (codeData.globalJS) extras.push('global JS');
    const extrasText = extras.length ? ` Includes ${extras.join(' & ')}.` : '';

    return `Generated ${names.length} variation${names.length === 1 ? '' : 's'}: ${visible}${remaining}.${extrasText} Head to the Review tab to inspect, edit, or preview.`;
  }

  async handleGenerationSuccess(codeData) {
    const summary = this.buildGenerationSummary(codeData);
    if (summary) {
      this.addConversationMessage({
        role: 'assistant',
        content: summary,
        meta: { type: 'generation-response' }
      });
    }

    // Auto-apply the focused variation after initial generation
    if (this.focusedVariationId && codeData?.variations?.length) {
      const focusedVariation = codeData.variations.find(v => v.number === this.focusedVariationId);
      if (focusedVariation) {
        this.setAiActivity('working', 'Auto-applying the focused variation...');
        try {
          await this.previewVariation(this.focusedVariationId, { silent: true });
          const variationName = focusedVariation.name || `Variation ${this.focusedVariationId}`;
          this.setAiActivity('preview', `${variationName} applied automatically after generation.`);
          this.addStatusLog(`🎯 Auto-applied focused variation: ${variationName}`, 'success');
        } catch (error) {
          console.error('Auto-apply after generation failed:', error);
          this.setAiActivity('error', 'Generation completed but auto-preview failed.');
        }
      }
    }
  }

  handleGenerationFailure(error) {
    if (!error) return;
    const message = typeof error === 'string' ? error : error.message;
    this.addConversationMessage({
      role: 'assistant',
      content: `Generation failed: ${message}`,
      meta: { type: 'generation-error', tone: 'error' }
    });
  }

  async testApiKey() {
    if (!this.settings.authToken) {
      this.showError('Please enter an API key first');
      return;
    }

    this.addStatusLog('Testing API key...', 'info');
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_API_KEY',
        token: this.settings.authToken
      });

      if (response.success) {
        const statusEl = document.getElementById('apiKeyStatus');
        if (statusEl) {
          statusEl.textContent = '✓ Valid';
          statusEl.style.color = 'var(--success)';
        }
        this.addStatusLog('✓ API key is valid', 'success');
        this.showSuccess('API key is valid!');
      } else {
        throw new Error(response.error || 'Invalid key');
      }
    } catch (error) {
      const statusEl = document.getElementById('apiKeyStatus');
      if (statusEl) {
        statusEl.textContent = '✗ Invalid';
        statusEl.style.color = 'var(--danger)';
      }
      this.addStatusLog(`✗ API key test failed: ${error.message}`, 'error');
      this.showError(error.message);
    }
  }

  // MAIN AUTO-ITERATION FLOW
  async generateAndAutoTest() {
    if (!this.validateGeneration()) return;

    const btn = document.getElementById('generateBtn');
    this.setButtonLoading(btn, true);
    this.setAiActivity('working', 'Preparing to generate variations...');

    const description = document.getElementById('descriptionText').value.trim();
    if (description) {
      const lastMessage = this.conversation[this.conversation.length - 1];
      if (!lastMessage || lastMessage.meta?.type !== 'generation-request' || lastMessage.content !== description) {
        this.addConversationMessage({
          role: 'user',
          content: description,
          meta: { type: 'generation-request' }
        });
      }
    }

    await this.clearVariationPreview(false);

    // Auto-capture page data if not available
    if (!this.currentPageData) {
      this.addStatusLog('📷 Auto-capturing page data...', 'info');
      try {
        await this.capturePage();
        if (!this.currentPageData) {
          throw new Error('Failed to capture page data');
        }
      } catch (error) {
        this.addStatusLog(`❌ Auto-capture failed: ${error.message}`, 'error');
        this.setAiActivity('error', 'Unable to capture the page automatically. Reload and try again.');
        this.setButtonLoading(btn, false);
        return;
      }
    }

    // Reset state
    this.autoIteration = {
      active: true,
      currentVariation: 1,
      iterations: 0,
      maxIterations: 5,
      startTime: Date.now()
    };

    this.showStatusPanel();
    this.addStatusLog('🚀 Starting automatic generation and testing...', 'info');
    this.updateIndicator('working');

    try {
      // Step 1: Generate initial code
      this.addStatusLog('⚙️ Sending generation request to AI...', 'info');
      this.setAiActivity('working', `Generating ${this.variations.length} variation${this.variations.length === 1 ? '' : 's'} with ${this.settings.model}...`);
      const generationData = this.buildGenerationData();
      
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CODE',
        data: generationData
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Generation failed');
      }

      this.generatedCode = response.code;
      this.recordUsage(response.usage);
      
      const generatedCount = response.code?.variations?.length || 0;
      this.addStatusLog(`✓ AI generated ${generatedCount} variation${generatedCount === 1 ? '' : 's'}`, 'success');

      // Display initial code
      this.setAiActivity('working', 'Updating interface with new code...');
      this.displayGeneratedCode(response.code);
      await this.handleGenerationSuccess(response.code);

      // Step 2: Auto-test each variation
      const generatedVariations = Array.isArray(this.generatedCode?.variations)
        ? this.generatedCode.variations
        : [];

      for (let i = 0; i < generatedVariations.length; i++) {
        if (!this.autoIteration.active) {
          this.addStatusLog('⏸ Auto-iteration stopped by user', 'info');
          break;
        }

        const generatedVariation = generatedVariations[i];
        const variationNumber = generatedVariation?.number || (i + 1);
        const variationConfig = this.variations[i] || {
          id: variationNumber,
          name: generatedVariation?.name || `Variation ${variationNumber}`,
          description: ''
        };

        this.autoIteration.currentVariation = variationNumber;

        const variationLabel = generatedVariation?.name || variationConfig.name || `Variation ${variationNumber}`;
        this.addStatusLog(`\n📋 Testing Variation ${variationNumber}: ${variationLabel}`, 'info');

        await this.autoIterateVariation(variationNumber, variationConfig);
      }

      // Step 3: Complete
      if (this.autoIteration.active) {
        this.addStatusLog('\n✅ All variations tested and optimized!', 'success');
        this.updateIndicator('active');
        this.showSuccess('Code generated and tested successfully!');
        this.setAiActivity('preview', 'All variations tested. Preview is up to date.');
      }

    } catch (error) {
      console.error('Generation failed:', error);
      this.addStatusLog(`✗ Generation failed: ${error.message}`, 'error');
      this.updateIndicator('error');
      this.showError(error.message);
      this.handleGenerationFailure(error);
      this.setAiActivity('error', error.message || 'Generation failed.');
    } finally {
      this.autoIteration.active = false;
      this.setButtonLoading(btn, false);
      document.getElementById('stopIterationBtn')?.classList.add('hidden');
    }
  }

  async autoIterateVariation(variationNumber, variationConfig) {
    let iteration = 0;
    const maxIterations = this.autoIteration.maxIterations;

    while (iteration < maxIterations && this.autoIteration.active) {
      iteration++;
      this.autoIteration.iterations++;

      const variationLabel = variationConfig?.name || `Variation ${variationNumber}`;
      this.addStatusLog(`  Iteration ${iteration}/${maxIterations}...`, 'info');
      this.setAiActivity('working', `Auto-testing ${variationLabel} (${iteration}/${maxIterations})...`);

      // Test the variation
      const testResult = await this.testVariation(variationNumber);

      if (!testResult) {
        this.addStatusLog(`  ✗ Test execution failed`, 'error');
        this.setAiActivity('error', `Unable to test ${variationLabel}. Check the status log.`);
        break;
      }

      // Check for errors
      if (!testResult.errors || testResult.errors.length === 0) {
        this.addStatusLog(`  ✓ No errors detected - variation works!`, 'success');
        this.setAiActivity('preview', `${variationLabel} passed validation.`);
        break;
      }

      // Errors found
      this.addStatusLog(`  ⚠️ ${testResult.errors.length} issue(s) detected`, 'error');
      testResult.errors.forEach((err, idx) => {
        this.addStatusLog(`    ${idx + 1}. ${err}`, 'error');
      });

      // If last iteration, stop
      if (iteration >= maxIterations) {
        this.addStatusLog(`  ⚠️ Max iterations reached. Manual review needed.`, 'error');
        this.setAiActivity('error', `${variationLabel} still has issues after ${maxIterations} attempts.`);
        break;
      }

      // Request AI to fix
      this.addStatusLog(`  🔧 Requesting AI to fix issues...`, 'info');
      this.setAiActivity('working', `Adjusting ${variationLabel} based on test feedback...`);
      
      const feedback = this.buildAutoFeedback(testResult, variationConfig);
      const adjusted = await this.adjustCode(feedback, testResult);

      if (!adjusted) {
        this.addStatusLog(`  ✗ AI adjustment failed`, 'error');
        this.setAiActivity('error', `Automatic adjustment failed for ${variationLabel}.`);
        break;
      }

      this.generatedCode = adjusted.code;
      this.recordUsage(adjusted.usage);
      this.displayGeneratedCode(adjusted.code);
      
      this.addStatusLog(`  ✓ Code updated, retesting...`, 'info');
      await this.sleep(500);
    }
  }

  async testVariation(variationNumber) {
    const variation = this.generatedCode?.variations.find(v => v.number === variationNumber);
    if (!variation) return null;

    const variationName = variation.name || `Variation ${variationNumber}`;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;

    const result = {
      variationNumber,
      variationName,
      timestamp: Date.now(),
      errors: []
    };

    try {
      // Step 1: Inject error monitoring
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          // Setup error capture
          window.__convertTestErrors = [];
          window.__convertOriginalConsoleError = console.error;
          console.error = function(...args) {
            window.__convertTestErrors.push(args.join(' '));
            window.__convertOriginalConsoleError.apply(console, args);
          };
        }
      });

      // Step 2: Clear previous variation
      const resetResult = await this.resetVariationOnTab(tab.id, 'convert-ai-');
      await this.resetVariationOnTab(tab.id, 'convert-ai-preview');
      if (!resetResult) {
        this.addStatusLog('  ⚠️ Unable to reset previously injected code. Try reloading the page.', 'error');
        result.errors.push('Content script injection failed - try reloading the page');
      }

      await this.sleep(200);

      // Step 3: Apply variation
      const payload = this.buildVariationPayload(variation);

      const applyResponse = await chrome.runtime.sendMessage({
        type: 'APPLY_VARIATION',
        tabId: tab.id,
        key: `convert-ai-${variationNumber}`,
        css: payload.css,
        js: payload.js
      });

      if (Array.isArray(applyResponse?.logs)) {
        this.logOperationEntries(applyResponse.logs, applyResponse.success ? 'info' : 'error');
      }

      if (!applyResponse?.success) {
        result.errors.push(applyResponse?.error || 'Failed to apply variation');
      }

      await this.sleep(800); // Give time for JS to execute

      // Step 4: Collect errors from page
      const errorResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const errors = window.__convertTestErrors || [];
          // Restore original console.error
          if (window.__convertOriginalConsoleError) {
            console.error = window.__convertOriginalConsoleError;
          }
          return errors;
        }
      });

      if (errorResults?.[0]?.result) {
        const pageErrors = errorResults[0].result;
        pageErrors.forEach(err => {
          if (!result.errors.includes(err)) {
            result.errors.push(`Console error: ${err}`);
          }
        });
      }

      // Step 5: Check if critical elements exist (if JS was applied)
      if (variation.js) {
        const elementCheckResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (jsCode) => {
            // Extract selectors from the JS code
            const selectorRegex = /querySelector(?:All)?\s*\(\s*['"`]([^'"` ]+)['"`]\s*\)/g;
            const selectors = [];
            let match;
            while ((match = selectorRegex.exec(jsCode)) !== null) {
              selectors.push(match[1]);
            }
            
            // Check if these selectors exist
            const missing = [];
            selectors.forEach(selector => {
              try {
                const element = document.querySelector(selector);
                if (!element) {
                  missing.push(selector);
                }
              } catch (e) {
                missing.push(selector + ' (invalid selector)');
              }
            });
            
            return missing;
          },
          args: [variation.js]
        });

        if (elementCheckResults?.[0]?.result?.length > 0) {
          const missingElements = elementCheckResults[0].result;
          missingElements.forEach(selector => {
            result.errors.push(`Element not found: ${selector}`);
          });
        }
      }

      // Step 6: Capture screenshot
      try {
        result.screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        });
        this.displayTestScreenshot(result.screenshot, variationNumber);
      } catch (error) {
        console.warn('Screenshot failed:', error);
      }

    } catch (error) {
      result.errors.push(`Test execution error: ${error.message}`);
    }

    return result;
  }

  async autoValidateVariation(variationNumber, options = {}) {
    if (!this.generatedCode?.variations) {
      return;
    }

    const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
    if (!variation) {
      return;
    }

    const label = variation.name || `Variation ${variationNumber}`;
    const origin = options.origin || 'Validation';
    const shouldUpdateConvertStatus = Boolean(
      options.updateConvertStatus && this.convertState && this.convertState.projectId
    );

    this.addStatusLog(`${origin}: running checks for ${label}`, 'info');

    const result = await this.testVariation(variationNumber);
    if (!result) {
      this.addStatusLog(`${origin}: test execution failed for ${label}`, 'error');
      if (shouldUpdateConvertStatus && typeof this.setConvertStatus === 'function') {
        this.setConvertStatus(`Validation failed for ${label}`, 'error');
      }
      return result;
    }

    if (Array.isArray(result.errors) && result.errors.length > 0) {
      this.addStatusLog(`${origin}: ${result.errors.length} issue(s) detected for ${label}`, 'error');
      result.errors.forEach((err, idx) => {
        this.addStatusLog(`  ${idx + 1}. ${err}`, 'error');
      });
      this.showError(`${label} validation failed. See status log for details.`);
      if (shouldUpdateConvertStatus && typeof this.setConvertStatus === 'function') {
        this.setConvertStatus(`Issues detected for ${label}. Review the status log.`, 'error');
      }
    } else {
      this.addStatusLog(`${origin}: ${label} passed validation`, 'success');
      this.showSuccess(`${label} passed validation`);
      if (shouldUpdateConvertStatus && typeof this.setConvertStatus === 'function') {
        this.setConvertStatus(`✅ ${label} passed validation`, 'success');
      }
    }

    return result;
  }

  buildAutoFeedback(testResult, variationConfig) {
    const errorList = testResult.errors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
    
    return `
AUTOMATED TEST RESULTS FOR ${testResult.variationName}:

Issues Detected:
${errorList}

Variation Goal: ${variationConfig.description || 'See overall description'}

Please update the code to fix these issues. Use vanilla JavaScript only - no jQuery or Convert utilities.
Ensure all DOM manipulations use standard APIs like querySelector, addEventListener, etc.
`.trim();
  }

  async adjustCode(feedback, testSummary, options = {}) {
    try {
      const payload = {
        generationData: this.buildGenerationData(),
        previousCode: this.serializeCode(this.generatedCode),
        feedback,
        testSummary
      };

      if (options.includeConversation) {
        payload.conversationHistory = this.getConversationHistoryForAI();
      }

      if (options.extraContext) {
        payload.extraContext = options.extraContext;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'ADJUST_CODE',
        data: payload
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Adjustment failed');
      }

      return response;
    } catch (error) {
      console.error('Adjustment failed:', error);
      return null;
    }
  }

  validateGeneration() {
    if (!this.settings.authToken) {
      this.showError('Please add your OpenAI API key in Settings');
      return false;
    }

    if (!this.currentPageData) {
      this.showError('Please capture the current page first');
      return false;
    }

    // Check that we have at least one variation with instructions
    const hasValidVariations = this.variations.some(v => v.description?.trim());
    if (!hasValidVariations) {
      this.showError('Please add instructions for at least one variation');
      return false;
    }

    return true;
  }

  buildGenerationData() {
    return {
      pageData: this.currentPageData,
      description: document.getElementById('descriptionText').value.trim(),
      variations: this.variations,
      settings: this.settings
    };
  }

  displayGeneratedCode(codeData) {
    document.getElementById('resultsPanel').classList.remove('hidden');
    document.getElementById('stopIterationBtn')?.classList.remove('hidden');

    this.previewState.activeVariation = null;

    // Initialize edited code tracking if not exists
    if (!this.editedCode) {
      this.editedCode = {};
    }

    this.syncVariationNamesFromCode(codeData);
    this.renderVariations();

    const tabs = [];
    codeData.variations.forEach(v => {
      if (v.css) tabs.push({ id: `v${v.number}-css`, label: `${v.name} CSS`, type: 'css', content: v.css, variationNumber: v.number });
      if (v.js) tabs.push({ id: `v${v.number}-js`, label: `${v.name} JS`, type: 'js', content: v.js, variationNumber: v.number });
    });
    if (codeData.globalCSS) tabs.push({ id: 'global-css', label: 'Global CSS', type: 'css', content: codeData.globalCSS });
    if (codeData.globalJS) tabs.push({ id: 'global-js', label: 'Global JS', type: 'js', content: codeData.globalJS });

    // Render tabs
    const tabsContainer = document.getElementById('codeTabs');
    tabsContainer.innerHTML = tabs.map((tab, idx) => 
      `<button class="tab ${idx === 0 ? 'active' : ''}" data-tab-id="${tab.id}">${tab.label}</button>`
    ).join('');

    // Bind tab click events
    tabsContainer.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab-id');
        this.switchTab(tabId);
      });
    });

    // Render editable content
    const contentContainer = document.getElementById('codeContent');
    contentContainer.innerHTML = tabs.map((tab, idx) => {
      const currentContent = this.editedCode[tab.id] || tab.content;
      const isModified = this.editedCode[tab.id] && this.editedCode[tab.id] !== tab.content;
      
      return `
      <div class="tab-content ${idx === 0 ? '' : 'hidden'}" data-content-id="${tab.id}">
        <div class="code-header">
          <span class="code-title">
            ${tab.label}
            ${isModified ? '<span class="code-modified-badge">✏️ Modified</span>' : ''}
          </span>
          <div class="code-actions">
            <button class="btn-small copy-code-btn" data-code-id="${tab.id}">📋 Copy</button>
          </div>
        </div>
        <div class="code-editor">
          <textarea 
            class="code-textarea ${isModified ? 'modified' : ''}" 
            data-code-id="${tab.id}"
            data-original-content="${this.escapeAttr(tab.content)}"
            spellcheck="false"
          >${this.escapeHtml(currentContent)}</textarea>
          <div class="code-editor-actions">
            <button class="btn-small btn-primary save-code-btn" data-code-id="${tab.id}" style="display: ${isModified ? 'inline-block' : 'none'};">💾 Save Changes</button>
            <button class="btn-small btn-secondary revert-code-btn" data-code-id="${tab.id}" style="display: ${isModified ? 'inline-block' : 'none'};">↩️ Revert</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
    
    // Bind textarea input events to track modifications
    contentContainer.querySelectorAll('.code-textarea').forEach(textarea => {
      textarea.addEventListener('input', () => {
        const codeId = textarea.getAttribute('data-code-id');
        this.handleCodeEdit(codeId, textarea);
      });
    });

    // Bind action button events
    contentContainer.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeId = btn.getAttribute('data-code-id');
        this.copyCode(codeId);
      });
    });

    contentContainer.querySelectorAll('.save-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeId = btn.getAttribute('data-code-id');
        this.saveCodeEdit(codeId);
      });
    });

    contentContainer.querySelectorAll('.revert-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeId = btn.getAttribute('data-code-id');
        this.revertCodeEdit(codeId);
      });
    });

    this.renderVariationPreviewPanel(codeData);
    this.updateFocusedVariationWorkspace();

    const autoPreviewOrigin = (this.autoIteration?.active && this.autoIteration.iterations > 0)
      ? 'iteration'
      : 'auto';
    this.autoPreviewLatestCode(autoPreviewOrigin);

    if (typeof this.updateConvertActionState === 'function') {
      this.updateConvertActionState();
    }
  }

  switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-tab-id="${tabId}"]`)?.classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelector(`[data-content-id="${tabId}"]`)?.classList.remove('hidden');
  }

  async copyCode(tabId) {
    // Get current code from textarea (which may be edited)
    const textarea = document.querySelector(`.code-textarea[data-code-id="${tabId}"]`);
    const content = textarea ? textarea.value : this.getCurrentCodeForId(tabId);
    
    if (!content) {
      this.showError('No code to copy');
      return;
    }
    
    await navigator.clipboard.writeText(content);
    this.showSuccess('Code copied to clipboard!');
  }

  renderVariationPreviewPanel(codeData) {
    const panel = document.getElementById('variationPreview');
    const list = document.getElementById('variationPreviewList');
    const hint = document.getElementById('variationPreviewHint');

    if (!panel || !list) return;

    if (!codeData?.variations?.length) {
      list.innerHTML = '';
      panel.classList.add('hidden');
      if (hint) hint.textContent = 'Click Preview to apply a variation on the active tab.';
      this.updatePreviewActiveState();
      return;
    }

    list.innerHTML = codeData.variations.map((variation, index) => {
      const variationName = this.escapeHtml(variation.name || `Variation ${variation.number}`);
      const assets = [];
      if (variation.css) assets.push('CSS');
      if (variation.js) assets.push('JS');
      if (codeData.globalCSS) assets.push('Global CSS');
      if (codeData.globalJS) assets.push('Global JS');
      const uniqueAssets = [...new Set(assets)];
      const assetSummary = uniqueAssets.length ? uniqueAssets.join(' + ') : 'No assets';
      const config = this.variations[index];
      const instructions = config?.description?.trim()
        ? this.escapeHtml(config.description.trim())
        : 'No variation instructions yet.';
      const isFocused = this.isVariationFocusedByNumber(variation.number);

      return `
        <div class="variation-preview-item ${isFocused ? 'focused' : ''}" data-variation-number="${variation.number}">
          <div class="variation-preview-info">
            <div class="variation-preview-name">${variationName}</div>
            <div class="variation-preview-meta">${assetSummary}</div>
            <div class="variation-preview-notes">${instructions}</div>
          </div>
          <div class="variation-preview-buttons">
            <button class="btn-small preview-apply-btn" data-variation-number="${variation.number}">Preview</button>
            <button class="btn-small btn-secondary preview-focus-btn" data-variation-number="${variation.number}" ${isFocused ? 'disabled' : ''}>${isFocused ? 'Focused' : 'Focus'}</button>
            <button class="btn-small preview-test-btn" data-variation-number="${variation.number}">Retest</button>
          </div>
        </div>
      `;
    }).join('');

    panel.classList.remove('hidden');

    list.querySelectorAll('.preview-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const number = parseInt(btn.getAttribute('data-variation-number'), 10);
        this.previewVariation(number);
      });
    });

    list.querySelectorAll('.preview-test-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const number = parseInt(btn.getAttribute('data-variation-number'), 10);
        this.retestVariation(number);
      });
    });

    list.querySelectorAll('.preview-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const number = parseInt(btn.getAttribute('data-variation-number'), 10);
        this.setFocusedVariationByNumber(number);
      });
    });

    this.updatePreviewActiveState();
  }

  buildVariationPayload(variation) {
    const cssParts = [];
    const jsParts = [];
    
    // Check for edited global CSS first (even if not saved)
    const globalCSSTextarea = document.querySelector('.code-textarea[data-code-id="global-css"]');
    const globalCSS = globalCSSTextarea ? globalCSSTextarea.value : this.generatedCode?.globalCSS;
    if (globalCSS) {
      cssParts.push(globalCSS);
    }
    
    // Check for edited variation CSS
    const variationCSSId = `v${variation.number}-css`;
    const variationCSSTextarea = document.querySelector(`.code-textarea[data-code-id="${variationCSSId}"]`);
    const variationCSS = variationCSSTextarea ? variationCSSTextarea.value : variation?.css;
    if (variationCSS) {
      cssParts.push(variationCSS);
    }
    
    // Check for edited global JS
    const globalJSTextarea = document.querySelector('.code-textarea[data-code-id="global-js"]');
    const globalJS = globalJSTextarea ? globalJSTextarea.value : this.generatedCode?.globalJS;
    if (globalJS) {
      jsParts.push(globalJS);
    }
    
    // Check for edited variation JS
    const variationJSId = `v${variation.number}-js`;
    const variationJSTextarea = document.querySelector(`.code-textarea[data-code-id="${variationJSId}"]`);
    const variationJS = variationJSTextarea ? variationJSTextarea.value : variation?.js;
    if (variationJS) {
      jsParts.push(variationJS);
    }

    const combine = (parts) => parts
      .map(part => typeof part === 'string' ? part.trim() : '')
      .filter(Boolean)
      .join('\n\n');

    const css = combine(cssParts);
    const js = combine(jsParts);

    return {
      css: css || null,
      js: js || null
    };
  }

  updatePreviewActiveState() {
    const list = document.getElementById('variationPreviewList');
    const clearBtn = document.getElementById('clearPreviewBtn');
    const hint = document.getElementById('variationPreviewHint');

    if (list) {
      list.querySelectorAll('.variation-preview-item').forEach(item => {
        const number = parseInt(item.getAttribute('data-variation-number'), 10);
        item.classList.toggle('active', this.previewState.activeVariation === number);
        item.classList.toggle('focused', this.isVariationFocusedByNumber(number));
      });
    }

    if (clearBtn) {
      if (this.previewState.activeVariation) {
        clearBtn.disabled = false;
        clearBtn.classList.remove('disabled');
      } else {
        clearBtn.disabled = true;
        clearBtn.classList.add('disabled');
      }
    }

    if (hint) {
      hint.textContent = this.previewState.activeVariation
        ? 'Preview is active on the current tab.'
        : 'Preview is off. Choose a variation to apply it to the active tab.';
    }
  }

  async previewVariation(variationNumber, options = {}) {
    const { silent = false } = options;
    if (!this.generatedCode) {
      this.showError('Generate code before previewing variations');
      return;
    }

    const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
    if (!variation) {
      this.showError('Variation not found');
      return;
    }

    let tab;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs?.[0];
    } catch (error) {
      console.error('Failed to query active tab:', error);
    }

    if (!tab) {
      this.showError('No active tab available for preview');
      return;
    }

    const variationName = variation.name || `Variation ${variationNumber}`;

    if (!silent) {
      this.addStatusLog(`🎯 Previewing ${variationName} on active tab`, 'info');
    }

    const resetBase = await this.resetVariationOnTab(tab.id, 'convert-ai-');
    const resetPreview = await this.resetVariationOnTab(tab.id, 'convert-ai-preview');

    if (!resetBase && !resetPreview) {
      const message = 'Unable to prepare the page for preview. Reload the page and try again.';
      this.addStatusLog(`✗ ${message}`, 'error');
      this.showError(message);
      return;
    }

    const payload = this.buildVariationPayload(variation);

    let applyResponse;
    try {
      applyResponse = await chrome.runtime.sendMessage({
        type: 'APPLY_VARIATION',
        tabId: tab.id,
        key: `convert-ai-preview-${variationNumber}`,
        css: payload.css,
        js: payload.js
      });
    } catch (error) {
      if (!silent) {
        this.addStatusLog(`✗ Preview apply failed: ${error.message}`, 'error');
      }
      this.showError(error.message || 'Failed to apply variation preview');
      return;
    }

    if (Array.isArray(applyResponse?.logs)) {
      this.logOperationEntries(applyResponse.logs, applyResponse.success ? 'info' : 'error');
    }

    if (!applyResponse?.success) {
      const errorMessage = applyResponse?.error || 'Failed to apply variation preview';
      if (!silent) {
        this.addStatusLog(`✗ Preview failed: ${errorMessage}`, 'error');
      }
      this.showError(errorMessage);
      return;
    }

    this.previewState.activeVariation = variationNumber;
    this.updatePreviewActiveState();
    if (!silent) {
      this.setAiActivity('preview', `${variationName} applied to the page.`);
    }
    if (!silent) {
      this.showSuccess(`${variationName} applied to the page`);
    }
  }

  async retestVariation(variationNumber) {
    if (!this.generatedCode) {
      this.showError('Generate code before testing variations');
      return;
    }

    const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
    if (!variation) {
      this.showError('Variation not found');
      return;
    }

    const variationName = variation.name || `Variation ${variationNumber}`;
    this.addStatusLog(`🔁 Retesting ${variationName}...`, 'info');
    const result = await this.testVariation(variationNumber);

    if (!result) {
      this.addStatusLog('✗ Unable to retest variation', 'error');
      this.showError('Variation test failed');
      return;
    }

    if (result.errors.length) {
      this.addStatusLog(`✗ ${variationName} reported ${result.errors.length} issue(s)`, 'error');
      result.errors.forEach((err, idx) => {
        this.addStatusLog(`    ${idx + 1}. ${err}`, 'error');
      });
      this.updateIndicator('error');
    } else {
      this.addStatusLog(`✓ ${variationName} passed manual retest`, 'success');
      this.updateIndicator('active');
      this.showSuccess(`${variationName} retested successfully`);
    }

    this.previewState.activeVariation = variationNumber;
    this.updatePreviewActiveState();
  }

  isMissingContentScriptError(error) {
    if (!error) return false;
    const message = error.message || String(error);
    return message.includes('Receiving end does not exist') ||
      message.includes('No matching message handler') ||
      message.includes('Could not establish connection');
  }

  async ensureContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/page-capture.js']
      });
      await this.sleep(100);
      return true;
    } catch (error) {
      console.warn('Content script injection failed:', error);
      return false;
    }
  }

  async resetVariationOnTab(tabId, keyPrefix = 'convert-ai-') {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'RESET_VARIATION',
        keyPrefix
      });
      return true;
    } catch (error) {
      if (!this.isMissingContentScriptError(error)) {
        console.warn('Reset variation failed:', error);
        return false;
      }

      const injected = await this.ensureContentScript(tabId);
      if (!injected) {
        return false;
      }

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'RESET_VARIATION',
          keyPrefix
        });
        return true;
      } catch (retryError) {
        console.warn('Reset variation retry failed:', retryError);
        return false;
      }
    }
  }

  async clearVariationPreview(showToast = true) {
    const hadActive = !!this.previewState.activeVariation;
    this.previewState.activeVariation = null;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (tab) {
        await this.resetVariationOnTab(tab.id, 'convert-ai-preview');
        await this.resetVariationOnTab(tab.id, 'convert-ai-');
      }
    } catch (error) {
      console.warn('Failed to clear variation preview:', error);
    }

    this.updatePreviewActiveState();

    if (!this.previewState.activeVariation) {
      this.setAiActivity('idle', 'Preview cleared. Select a variation to apply it again.');
    }

    if (showToast && hadActive) {
      this.showSuccess('Preview cleared from the page');
    }
  }

  displayTestScreenshot(screenshotData, variationNumber) {
    const container = document.getElementById('testScreenshot');
    const img = document.getElementById('screenshotImg');
    const meta = document.getElementById('screenshotMeta');
    
    img.src = screenshotData;
    meta.textContent = `Variation ${variationNumber} - ${new Date().toLocaleTimeString()}`;
    container.classList.remove('hidden');
  }

  stopIteration() {
    this.autoIteration.active = false;
    this.addStatusLog('⏸ Auto-iteration stopped', 'info');
    document.getElementById('stopIterationBtn')?.classList.add('hidden');
  }

  recordUsage(usage) {
    if (!usage) return;
    const promptTokens = usage.promptTokens || usage.inputTokens || 0;
    const completionTokens = usage.completionTokens || usage.outputTokens || 0;
    const tokens = promptTokens + completionTokens;

    this.usageStats.tokens += tokens;
    const costDelta = this.calculateCost(usage);
    this.usageStats.cost = Number((this.usageStats.cost + costDelta).toFixed(6));
    this.updateUsageDisplay();
    this.persistUsageStats();
  }

  calculateCost(usage) {
    const prices = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4.1-mini': { input: 0.00015, output: 0.0006 },
      default: { input: 0.00015, output: 0.0006 }
    };
    const rawModel = (usage?.model || this.settings.model || 'gpt-4o-mini').toLowerCase();
    const normalizedModel = rawModel.startsWith('gpt-4o-mini')
      ? 'gpt-4o-mini'
      : rawModel.startsWith('gpt-4.1-mini')
        ? 'gpt-4.1-mini'
        : rawModel.startsWith('gpt-4o')
          ? 'gpt-4o'
          : 'default';
    const pricing = prices[normalizedModel] || prices.default;

    const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
    const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;
    return ((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1000;
  }

  updateUsageDisplay() {
    const el = document.getElementById('usageStats');
    if (el) {
      el.textContent = `Tokens: ${this.usageStats.tokens} | Cost: $${this.usageStats.cost.toFixed(4)}`;
    }
  }

  async loadUsageStats() {
    if (!this.usageStorage?.get) return;
    try {
      const result = await this.usageStorage.get(['usageStats']);
      if (result?.usageStats) {
        const { tokens = 0, cost = 0 } = result.usageStats;
        this.usageStats = {
          tokens: Number(tokens) || 0,
          cost: Number(cost) || 0
        };
        this.updateUsageDisplay();
      }
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  }

  async persistUsageStats() {
    if (!this.usageStorage?.set) return;
    try {
      await this.usageStorage.set({ usageStats: this.usageStats });
    } catch (error) {
      console.error('Failed to persist usage stats:', error);
    }
  }

  getUsageStorageArea() {
    if (chrome?.storage?.session) {
      return chrome.storage.session;
    }
    return chrome?.storage?.local;
  }

  showStatusPanel() {
    const panel = document.getElementById('statusPanel');
    if (panel) {
      panel.classList.remove('hidden');
    }
    this.switchPanel('review');
  }

  addStatusLog(message, type = 'info') {
    const log = document.getElementById('statusLog');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  logOperationEntries(entries, type = 'info') {
    if (!Array.isArray(entries) || !entries.length) return;
    entries.forEach(entry => {
      this.addStatusLog(`LOG ▶ ${entry}`, type);
    });
  }

  updateIndicator(state) {
    const indicator = document.getElementById('statusIndicator');
    indicator.className = `indicator ${state}`;
  }

  async copyLog() {
    const log = document.getElementById('statusLog').textContent;
    await navigator.clipboard.writeText(log);
    this.showSuccess('Log copied!');
  }

  async clearResults() {
    await this.clearVariationPreview(false);
    document.getElementById('resultsPanel').classList.add('hidden');
    document.getElementById('variationPreview')?.classList.add('hidden');
    const list = document.getElementById('variationPreviewList');
    if (list) list.innerHTML = '';
    this.generatedCode = null;
    this.editedCode = {}; // Reset edited code tracking
    this.setAiActivity('idle', 'Preview cleared. Generate new code to continue.');

    if (typeof this.updateConvertActionState === 'function') {
      this.updateConvertActionState();
    }
  }

  exportAll() {
    if (!this.generatedCode) {
      this.showError('No code to export');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    this.generatedCode.variations.forEach(v => {
      if (v.css) this.downloadFile(`${v.name.toLowerCase().replace(/\s+/g, '-')}.css`, v.css);
      if (v.js) this.downloadFile(`${v.name.toLowerCase().replace(/\s+/g, '-')}.js`, v.js);
    });

    if (this.generatedCode.globalCSS) this.downloadFile('global.css', this.generatedCode.globalCSS);
    if (this.generatedCode.globalJS) this.downloadFile('global.js', this.generatedCode.globalJS);

    this.showSuccess('Files exported successfully!');
  }

  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  serializeCode(code) {
    if (!code) return '';
    let output = '';
    code.variations.forEach(v => {
      if (v.css) output += `// VARIATION ${v.number} - ${v.name}\n// VARIATION CSS\n${v.css}\n\n`;
      if (v.js) output += `// VARIATION ${v.number} - ${v.name}\n// VARIATION JAVASCRIPT\n${v.js}\n\n`;
    });
    if (code.globalCSS) output += `// GLOBAL CSS\n${code.globalCSS}\n\n`;
    if (code.globalJS) output += `// GLOBAL JS\n${code.globalJS}\n\n`;
    return output;
  }

  syncVariationNamesFromCode(codeData) {
    if (!codeData?.variations?.length) {
      return;
    }

    const generatedByNumber = new Map();
    codeData.variations.forEach(variation => {
      if (typeof variation.number === 'number') {
        generatedByNumber.set(variation.number, variation);
      }
    });

    let updated = false;
    const mapped = this.variations.map((config, index) => {
      const candidate = generatedByNumber.get(config.id) ||
        generatedByNumber.get(index + 1) ||
        codeData.variations[index];

      if (candidate?.name && candidate.name !== config.name) {
        updated = true;
        return { ...config, name: candidate.name };
      }
      return config;
    });

    let augmented = mapped;
    if (codeData.variations.length > mapped.length) {
      let maxId = mapped.reduce((max, variation) => Math.max(max, variation.id || 0), 0);
      augmented = [...mapped];
      for (let i = mapped.length; i < codeData.variations.length; i++) {
        maxId += 1;
        const generated = codeData.variations[i];
        augmented.push({
          id: maxId,
          name: generated?.name || `Variation ${i + 1}`,
          description: ''
        });
      }
      updated = true;
    }

    this.variations = augmented;

    if (updated) {
      this.renderVariations();
    }
  }

  // ============================================
  // Code Editing Methods
  // ============================================

  handleCodeEdit(codeId, textarea) {
    const originalContent = textarea.getAttribute('data-original-content');
    const currentContent = textarea.value;
    const isModified = currentContent !== originalContent;

    // Update textarea styling
    textarea.classList.toggle('modified', isModified);

    // Show/hide save and revert buttons
    const tabContent = textarea.closest('.tab-content');
    const saveBtn = tabContent.querySelector('.save-code-btn');
    const revertBtn = tabContent.querySelector('.revert-code-btn');
    
    if (saveBtn) saveBtn.style.display = isModified ? 'inline-block' : 'none';
    if (revertBtn) revertBtn.style.display = isModified ? 'inline-block' : 'none';

    // Update modified badge in tab title
    const header = tabContent.querySelector('.code-title');
    const existingBadge = header.querySelector('.code-modified-badge');
    
    if (isModified && !existingBadge) {
      const badge = document.createElement('span');
      badge.className = 'code-modified-badge';
      badge.textContent = '✏️ Modified';
      header.appendChild(badge);
    } else if (!isModified && existingBadge) {
      existingBadge.remove();
    }
  }

  saveCodeEdit(codeId) {
    const textarea = document.querySelector(`.code-textarea[data-code-id="${codeId}"]`);
    if (!textarea) return;

    const currentContent = textarea.value;
    this.editedCode[codeId] = currentContent;

    // Update the generated code object with edited content
    this.updateGeneratedCodeWithEdits(codeId, currentContent);

    // Update original content attribute so it's no longer "modified"
    textarea.setAttribute('data-original-content', this.escapeAttr(currentContent));
    
    // Trigger re-check
    this.handleCodeEdit(codeId, textarea);
    
    this.addStatusLog(`✅ Saved edits to ${codeId}`, 'success');
    this.showSuccess('Code changes saved!');

    const match = codeId.match(/^v(\d+)-(css|js)$/);
    if (match) {
      const variationNumber = parseInt(match[1], 10);
      this.autoValidateVariation(variationNumber, {
        origin: 'Manual edit validation',
        updateConvertStatus: true
      }).catch(error => {
        console.error('Auto validation after save failed:', error);
      });
    }
  }

  revertCodeEdit(codeId) {
    const textarea = document.querySelector(`.code-textarea[data-code-id="${codeId}"]`);
    if (!textarea) return;

    const originalContent = textarea.getAttribute('data-original-content');
    textarea.value = originalContent;
    
    // Remove from edited code tracking
    delete this.editedCode[codeId];
    
    // Trigger re-check
    this.handleCodeEdit(codeId, textarea);
    
    this.addStatusLog(`↩️ Reverted ${codeId} to original`, 'info');
    this.showSuccess('Code reverted to original');
  }

  updateGeneratedCodeWithEdits(codeId, content) {
    if (!this.generatedCode) return;

    // Parse the code ID to update the right part of generatedCode
    const match = codeId.match(/v(\d+)-(css|js)/);
    if (match) {
      const variationNumber = parseInt(match[1]);
      const type = match[2];
      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (variation) {
        variation[type] = content;
      }
    } else if (codeId === 'global-css') {
      this.generatedCode.globalCSS = content;
    } else if (codeId === 'global-js') {
      this.generatedCode.globalJS = content;
    }
  }





  getCurrentCodeForId(codeId) {
    const textarea = document.querySelector(`.code-textarea[data-code-id="${codeId}"]`);
    return textarea ? textarea.value : (this.editedCode[codeId] || '');
  }

  escapeAttr(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ============================================
  // End Code Editing Methods
  // ============================================

  // ============================================
  // Convert.com Integration Methods
  // ============================================

  initializeConvertState() {
    this.convertState = {
      apiKeys: [],
      apiKeyId: '',
      credentials: null,
      accounts: [],
      accountId: '',
      projects: [],
      projectId: '',
      experiences: [],
      experienceId: '',
      baselineVariation: null,
      variationStore: new Map(),
      experienceDetails: null,
      creationMode: false,
      statusTimer: null
    };
  }

  initializeUtilities() {
    // Initialize keyboard shortcuts
    this.keyboardShortcuts.init();
    console.log('⌨️ Keyboard shortcuts initialized');

    // Setup session auto-save
    this.sessionManager.setupAutoSave();
    console.log('💾 Session auto-save initialized');

    // Try to restore previous session
    this.restoreSession();

    // Setup capture mode toggles
    this.setupCaptureModeToggles();

    // Setup design file upload
    this.setupDesignFileUpload();

    // Setup prompt helper
    this.setupPromptHelper();

    // Setup template library
    this.setupTemplateLibrary();

    console.log('✅ All utilities initialized');
  }

  async restoreSession() {
    const session = await this.sessionManager.loadSession();
    if (session) {
      this.sessionManager.showRestoreDialog(session);
    }
  }

  setupCaptureModeToggles() {
    const fullBtn = document.getElementById('captureModeFull');
    const elementBtn = document.getElementById('captureModeElement');
    const selectionHint = document.getElementById('elementSelectionHint');
    const selectedPreview = document.getElementById('selectedElementPreview');

    if (!fullBtn || !elementBtn) return;

    fullBtn.addEventListener('click', () => {
      this.captureMode = 'full';
      fullBtn.classList.add('active');
      elementBtn.classList.remove('active');
      
      // Hide element-specific UI
      selectionHint?.classList.add('hidden');
      selectedPreview?.classList.add('hidden');
      
      this.addStatusLog('📄 Capture mode: Full page', 'info');
    });

    elementBtn.addEventListener('click', () => {
      this.captureMode = 'element';
      elementBtn.classList.add('active');
      fullBtn.classList.remove('active');
      
      // Show element selection hint
      selectionHint?.classList.remove('hidden');
      
      this.addStatusLog('🎯 Capture mode: Select element - Click "Capture Page" then select an element', 'info');
    });

    // Setup change selection button
    const changeSelectionBtn = document.getElementById('changeSelectionBtn');
    changeSelectionBtn?.addEventListener('click', () => {
      selectedPreview?.classList.add('hidden');
      selectionHint?.classList.remove('hidden');
      this.currentPageData.selectedElement = null;
      this.addStatusLog('🎯 Click "Capture Page" to select a new element', 'info');
    });
  }

  setupDesignFileUpload() {
    const uploadBox = document.getElementById('uploadBox');
    const fileInput = document.getElementById('designFileInput');
    const previewGrid = document.getElementById('designPreviewGrid');

    if (!uploadBox || !fileInput || !previewGrid) return;

    // Click to browse
    uploadBox.addEventListener('click', () => fileInput.click());

    // Drag and drop
    uploadBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadBox.classList.add('drag-over');
    });

    uploadBox.addEventListener('dragleave', () => {
      uploadBox.classList.remove('drag-over');
    });

    uploadBox.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadBox.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files);
      await this.handleDesignFiles(files);
    });

    // File input change
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      await this.handleDesignFiles(files);
    });
  }

  async handleDesignFiles(files) {
    for (const file of files) {
      try {
        const processed = await this.designFileManager.addFile(file);
        this.renderDesignPreview(processed);
        this.addStatusLog(`✅ Added design file: ${file.name}`, 'success');
      } catch (error) {
        this.showError(error.message);
      }
    }
  }

  renderDesignPreview(file) {
    const previewGrid = document.getElementById('designPreviewGrid');
    if (!previewGrid) return;

    const card = document.createElement('div');
    card.innerHTML = this.designFileManager.generatePreviewCard(file);
    previewGrid.appendChild(card.firstElementChild);

    // Bind remove button
    const removeBtn = card.querySelector('.design-remove-btn');
    removeBtn?.addEventListener('click', () => {
      this.designFileManager.removeFile(file.id);
      card.firstElementChild.remove();
      this.addStatusLog(`🗑️ Removed design file: ${file.name}`, 'info');
    });

    // Bind notes input
    const notesInput = card.querySelector('.design-notes-input');
    notesInput?.addEventListener('input', (e) => {
      this.designFileManager.updateFileNotes(file.id, e.target.value);
    });
  }

  setupPromptHelper() {
    const suggestionsBtn = document.getElementById('showSuggestionsBtn');
    const examplesBtn = document.getElementById('showExamplesBtn');
    const templatesBtn = document.getElementById('showTemplatesBtn');
    const suggestionChips = document.getElementById('suggestionChips');
    const chipsContainer = document.getElementById('chipsContainer');

    if (!suggestionsBtn || !examplesBtn || !templatesBtn) return;

    // Show/hide suggestions
    suggestionsBtn.addEventListener('click', () => {
      const isVisible = suggestionChips.style.display !== 'none';
      if (isVisible) {
        suggestionChips.style.display = 'none';
      } else {
        this.showPromptSuggestions();
        suggestionChips.style.display = 'block';
      }
    });

    // Show examples modal
    examplesBtn.addEventListener('click', () => {
      this.showExamplesModal();
    });

    // Show templates (reuse existing template functionality)
    templatesBtn.addEventListener('click', () => {
      this.showTemplateLibrary();
    });

    // Setup examples modal
    this.setupExamplesModal();
  }

  showPromptSuggestions() {
    const chipsContainer = document.getElementById('chipsContainer');
    if (!chipsContainer) return;

    // Get suggestions based on current context
    const selectedElement = this.currentPageData?.selectedElement;
    const suggestions = this.promptAssistant.getSuggestionsForElement(selectedElement);

    // Clear existing chips
    chipsContainer.innerHTML = '';

    // Create suggestion chips
    suggestions.forEach(suggestion => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = suggestion;
      chip.addEventListener('click', () => {
        this.insertSuggestion(suggestion);
      });
      chipsContainer.appendChild(chip);
    });
  }

  insertSuggestion(suggestion) {
    const descriptionText = document.getElementById('descriptionText');
    if (!descriptionText) return;

    const currentText = descriptionText.value;
    const newText = currentText ? `${currentText}\n\n${suggestion}` : suggestion;
    
    descriptionText.value = newText;
    descriptionText.focus();

    // Update character count if it exists
    const charCount = document.getElementById('charCount');
    if (charCount) {
      charCount.textContent = newText.length;
    }

    // Hide suggestions after selection
    const suggestionChips = document.getElementById('suggestionChips');
    if (suggestionChips) {
      suggestionChips.style.display = 'none';
    }
  }

  setupExamplesModal() {
    const modal = document.getElementById('examplesModal');
    const closeBtn = document.getElementById('closeExamplesModal');
    const overlay = modal?.querySelector('.modal-overlay');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    overlay?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Make example cards clickable
    modal.addEventListener('click', (e) => {
      const exampleCard = e.target.closest('.example-card');
      if (exampleCard) {
        const exampleText = exampleCard.querySelector('.example-text')?.textContent;
        if (exampleText) {
          this.insertSuggestion(exampleText.replace(/["""]/g, ''));
          modal.classList.add('hidden');
        }
      }
    });
  }

  showExamplesModal() {
    const modal = document.getElementById('examplesModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  setupTemplateLibrary() {
    const browseBtn = document.getElementById('browseTemplatesBtn');
    const modal = document.getElementById('templateModal');
    const closeBtn = document.getElementById('closeTemplateModal');
    const overlay = modal?.querySelector('.modal-overlay');

    if (!browseBtn || !modal) return;

    browseBtn.addEventListener('click', () => {
      this.showTemplateLibrary();
    });

    closeBtn?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    overlay?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  showTemplateLibrary() {
    const modal = document.getElementById('templateModal');
    const grid = document.getElementById('templateGrid');

    if (!modal || !grid) return;

    // Get templates from prompt assistant
    const templates = this.promptAssistant.templates;

    // Render template cards
    grid.innerHTML = Object.entries(templates).map(([id, template]) => `
      <div class="template-card" data-template-id="${id}">
        <div class="template-icon">${template.icon}</div>
        <h4>${template.name}</h4>
        <p>${template.description}</p>
        <div class="template-meta">${template.variations.length} variations</div>
        <button class="btn-primary template-apply-btn">Apply Template</button>
      </div>
    `).join('');

    // Bind apply buttons
    grid.querySelectorAll('.template-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.template-card');
        const templateId = card.getAttribute('data-template-id');
        this.applyTemplate(templateId);
        modal.classList.add('hidden');
      });
    });

    modal.classList.remove('hidden');
  }

  applyTemplate(templateId) {
    const template = this.promptAssistant.templates[templateId];
    if (!template) return;

    // Clear existing variations
    this.variations = [];

    // Add template variations
    template.variations.forEach((v, idx) => {
      this.variations.push({
        id: idx + 1,
        name: v.name,
        description: v.instructions
      });
    });

    // Update focused variation
    this.focusedVariationId = this.variations[0]?.id || 1;

    // Re-render
    this.renderVariations();
    this.updateFocusedVariationWorkspace();

    this.showSuccess(`Applied template: ${template.name}`);
    this.addStatusLog(`📋 Applied template: ${template.name} (${template.variations.length} variations)`, 'success');
  }

  getConvertElements() {
    return {
      section: document.getElementById('convertIntegrationSection'),
      apiKeySelect: document.getElementById('convertApiKeySelect'),
      accountSelect: document.getElementById('convertAccountSelect'),
      projectSelect: document.getElementById('convertProjectSelect'),
      experienceSelect: document.getElementById('convertExperienceSelect'),
      refreshProjectsBtn: document.getElementById('refreshConvertProjectsBtn'),
      refreshExperiencesBtn: document.getElementById('refreshConvertExperiencesBtn'),
      createFields: document.getElementById('convertCreateFields'),
      status: document.getElementById('convertStatus'),
      experienceMeta: document.getElementById('convertExperienceMeta'),
      experienceStatus: document.getElementById('convertExperienceStatus'),
      experienceType: document.getElementById('convertExperienceType'),
      experienceUpdated: document.getElementById('convertExperienceUpdated'),
      importBtn: document.getElementById('importExperienceBtn'),
      pushBtn: document.getElementById('pushExperienceBtn'),
      runBtn: document.getElementById('runConvertPreviewBtn'),
      newExperienceName: document.getElementById('convertNewExperienceName'),
      newExperienceType: document.getElementById('convertNewExperienceType'),
      newExperienceUrl: document.getElementById('convertNewExperienceUrl'),
      newBaselineName: document.getElementById('convertNewBaselineName'),
      newVariationName: document.getElementById('convertNewVariationName')
    };
  }

  resetConvertSelect(selectEl, placeholder, includeCreate = false) {
    if (!selectEl) return;
    let html = `<option value="">${placeholder}</option>`;
    if (includeCreate) {
      html += '<option value="__create__">➕ Create New Experience</option>';
    }
    selectEl.innerHTML = html;
    selectEl.disabled = true;
  }

  async loadConvertAPIKeys() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CONVERT_API_KEYS' });
      if (response?.success) {
        this.convertState.apiKeys = response.keys || [];
        this.populateConvertApiKeys();
      }
    } catch (error) {
      console.error('Failed to load Convert API keys:', error);
      this.setConvertStatus('Failed to load Convert API keys', 'error');
    }
  }

  populateConvertApiKeys() {
    const elements = this.getConvertElements();
    if (!elements.apiKeySelect) return;

    const keys = this.convertState.apiKeys || [];
    const previousSelection = this.convertState.apiKeyId;
    const options = ['<option value="">-- Select API Key --</option>']
      .concat(keys.map(key => `<option value="${key.id}">${this.escapeHtml(key.label || 'Unnamed Key')}</option>`));

    elements.apiKeySelect.innerHTML = options.join('');
    elements.apiKeySelect.disabled = keys.length === 0;

    if (previousSelection && keys.some(key => key.id === previousSelection)) {
      elements.apiKeySelect.value = previousSelection;
      this.onConvertApiKeyChange();
    } else {
      this.onConvertApiKeyChange();
    }
  }

  getActiveConvertCredentials(refresh = false) {
    if (refresh) {
      this.convertState.credentials = null;
    }
    if (this.convertState.credentials) {
      return this.convertState.credentials;
    }
    const key = this.convertState.apiKeys.find(k => k.id === this.convertState.apiKeyId);
    if (!key) return null;
    this.convertState.credentials = {
      apiKey: key.apiKey,
      apiSecret: key.apiSecret
    };
    return this.convertState.credentials;
  }

  async onConvertApiKeyChange() {
    const elements = this.getConvertElements();
    const selectedId = elements.apiKeySelect?.value || '';
    this.convertState.apiKeyId = selectedId;
    this.convertState.credentials = null;
    this.convertState.accounts = [];
    this.convertState.accountId = '';
    this.convertState.projects = [];
    this.convertState.projectId = '';
    this.convertState.experiences = [];
    this.convertState.experienceId = '';
    this.convertState.baselineVariation = null;
    this.convertState.variationStore = new Map();
    this.convertState.experienceDetails = null;
    this.convertState.creationMode = false;

    this.resetConvertSelect(elements.accountSelect, '-- Select Account --');
    this.resetConvertSelect(elements.projectSelect, '-- Select Project --');
    this.resetConvertSelect(elements.experienceSelect, '-- Select Experience --', true);
    if (elements.refreshProjectsBtn) elements.refreshProjectsBtn.disabled = true;
    if (elements.refreshExperiencesBtn) elements.refreshExperiencesBtn.disabled = true;
    this.toggleConvertCreationMode(false);
    this.updateConvertExperienceMeta(null);
    this.setConvertStatus('');

    if (!selectedId) {
      this.updateConvertActionState();
      return;
    }

    try {
      await this.fetchConvertAccounts();
    } catch (error) {
      this.setConvertStatus(error.message, 'error');
    } finally {
      this.updateConvertActionState();
    }
  }

  async fetchConvertAccounts() {
    const elements = this.getConvertElements();
    const credentials = this.getActiveConvertCredentials(true);
    if (!credentials) {
      throw new Error('Select a Convert.com API key to continue');
    }

    try {
      this.setConvertStatus('Loading accounts…', 'info');
      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_LIST_ACCOUNTS',
        credentials
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Unable to load accounts');
      }

      this.convertState.accounts = response.accounts || [];
      this.populateConvertAccounts();
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      throw error;
    }
  }

  populateConvertAccounts() {
    const elements = this.getConvertElements();
    if (!elements.accountSelect) return;

    const accounts = this.convertState.accounts || [];
    
    // Sort accounts using smart lists
    const sortedAccounts = this.convertSmartLists.sortAccounts(accounts);
    
    const options = ['<option value="">-- Select Account --</option>']
      .concat(sortedAccounts.map(account => {
        const enhanced = this.convertSmartLists.enhanceAccountDisplay(account);
        const searchAttr = ` data-search="${this.escapeHtml(enhanced.searchText)}"`;
        return `<option value="${enhanced.value}"${searchAttr}>${enhanced.html}</option>`;
      }));

    elements.accountSelect.innerHTML = options.join('');
    elements.accountSelect.disabled = accounts.length === 0;

    // Add enhanced class for styling
    elements.accountSelect.className = 'convert-enhanced-select';

    if (accounts.length === 1) {
      elements.accountSelect.value = accounts[0].id;
      this.onConvertAccountChange();
    } else {
      this.updateConvertActionState();
    }

    this.setConvertStatus('');
  }

  async onConvertAccountChange() {
    const elements = this.getConvertElements();
    const accountId = elements.accountSelect?.value || '';
    this.convertState.accountId = accountId;
    this.convertState.projects = [];
    this.convertState.projectId = '';
    this.convertState.experiences = [];
    this.convertState.experienceId = '';
    this.convertState.baselineVariation = null;
    this.convertState.variationStore = new Map();
    this.convertState.experienceDetails = null;

    this.resetConvertSelect(elements.projectSelect, '-- Select Project --');
    this.resetConvertSelect(elements.experienceSelect, '-- Select Experience --', true);
    this.toggleConvertCreationMode(false);
    this.updateConvertExperienceMeta(null);
    this.setConvertStatus('');

    if (elements.refreshProjectsBtn) {
      elements.refreshProjectsBtn.disabled = !accountId;
    }
    if (elements.refreshExperiencesBtn) {
      elements.refreshExperiencesBtn.disabled = true;
    }

    if (!accountId) {
      this.updateConvertActionState();
      return;
    }

    try {
      await this.refreshConvertProjects(true);
    } catch (error) {
      this.setConvertStatus(error.message, 'error');
    } finally {
      this.updateConvertActionState();
    }
  }

  async refreshConvertProjects(force = false) {
    const elements = this.getConvertElements();
    if (!this.convertState.accountId) {
      throw new Error('Select an account to load projects');
    }

    const credentials = this.getActiveConvertCredentials();
    if (!credentials) {
      throw new Error('Select a Convert.com API key to continue');
    }

    try {
      if (elements.projectSelect) elements.projectSelect.disabled = true;
      if (elements.refreshProjectsBtn) elements.refreshProjectsBtn.disabled = true;
      this.setConvertStatus('Loading projects…', 'info');

      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_LIST_PROJECTS',
        credentials,
        accountId: this.convertState.accountId,
        options: { resultsPerPage: 200 }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Unable to load projects');
      }

      this.convertState.projects = response.projects || [];
      this.populateConvertProjects();
    } finally {
      if (elements.refreshProjectsBtn) {
        elements.refreshProjectsBtn.disabled = !this.convertState.accountId;
      }
      this.setConvertStatus('');
      this.updateConvertActionState();
    }
  }

  populateConvertProjects() {
    const elements = this.getConvertElements();
    if (!elements.projectSelect) return;

    const projects = this.convertState.projects || [];
    
    // Sort projects using smart lists
    const sortedProjects = this.convertSmartLists.sortProjects(projects);
    
    const options = ['<option value="">-- Select Project --</option>']
      .concat(sortedProjects.map(project => {
        const enhanced = this.convertSmartLists.enhanceProjectDisplay(project);
        const metaAttr = enhanced.meta ? ` data-meta="${this.escapeHtml(enhanced.meta)}"` : '';
        const searchAttr = ` data-search="${this.escapeHtml(enhanced.searchText)}"`;
        return `<option value="${enhanced.value}"${metaAttr}${searchAttr}>${enhanced.html}</option>`;
      }));

    elements.projectSelect.innerHTML = options.join('');
    elements.projectSelect.disabled = projects.length === 0;

    // Add enhanced class for styling
    elements.projectSelect.className = 'convert-enhanced-select';

    // Add search functionality for large lists
    if (projects.length > 10) {
      this.convertSmartLists.addSearchToSelect(elements.projectSelect);
    }

    if (projects.length === 1) {
      elements.projectSelect.value = projects[0].id;
      this.onConvertProjectChange();
    }
  }

  async onConvertProjectChange() {
    const elements = this.getConvertElements();
    const projectId = elements.projectSelect?.value || '';
    this.convertState.projectId = projectId;
    this.convertState.experiences = [];
    this.convertState.experienceId = '';
    this.convertState.baselineVariation = null;
    this.convertState.variationStore = new Map();
    this.convertState.experienceDetails = null;

    this.resetConvertSelect(elements.experienceSelect, '-- Select Experience --', true);
    this.toggleConvertCreationMode(false);
    this.updateConvertExperienceMeta(null);
    this.setConvertStatus('');

    if (elements.refreshExperiencesBtn) {
      elements.refreshExperiencesBtn.disabled = !projectId;
    }

    if (!projectId) {
      this.updateConvertActionState();
      return;
    }

    try {
      await this.refreshConvertExperiences(true);
    } catch (error) {
      this.setConvertStatus(error.message, 'error');
    } finally {
      this.updateConvertActionState();
    }
  }

  async refreshConvertExperiences(force = false) {
    const elements = this.getConvertElements();
    if (!this.convertState.projectId) {
      throw new Error('Select a project to load experiences');
    }

    const credentials = this.getActiveConvertCredentials();
    if (!credentials) {
      throw new Error('Select a Convert.com API key to continue');
    }

    try {
      if (elements.experienceSelect) elements.experienceSelect.disabled = true;
      if (elements.refreshExperiencesBtn) elements.refreshExperiencesBtn.disabled = true;
      this.setConvertStatus('Loading experiences…', 'info');

      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_LIST_EXPERIENCES',
        credentials,
        accountId: this.convertState.accountId,
        projectId: this.convertState.projectId,
        options: { resultsPerPage: 200 }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Unable to load experiences');
      }

      this.convertState.experiences = response.experiences || [];
      this.populateConvertExperiences();
    } finally {
      if (elements.refreshExperiencesBtn) {
        elements.refreshExperiencesBtn.disabled = !this.convertState.projectId;
      }
      this.setConvertStatus('');
      this.updateConvertActionState();
    }
  }

  populateConvertExperiences() {
    const elements = this.getConvertElements();
    if (!elements.experienceSelect) return;

    const experiences = this.convertState.experiences || [];
    
    // Sort and group experiences using smart lists
    const sortedExperiences = this.convertSmartLists.sortExperiences(experiences);
    
    let optionsHtml;
    
    if (experiences.length > 5) {
      // Use grouped display for large lists
      const groups = this.convertSmartLists.groupExperiencesByStatus(sortedExperiences);
      optionsHtml = this.convertSmartLists.createGroupedSelect(
        groups, 
        this.convertSmartLists.enhanceExperienceDisplay.bind(this.convertSmartLists), 
        '-- Select Experience --'
      );
    } else {
      // Simple display for small lists
      const options = ['<option value="">-- Select Experience --</option>'];
      options.push('<option value="__create__">➕ Create New Experience</option>');
      
      sortedExperiences.forEach(experience => {
        const enhanced = this.convertSmartLists.enhanceExperienceDisplay(experience);
        const metaAttr = enhanced.meta ? ` data-meta="${this.escapeHtml(enhanced.meta)}"` : '';
        const searchAttr = ` data-search="${this.escapeHtml(enhanced.searchText)}"`;
        options.push(`<option value="${enhanced.value}"${metaAttr}${searchAttr}>${enhanced.html}</option>`);
      });
      
      optionsHtml = options.join('');
    }

    elements.experienceSelect.innerHTML = optionsHtml;
    elements.experienceSelect.disabled = false;

    // Add enhanced class for styling
    elements.experienceSelect.className = 'convert-enhanced-select';

    // Add search functionality for large lists
    if (experiences.length > 8) {
      this.convertSmartLists.addSearchToSelect(elements.experienceSelect);
    }
  }

  onConvertExperienceChange() {
    const elements = this.getConvertElements();
    const selected = elements.experienceSelect?.value || '';
    this.convertState.experienceId = '';
    this.convertState.creationMode = false;
    this.convertState.experienceDetails = null;
    this.convertState.baselineVariation = null;
    this.convertState.variationStore = new Map();

    this.toggleConvertCreationMode(false);
    this.updateConvertExperienceMeta(null);
    this.setConvertStatus('');

    if (!selected) {
      this.updateConvertActionState();
      return;
    }

    if (selected === '__create__') {
      this.toggleConvertCreationMode(true);
      this.prepareNewExperienceDefaults();
      this.updateConvertActionState();
      return;
    }

    this.convertState.experienceId = selected;
    this.updateConvertActionState();
  }

  toggleConvertCreationMode(enabled) {
    const elements = this.getConvertElements();
    this.convertState.creationMode = enabled;

    if (elements.createFields) {
      elements.createFields.classList.toggle('hidden', !enabled);
    }
    if (elements.importBtn) {
      elements.importBtn.disabled = enabled || !this.convertState.experienceId;
    }
  }

  prepareNewExperienceDefaults() {
    const elements = this.getConvertElements();

    const nameDefault = `AI Draft ${new Date().toLocaleDateString()}`;
    if (elements.newExperienceName) {
      if (!elements.newExperienceName.value) {
        elements.newExperienceName.value = nameDefault;
      }
    }

    if (elements.newBaselineName && !elements.newBaselineName.value) {
      elements.newBaselineName.value = 'Original';
    }

    if (elements.newVariationName && !elements.newVariationName.value) {
      const nextIndex = (this.generatedCode?.variations?.length || 0) + 1;
      elements.newVariationName.value = `Variation ${nextIndex}`;
    }

    const url = this.currentPageData?.url || '';
    if (elements.newExperienceUrl && !elements.newExperienceUrl.value) {
      elements.newExperienceUrl.value = url;
    }
  }

  updateConvertExperienceMeta(experience) {
    const elements = this.getConvertElements();
    if (!elements.experienceMeta) return;

    if (!experience) {
      elements.experienceMeta.classList.add('hidden');
      if (elements.experienceStatus) elements.experienceStatus.textContent = '-';
      if (elements.experienceType) elements.experienceType.textContent = '-';
      if (elements.experienceUpdated) elements.experienceUpdated.textContent = '-';
      return;
    }

    elements.experienceMeta.classList.remove('hidden');
    if (elements.experienceStatus) {
      elements.experienceStatus.textContent = experience.status || 'unknown';
    }
    if (elements.experienceType) {
      elements.experienceType.textContent = experience.type || 'a/b';
    }
    if (elements.experienceUpdated) {
      elements.experienceUpdated.textContent = this.formatConvertTimestamp(
        experience.updated_at || experience.updatedAt || experience.updatedAtUtc
      );
    }
  }

  setConvertStatus(message, type = 'info') {
    const elements = this.getConvertElements();
    if (!elements.status) return;

    if (this.convertState.statusTimer) {
      clearTimeout(this.convertState.statusTimer);
      this.convertState.statusTimer = null;
    }

    if (!message) {
      elements.status.innerHTML = '';
      return;
    }

    elements.status.innerHTML = `<div class="status-pill status-${type}">${message}</div>`;

    if (type !== 'error') {
      this.convertState.statusTimer = setTimeout(() => {
        if (elements.status) {
          elements.status.innerHTML = '';
        }
        this.convertState.statusTimer = null;
      }, 8000);
    }
  }

  updateConvertActionState() {
    const elements = this.getConvertElements();
    const hasCredentials = !!this.getActiveConvertCredentials();
    const hasAccount = !!this.convertState.accountId;
    const hasProject = !!this.convertState.projectId;
    const hasExperience = !!this.convertState.experienceId;
    const hasCode = !!(this.generatedCode && this.generatedCode.variations?.length);
    const inCreation = this.convertState.creationMode;

    if (elements.accountSelect) {
      elements.accountSelect.disabled = !hasCredentials || !this.convertState.accounts.length;
    }
    if (elements.projectSelect) {
      elements.projectSelect.disabled = !hasAccount || !this.convertState.projects.length;
    }
    if (elements.experienceSelect) {
      elements.experienceSelect.disabled = !hasProject;
    }
    if (elements.refreshProjectsBtn) {
      elements.refreshProjectsBtn.disabled = !hasAccount;
    }
    if (elements.refreshExperiencesBtn) {
      elements.refreshExperiencesBtn.disabled = !hasProject;
    }
    if (elements.importBtn) {
      elements.importBtn.disabled = inCreation || !hasExperience;
    }
    if (elements.pushBtn) {
      const canPush = hasProject && hasCredentials && ((inCreation && hasCode) || (!inCreation && hasExperience && hasCode));
      elements.pushBtn.disabled = !canPush;
    }
    if (elements.runBtn) {
      elements.runBtn.disabled = !hasCode;
    }
  }

  async importConvertExperience() {
    if (!this.convertState.experienceId) {
      this.setConvertStatus('Select an experience to import', 'info');
      return;
    }

    const credentials = this.getActiveConvertCredentials();
    if (!credentials) {
      this.setConvertStatus('Select a Convert.com API key', 'error');
      return;
    }

    const elements = this.getConvertElements();
    if (elements.importBtn) {
      elements.importBtn.disabled = true;
    }

    try {
      this.setConvertStatus('Fetching experience details…', 'info');
      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_GET_EXPERIENCE',
        credentials,
        accountId: this.convertState.accountId,
        projectId: this.convertState.projectId,
        experienceId: this.convertState.experienceId,
        options: { expand: ['variations', 'variations.changes'] }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to load experience');
      }

      const experience = response.experience;
      if (!experience) {
        throw new Error('Experience details were empty');
      }

      this.convertState.experienceDetails = experience;
      this.loadExperienceIntoBuilder(experience);
      this.updateConvertExperienceMeta(experience);
      this.setConvertStatus('✅ Experience synced into builder', 'success');
      this.addStatusLog(`✅ Imported Convert experience "${experience.name}"`, 'success');
    } catch (error) {
      console.error('Import experience failed:', error);
      this.setConvertStatus(`Failed to import experience: ${error.message}`, 'error');
      this.addStatusLog(`❌ Convert import failed: ${error.message}`, 'error');
    } finally {
      if (elements.importBtn) {
        elements.importBtn.disabled = false;
      }
      this.updateConvertActionState();
    }
  }

  loadExperienceIntoBuilder(experience) {
    const allVariations = Array.isArray(experience?.variations) ? experience.variations : [];
    const baseline = allVariations.find(v => v?.is_baseline);
    const variations = allVariations.filter(v => !v?.is_baseline);

    this.convertState.baselineVariation = baseline || null;
    this.convertState.variationStore = new Map();

    const unsupported = [];
    const mappedVariations = variations.map((variation, idx) => {
      const changes = Array.isArray(variation?.changes) ? variation.changes : [];
      const customChanges = changes.filter(change => change?.type === 'customCode');
      const otherChanges = changes.filter(change => change?.type && change.type !== 'customCode');

      if (otherChanges.length) {
        unsupported.push({
          variation: variation?.name || `Variation ${idx + 1}`,
          types: [...new Set(otherChanges.map(change => change.type))].join(', ')
        });
      }

      const cssPieces = customChanges
        .map(change => (change?.data?.css || '').trim())
        .filter(Boolean);
      const jsPieces = customChanges
        .map(change => (change?.data?.js || '').trim())
        .filter(Boolean);

      this.convertState.variationStore.set(variation.id, {
        variation,
        changes,
        customChanges
      });

      return {
        number: idx + 1,
        name: variation?.name || `Variation ${idx + 1}`,
        description: variation?.description || '',
        css: cssPieces.join('\n\n'),
        js: jsPieces.join('\n\n'),
        convertVariationId: variation?.id,
        convertChangeIds: customChanges.map(change => change?.id).filter(Boolean),
        traffic_distribution: variation?.traffic_distribution ?? 0,
        status: variation?.status || 'draft'
      };
    });

    if (!mappedVariations.length) {
      this.setConvertStatus('No custom-code variations found to import.', 'info');
    }

    this.variations = mappedVariations.map(v => ({
      id: v.number,
      name: v.name,
      description: v.description
    }));

    this.renderVariations();

    const codeData = {
      variations: mappedVariations
    };

    if (experience?.global_css) {
      codeData.globalCSS = experience.global_css;
    }
    if (experience?.global_js) {
      codeData.globalJS = experience.global_js;
    }

    this.generatedCode = codeData;
    this.displayGeneratedCode(codeData);

    if (unsupported.length) {
      const details = unsupported.map(item => `${item.variation}: ${item.types}`).join('<br>');
      this.setConvertStatus(`Imported, but some changes use unsupported types:<br>${details}`, 'info');
    }
  }

  formatConvertTimestamp(value) {
    if (!value) {
      return '-';
    }

    let date;
    if (typeof value === 'number') {
      date = value > 1e12 ? new Date(value) : new Date(value * 1000);
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  getCurrentVariationField(variationNumber, type, fallback = '') {
    const textarea = document.querySelector(`.code-textarea[data-code-id="v${variationNumber}-${type}"]`);
    if (textarea) {
      return textarea.value;
    }
    return fallback || '';
  }

  getCurrentGlobalField(type, fallback = '') {
    const textarea = document.querySelector(`.code-textarea[data-code-id="global-${type}"]`);
    if (textarea) {
      return textarea.value;
    }
    return fallback || '';
  }

  async pushConvertExperience() {
    const elements = this.getConvertElements();
    const button = elements.pushBtn;
    if (button) {
      button.disabled = true;
      button.textContent = this.convertState.creationMode ? 'Creating…' : 'Syncing…';
    }

    try {
      if (this.convertState.creationMode) {
        await this.createConvertExperienceFromBuilder();
      } else {
        await this.updateExistingConvertExperience();
      }
    } catch (error) {
      console.error('Convert push failed:', error);
      this.setConvertStatus(error.message, 'error');
      this.addStatusLog(`❌ Convert push failed: ${error.message}`, 'error');
    } finally {
      if (button) {
        button.textContent = '⬆️ Push Updates to Convert';
        button.disabled = false;
      }
      this.updateConvertActionState();
    }
  }

  async createConvertExperienceFromBuilder() {
    const elements = this.getConvertElements();
    const credentials = this.getActiveConvertCredentials();
    if (!credentials) {
      throw new Error('Select a Convert.com API key first');
    }

    if (!this.convertState.projectId || !this.convertState.accountId) {
      throw new Error('Select an account and project before creating an experience');
    }

    if (!this.generatedCode?.variations?.length) {
      throw new Error('Generate or import code before creating an experience');
    }

    for (const variation of this.generatedCode.variations) {
      const validation = await this.autoValidateVariation(variation.number, {
        origin: 'Pre-publish validation',
        updateConvertStatus: true
      });

      if (validation?.errors?.length) {
        throw new Error(`Resolve issues in ${variation.name || `Variation ${variation.number}`} before publishing to Convert`);
      }
    }

    const name = elements.newExperienceName?.value.trim();
    const type = elements.newExperienceType?.value || 'a/b';
    const url = elements.newExperienceUrl?.value.trim();
    const baselineName = elements.newBaselineName?.value.trim() || 'Original';
    const defaultVariationName = elements.newVariationName?.value.trim() || 'Variation 1';
    const description = document.getElementById('descriptionText')?.value.trim() || '';

    if (!name) {
      throw new Error('Provide a name for the new experience');
    }
    if (!url) {
      throw new Error('Provide a target URL for the new experience');
    }

    const payload = this.buildConvertExperiencePayloadFromGenerated({
      name,
      description,
      type,
      url,
      baselineName,
      fallbackVariationName: defaultVariationName
    });

    const response = await chrome.runtime.sendMessage({
      type: 'CONVERT_CREATE_EXPERIENCE',
      credentials,
      accountId: this.convertState.accountId,
      projectId: this.convertState.projectId,
      payload
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to create experience');
    }

    const created = response.experience;
    this.setConvertStatus(`✅ Created "${created?.name || name}" (ID ${created?.id || '?'})`, 'success');
    this.addStatusLog(`✅ Created Convert experience "${created?.name || name}"`, 'success');

    await this.refreshConvertExperiences(true);

    if (created?.id) {
      const elements = this.getConvertElements();
      if (elements.experienceSelect) {
        elements.experienceSelect.value = String(created.id);
      }
      this.onConvertExperienceChange();
      this.convertState.experienceId = String(created.id);
    }
  }

  buildConvertExperiencePayloadFromGenerated(options = {}) {
    const variations = this.generatedCode?.variations || [];
    if (!variations.length) {
      throw new Error('No variation code available to push');
    }

    const baselineName = options.baselineName || 'Original';
    const fallbackVariationName = options.fallbackVariationName || 'Variation 1';
    const descriptionMap = new Map(
      this.variations.map(item => [item.id, item.description || ''])
    );

    const total = variations.length + 1;
    const evenShare = Number((100 / total).toFixed(2));
    let baselineShare = Number((100 - evenShare * variations.length).toFixed(2));
    const shares = Array(variations.length).fill(evenShare);

    const totalAssigned = baselineShare + shares.reduce((sum, value) => sum + value, 0);
    const roundingDelta = Number((100 - totalAssigned).toFixed(2));
    if (Math.abs(roundingDelta) >= 0.01 && shares.length) {
      shares[shares.length - 1] = Number((shares[shares.length - 1] + roundingDelta).toFixed(2));
    }

    const globalCSS = this.getCurrentGlobalField('css', this.generatedCode?.globalCSS || '');
    const globalJS = this.getCurrentGlobalField('js', this.generatedCode?.globalJS || '');

    const variationPayloads = variations.map((variation, idx) => {
      const css = this.getCurrentVariationField(variation.number, 'css', variation.css || '');
      const js = this.getCurrentVariationField(variation.number, 'js', variation.js || '');

      if (!css.trim() && !js.trim()) {
        throw new Error(`Variation "${variation.name || `Variation ${variation.number}`}" has no code to push`);
      }

      const description = descriptionMap.get(variation.number) || '';
      const name = variation.name || `${fallbackVariationName} ${idx + 1}`;

      return {
        name,
        description,
        traffic_distribution: shares[idx],
        changes: [
          {
            type: 'customCode',
            data: {
              css,
              js
            }
          }
        ]
      };
    });

    const payload = {
      name: options.name,
      description: options.description,
      type: options.type || 'a/b',
      status: 'draft',
      url: options.url,
      traffic_distribution: 100,
      variations: [
        {
          name: baselineName,
          is_baseline: true,
          traffic_distribution: baselineShare
        },
        ...variationPayloads
      ]
    };

    if (globalCSS.trim()) {
      payload.global_css = globalCSS;
    }
    if (globalJS.trim()) {
      payload.global_js = globalJS;
    }

    return payload;
  }

  async updateExistingConvertExperience() {
    if (!this.convertState.experienceId) {
      throw new Error('Select an experience to sync');
    }

    const credentials = this.getActiveConvertCredentials();
    if (!credentials) {
      throw new Error('Select a Convert.com API key');
    }

    if (!this.generatedCode?.variations?.length) {
      throw new Error('No variation code loaded');
    }

    for (const variation of this.generatedCode.variations) {
      const validation = await this.autoValidateVariation(variation.number, {
        origin: 'Pre-sync validation',
        updateConvertStatus: true
      });

      if (validation?.errors?.length) {
        throw new Error(`Resolve issues in ${variation.name || `Variation ${variation.number}`} before syncing to Convert`);
      }
    }

    const updates = [];

    for (const variation of this.generatedCode.variations) {
      const store = this.convertState.variationStore.get(variation.convertVariationId);
      if (!store) {
        this.addStatusLog(`⚠️ Skipping variation without Convert metadata (ID ${variation.convertVariationId})`, 'warning');
        continue;
      }

      const css = this.getCurrentVariationField(variation.number, 'css', variation.css || '');
      const js = this.getCurrentVariationField(variation.number, 'js', variation.js || '');

      if (!css.trim() && !js.trim()) {
        this.addStatusLog(`⚠️ Variation "${variation.name}" has empty code; clearing custom code in Convert`, 'warning');
      }

      const payload = this.buildConvertVariationUpdatePayload(
        variation,
        store,
        { css, js }
      );

      updates.push({
        variationId: variation.convertVariationId,
        payload
      });
    }

    if (!updates.length) {
      throw new Error('No eligible variations to update');
    }

    for (const update of updates) {
      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_UPDATE_VARIATION',
        credentials,
        accountId: this.convertState.accountId,
        projectId: this.convertState.projectId,
        experienceId: this.convertState.experienceId,
        variationId: update.variationId,
        payload: update.payload
      });

      if (!response?.success) {
        throw new Error(response?.error || `Failed to update variation ${update.variationId}`);
      }
    }

    this.setConvertStatus('✅ Variations synced successfully', 'success');
    this.addStatusLog('✅ Pushed updates to existing Convert experience', 'success');

    await this.importConvertExperience();
  }

  buildConvertVariationUpdatePayload(variation, store, latestCode) {
    const original = store.variation || {};
    const descriptionMap = new Map(this.variations.map(item => [item.id, item.description || '']));
    const description = descriptionMap.get(variation.number) || original.description || '';

    const payload = {
      name: variation.name || original.name || `Variation ${variation.number}`,
      description,
      traffic_distribution: original.traffic_distribution ?? 0,
      is_baseline: original.is_baseline || false,
      status: original.status || 'draft',
      key: original.key,
      changes: []
    };

    const originalChanges = Array.isArray(store.changes) ? store.changes : [];
    const customChanges = Array.isArray(store.customChanges) ? store.customChanges : [];

    let handledCustom = false;

    originalChanges.forEach(change => {
      if (change?.type === 'customCode') {
        handledCustom = true;
        payload.changes.push({
          id: change.id,
          type: 'customCode',
          data: {
            css: latestCode.css || '',
            js: latestCode.js || '',
            page_id: change.data?.page_id
          }
        });
      } else if (change?.id) {
        payload.changes.push(change.id);
      } else if (typeof change === 'number') {
        payload.changes.push(change);
      }
    });

    if (!handledCustom && (latestCode.css.trim() || latestCode.js.trim())) {
      payload.changes.push({
        type: 'customCode',
        data: {
          css: latestCode.css || '',
          js: latestCode.js || ''
        }
      });
    }

    return payload;
  }

  async runConvertPreview() {
    if (!this.generatedCode?.variations?.length) {
      this.showError('Generate or import code before running preview');
      return;
    }

    const target = this.previewState.activeVariation || this.generatedCode.variations[0].number;
    await this.autoValidateVariation(target, {
      origin: 'Manual validation',
      updateConvertStatus: true
    });
  }

  // ============================================
  // End Convert.com Integration Methods
  // ============================================

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.settings = { ...this.settings, ...result.settings };
        const preferCSS = document.getElementById('preferCSS');
        if (preferCSS) preferCSS.checked = this.settings.preferCSS;
        const includeDOMChecks = document.getElementById('includeDOMChecks');
        if (includeDOMChecks) includeDOMChecks.checked = this.settings.includeDOMChecks;
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) modelSelect.value = this.settings.model || 'gpt-4o-mini';
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ settings: this.settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  setButtonLoading(button, loading) {
    const text = button.querySelector('.btn-text');
    const loadingEl = button.querySelector('.btn-loading');
    
    if (loading) {
      text?.classList.add('hidden');
      loadingEl?.classList.remove('hidden');
      button.disabled = true;
    } else {
      text?.classList.remove('hidden');
      loadingEl?.classList.add('hidden');
      button.disabled = false;
    }
  }

  showError(message) {
    const el = document.getElementById('errorDisplay');
    el.querySelector('.message').textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  showSuccess(message) {
    const el = document.getElementById('successDisplay');
    el.querySelector('.message').textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  formatUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    return date.toLocaleTimeString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize
let experimentBuilder;
document.addEventListener('DOMContentLoaded', () => {
  experimentBuilder = new ExperimentBuilder();
  window.experimentBuilder = experimentBuilder;
  console.log('✅ Experiment Builder initialized');
});
