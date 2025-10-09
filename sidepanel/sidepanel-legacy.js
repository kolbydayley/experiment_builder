// Experiment Builder - Unified Workspace Interface
console.log('🎨 Experiment Builder V2 Loading...');

class ExperimentBuilder {
  constructor() {
    // Core State
    this.currentPageData = null;
    this.basePageData = null;
    this.targetTabId = null;
    this.variations = [{ id: 1, name: 'Variation 1', description: '' }];
    this.generatedCode = null;
    this.editedCode = {};
    
    // Settings
    this.settings = {
      preferCSS: true,
      includeDOMChecks: true,
      authToken: '',
      model: 'gpt-4o-mini'
    };

    // Conversation & Activity
    this.conversation = [];
    this.chatState = { sending: false };
    this.messageCounter = 0;
    
    // Workflow State Management
    this.workflowState = 'fresh'; // fresh, building, results, deploy
    this.focusedVariationId = this.variations[0].id;
    
    // Usage tracking
    this.usageStats = { tokens: 0, cost: 0 };
    this.usageStorage = this.getUsageStorageArea();

    // Preview state tracking
    this.previewState = { activeVariation: null };
    
    // Capture mode
    this.captureMode = 'full';
    
    // Chat tools state
    this.chatSelectedElements = [];
    this.chatPageCapture = null;

    // Initialize utility classes with simplified interface
    this.sessionManager = new SessionManager(this);
    this.keyboardShortcuts = new KeyboardShortcuts(this);
    this.promptAssistant = new PromptAssistant();
    this.designFileManager = new DesignFileManager();
    this.convertSmartLists = new ConvertSmartLists();
    this.visualQAService = new VisualQAService();
    this.codeQualityMonitor = new CodeQualityMonitor();

    // Initialize Convert.com integration
    this.initializeConvertState();

    // Start application
    this.initializeApp();
  }

  async initializeApp() {
    console.log('🚀 Initializing unified workspace...');
    
    // Initialize UI based on interface version
    await this.initializeInterface();
    
    // Bind events
    this.bindEvents();
    
    // Load settings and data
    await this.loadSettings();
    await this.loadUsageStats();
    await this.loadCurrentPage();
    await this.loadConvertAPIKeys();
    
    // Initialize utilities
    this.initializeUtilities();
    
    // Set initial state
    this.updateWorkflowState('fresh');
    
    console.log('✅ Experiment Builder ready');
  }

  async initializeInterface() {
    // The workspace-v2.js handles the new interface
    // This provides backward compatibility for existing functionality
    this.initializeLegacyCompatibility();
  }

  initializeLegacyCompatibility() {
    // Maintain compatibility with existing backend systems
    this.activePanel = 'build'; // Legacy compatibility
    this.aiActivity = { status: 'idle', message: 'Ready to create experiments' };
    
    // Initialize activity stream
    this.addStatusLog('Ready to create experiments', 'info');
  }

  updateWorkflowState(newState) {
    console.log(`🔄 Workflow state: ${this.workflowState} → ${newState}`);
    
    this.workflowState = newState;
    
    // Update UI to reflect state
    this.updateWorkAreaForState(newState);
    this.updateActivityStream(`Switched to ${newState} mode`);
  }

  updateWorkAreaForState(state) {
    // Hide all work states
    const workStates = document.querySelectorAll('.work-state');
    workStates.forEach(el => el.classList.add('hidden'));

    // Show current state
    const currentState = document.getElementById(`${state}State`);
    if (currentState) {
      currentState.classList.remove('hidden');
    }

    // Update progress indicator
    this.updateProgressIndicator(state);
  }

  updateProgressIndicator(state) {
    const progress = {
      'fresh': 0,
      'building': 25,
      'results': 75,
      'deploy': 100
    }[state] || 0;

    document.documentElement.style.setProperty('--workflow-progress', `${progress}%`);
  }

  bindEvents() {
    // Capture events
    document.getElementById('captureBtn').addEventListener('click', () => this.capturePage());
    document.getElementById('recaptureBtn')?.addEventListener('click', () => this.capturePage());

    // Text input
    // Removed descriptionText (shared context section was removed)

    // Variations
    document.getElementById('addVariationBtn').addEventListener('click', () => this.addVariation());

    // Settings - Open settings page
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    openSettingsBtn?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
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

  // NEW: Helper to get target tab (stored or current active)
  async getTargetTab() {
    try {
      // If we have a stored tab ID, verify it still exists
      if (this.targetTabId !== null) {
        try {
          const tab = await chrome.tabs.get(this.targetTabId);
          if (tab) {
            console.log(`✅ Using stored tab ID: ${this.targetTabId}`);
            return tab;
          }
        } catch (error) {
          // Tab no longer exists, clear stored ID
          console.log('⚠️ Stored tab no longer exists, falling back to active tab');
          this.addStatusLog('⚠️ Original tab closed - using current active tab', 'error');
          this.targetTabId = null;
          // Clear stored page data since tab is gone
          this.currentPageData = null;
          this.basePageData = null;
        }
      }

      // Fall back to active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && this.targetTabId === null) {
        console.log('📍 No stored tab, using active tab:', tab.id);
      }
      return tab || null;
    } catch (error) {
      console.error('Failed to get target tab:', error);
      return null;
    }
  }

  async loadCurrentPage() {
    try {
      const tab = await this.getTargetTab();
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

      // NEW: Store tab ID for persistent tracking
      this.targetTabId = tab.id;
      console.log(`📍 Locked onto tab ID: ${this.targetTabId}`);

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
          // Store base page data for iterations (deep copy to avoid mutation)
          this.basePageData = JSON.parse(JSON.stringify(response.data));
          console.log('🏠 Saved base page data for iterations');

          // NEW: Store as immutable original if first capture
          if (!this.codeHistory.originalPageData) {
            this.codeHistory.originalPageData = JSON.parse(JSON.stringify(response.data));
            console.log('📸 Original page data preserved for follow-up requests');
          }

          this.displayPagePreview(response.data);
          this.addStatusLog('✓ Page captured successfully', 'success');
          this.addStatusLog(`📍 Locked to tab: ${tab.url}`, 'info');
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

    // Get tab information first
    const tab = await chrome.tabs.get(tabId);

    // Send message to activate element selector
    const selectionResponse = await chrome.runtime.sendMessage({
      type: 'START_ELEMENT_SELECTION',
      tabId: tabId
    });

    if (selectionResponse.success) {
      this.addStatusLog('✓ Element selected, capturing full page context...', 'success');

      console.log('🎯 Selected element data:', selectionResponse.data);

      // Now capture the FULL PAGE with the selected element as the focus
      // The new context builder will automatically capture proximity and structure
      const captureResponse = await chrome.runtime.sendMessage({
        type: 'CAPTURE_PAGE_WITH_ELEMENT',
        tabId: tabId,
        selectedElementSelector: selectionResponse.data.selector
      });

      if (captureResponse.success) {
        this.currentPageData = captureResponse.data;
        this.currentPageData.selectedElement = selectionResponse.data; // Keep for UI display
        this.currentPageData.captureMode = 'element-focused';
        
        // Store base page data for iterations (deep copy to avoid mutation)
        this.basePageData = JSON.parse(JSON.stringify(this.currentPageData));
        console.log('🏠 Saved base page data for iterations (element-focused)');

        console.log('📦 Page data with hierarchical context:', {
          mode: this.currentPageData.context?.mode,
          primary: this.currentPageData.context?.primary?.length,
          proximity: this.currentPageData.context?.proximity?.length,
          structure: this.currentPageData.context?.structure?.length,
          estimatedTokens: this.currentPageData.context?.metadata?.estimatedTokens
        });

        this.addStatusLog('✓ Element-focused context captured', 'success');
        this.showSuccess('Element captured with full context!');

        // Show element preview
        this.displaySelectedElementPreview(selectionResponse.data);

        // Also show in main preview area
        if (selectionResponse.data.screenshot) {
          const preview = document.getElementById('pagePreview');
          const img = document.getElementById('screenshotPreview');
          const time = document.getElementById('captureTime');

          img.src = selectionResponse.data.screenshot;
          time.textContent = `Element captured: ${selectionResponse.data.selector}`;
          preview.classList.remove('hidden');
        }
      } else {
        throw new Error(captureResponse.error || 'Page capture with element failed');
      }
    } else {
      throw new Error(selectionResponse.error || 'Element selection failed');
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
    // Shared context section was removed - this function is no longer needed
    return;
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

  /**
   * Get code evolution summary for AI context
   */
  getCodeEvolutionSummary() {
    if (!this.codeHistory.conversationLog || this.codeHistory.conversationLog.length === 0) {
      return null;
    }

    return {
      totalChanges: this.codeHistory.conversationLog.length,
      changesSummary: this.codeHistory.conversationLog.map((entry, index) => ({
        step: index + 1,
        request: entry.request,
        timestamp: new Date(entry.timestamp).toLocaleTimeString(),
        codeSnapshot: {
          variationCount: entry.code?.variations?.length || 0,
          hasGlobalCSS: !!entry.code?.globalCSS,
          hasGlobalJS: !!entry.code?.globalJS
        }
      })),
      currentState: {
        appliedCode: this.codeHistory.appliedCode ? {
          variationCount: this.codeHistory.appliedCode.variations?.length || 0,
          hasGlobalCSS: !!this.codeHistory.appliedCode.globalCSS,
          hasGlobalJS: !!this.codeHistory.appliedCode.globalJS
        } : null
      }
    };
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
      // Include chat context (selected elements and page capture) in the request
      const chatContext = this.getChatContextForAI();
      const enhancedMessage = chatContext ? `${chatContext}USER REQUEST: ${message}` : message;
      
      const adjusted = await this.adjustCode(enhancedMessage, null, { 
        includeConversation: true,
        chatContext: {
          selectedElements: this.chatSelectedElements,
          pageCapture: this.chatPageCapture
        }
      });
      
      if (!adjusted) {
        throw new Error('No response from AI');
      }

      // Update the generated code and history
      this.generatedCode = adjusted.code;
      this.recordUsage(adjusted.usage);

      // Update code history for follow-up context
      this.codeHistory.appliedCode = adjusted.code;
      this.codeHistory.conversationLog.push({
        request: message,
        code: adjusted.code,
        timestamp: Date.now(),
        source: 'chat'
      });

      // NEW: Analyze code quality and warn if degrading
      const qualityAnalysis = this.codeQualityMonitor.analyzeCode(adjusted.code, 'chat');
      this.logQualityAnalysis(qualityAnalysis);

      // Check for degradation
      if (qualityAnalysis.degradation?.detected) {
        this.addStatusLog('⚠️ Code quality degradation detected - consider simplifying', 'error');
        qualityAnalysis.degradation.changes.forEach(change => {
          this.addStatusLog(`  • ${change.message} (+${change.increase})`, 'error');
        });
      }

      this.displayGeneratedCode(adjusted.code);

      // NEW: Run full test and validation pipeline like main generation
      const generatedVariations = Array.isArray(this.generatedCode?.variations)
        ? this.generatedCode.variations
        : [];

      if (generatedVariations.length > 0) {
        this.addStatusLog('🧪 Testing chat-adjusted code...', 'info');
        this.setAiActivity('working', 'Validating your changes...');

        // Refresh page before testing to ensure clean state
        const tab = await this.getTargetTab();
        if (tab) {
          this.addStatusLog('🔄 Refreshing page for clean testing...', 'info');
          await chrome.tabs.reload(tab.id);
          await this.sleep(3000); // Wait for page to fully reload
        }

        // Set up auto-iteration state for testing
        this.autoIteration = {
          active: true,
          currentVariation: this.focusedVariationId || 1,
          iterations: 0,
          maxIterations: 3, // Use fewer iterations for chat (faster feedback)
          startTime: Date.now(),
          source: 'chat' // Mark as chat-initiated
        };

        // Test the focused variation (or first variation if no focus)
        const variationToTest = this.focusedVariationId || 1;
        const generatedVariation = generatedVariations.find(v => v.number === variationToTest) || generatedVariations[0];
        const variationConfig = this.variations[variationToTest - 1] || {
          id: variationToTest,
          name: generatedVariation?.name || `Variation ${variationToTest}`,
          description: message // Use chat message as description
        };

        this.addStatusLog(`📋 Testing ${variationConfig.name}...`, 'info');
        await this.autoIterateVariation(variationToTest, variationConfig);

        this.autoIteration.active = false;

        const summary = `✅ Changes applied and validated! ${this.buildAdjustmentSummary(adjusted.code)}`;
        this.addConversationMessage({
          role: 'assistant',
          content: summary,
          meta: { type: 'chat-response' }
        });

        this.addStatusLog('✓ Chat adjustments tested and applied', 'success');
        this.setChatStatus(`Updated & Tested • ${this.formatChatTimestamp(Date.now())}`);
        this.setAiActivity('preview', `Changes validated and applied to ${variationConfig.name}.`);
      } else {
        // Fallback: no variations (shouldn't happen)
        const summary = this.buildAdjustmentSummary(adjusted.code);
        this.addConversationMessage({
          role: 'assistant',
          content: summary,
          meta: { type: 'chat-response' }
        });

        this.addStatusLog('✓ Chat adjustments applied', 'success');
        this.setChatStatus(`Updated • ${this.formatChatTimestamp(Date.now())}`);
        this.setAiActivity('idle', 'Code updated. Select a variation to preview.');
      }
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

    // Generate detailed code diff summary
    const codeChanges = this.generateCodeChangeSummary(codeData);
    
    const names = codeData.variations
      .map(v => v.name || `Variation ${v.number}`)
      .filter(Boolean);

    const visible = names.slice(0, 3).join(', ');
    const remaining = names.length > 3 ? ` +${names.length - 3} more` : '';

    const extras = [];
    if (codeData.globalCSS) extras.push('global CSS');
    if (codeData.globalJS) extras.push('global JS');
    const extrasText = extras.length ? ` Global assets refreshed (${extras.join(', ')}).` : '';

    let summary = `**Changes Applied to ${names.length} variation${names.length === 1 ? '' : 's'}:** ${visible}${remaining}\n\n`;
    
    if (codeChanges.length > 0) {
      summary += `**Code Changes:**\n${codeChanges}\n\n`;
    }
    
    summary += `${extrasText}Review the **Review** tab to preview or retest.`;
    
    return summary;
  }

  /**
   * Generate a readable summary of code changes for chat responses
   */
  generateCodeChangeSummary(newCodeData) {
    if (!this.codeHistory.appliedCode || !newCodeData) {
      return 'New code generated (no previous version to compare)';
    }

    const changes = [];
    const previousCode = this.codeHistory.appliedCode;
    
    // Compare variations
    if (newCodeData.variations && previousCode.variations) {
      newCodeData.variations.forEach((newVar, index) => {
        const prevVar = previousCode.variations[index];
        if (prevVar) {
          const varChanges = this.compareVariationCode(prevVar, newVar);
          if (varChanges.length > 0) {
            changes.push(`**${newVar.name || `Variation ${newVar.number}`}:**`);
            varChanges.forEach(change => changes.push(`  • ${change}`));
          }
        }
      });
    }
    
    // Compare global CSS
    if (newCodeData.globalCSS !== previousCode.globalCSS) {
      changes.push(`**Global CSS:** Updated${this.getCodeLengthChange(previousCode.globalCSS, newCodeData.globalCSS)}`);
    }
    
    // Compare global JS  
    if (newCodeData.globalJS !== previousCode.globalJS) {
      changes.push(`**Global JS:** Updated${this.getCodeLengthChange(previousCode.globalJS, newCodeData.globalJS)}`);
    }
    
    return changes.length > 0 ? changes.join('\n') : 'Minor code adjustments made';
  }

  compareVariationCode(prevVar, newVar) {
    const changes = [];
    
    // Compare CSS
    if (prevVar.css !== newVar.css) {
      const cssChange = this.getCodeChangeDescription(prevVar.css, newVar.css, 'CSS');
      if (cssChange) changes.push(cssChange);
    }
    
    // Compare JS
    if (prevVar.js !== newVar.js) {
      const jsChange = this.getCodeChangeDescription(prevVar.js, newVar.js, 'JavaScript');  
      if (jsChange) changes.push(jsChange);
    }
    
    // Compare HTML
    if (prevVar.html !== newVar.html) {
      const htmlChange = this.getCodeChangeDescription(prevVar.html, newVar.html, 'HTML');
      if (htmlChange) changes.push(htmlChange);
    }
    
    return changes;
  }

  getCodeChangeDescription(oldCode, newCode, type) {
    const oldLength = (oldCode || '').length;
    const newLength = (newCode || '').length;
    
    if (oldLength === 0 && newLength > 0) {
      return `${type} added (${newLength} characters)`;
    } else if (oldLength > 0 && newLength === 0) {
      return `${type} removed`;
    } else if (oldLength !== newLength) {
      const diff = newLength - oldLength;
      const change = diff > 0 ? `+${diff}` : `${diff}`;
      return `${type} modified (${change} characters)`;
    }
    return `${type} updated`;
  }

  getCodeLengthChange(oldCode, newCode) {
    const oldLength = (oldCode || '').length;
    const newLength = (newCode || '').length;
    const diff = newLength - oldLength;
    
    if (diff > 0) {
      return ` (+${diff} characters)`;
    } else if (diff < 0) {
      return ` (${diff} characters)`;
    }
    return '';
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

    const description = ''; // Shared context section removed

    // NEW: Detect if this is a follow-up request
    const isFollowUp = this.generatedCode !== null &&
                       this.codeHistory.appliedCode !== null &&
                       this.codeHistory.originalPageData !== null;

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

    // NEW: Route to appropriate handler
    if (isFollowUp) {
      console.log('🔄 Detected follow-up request - using iterative flow');
      this.addStatusLog('🔄 Processing follow-up request (preserving previous changes)...', 'info');
      await this.handleFollowUpRequest(description, btn);
      return;
    }

    // Clear preview for fresh generation
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

    // Ensure base page data is current (refresh from current state)
    if (this.currentPageData) {
      this.basePageData = JSON.parse(JSON.stringify(this.currentPageData));
      console.log('🔄 Refreshed base page data for new generation cycle');
    }

    // NEW: Store original request
    if (!this.codeHistory.originalRequest) {
      this.codeHistory.originalRequest = description;
      console.log('📝 Stored original request for follow-ups');
    }

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

      // NEW: Track applied code in history
      this.codeHistory.appliedCode = response.code;
      this.codeHistory.conversationLog.push({
        request: description,
        code: response.code,
        timestamp: Date.now()
      });
      console.log('💾 Stored code in history for follow-ups');

      const generatedCount = response.code?.variations?.length || 0;
      this.addStatusLog(`✓ AI generated ${generatedCount} variation${generatedCount === 1 ? '' : 's'}`, 'success');

      // NEW: Analyze code quality
      const qualityAnalysis = this.codeQualityMonitor.analyzeCode(response.code, 'initial');
      this.logQualityAnalysis(qualityAnalysis);

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

  // NEW: Handle follow-up requests with context preservation
  async handleFollowUpRequest(newRequest, btn) {
    this.setAiActivity('working', 'Processing follow-up request...');
    this.showStatusPanel();

    try {
      // Build cumulative context
      const context = {
        originalPageData: this.codeHistory.originalPageData,
        originalRequest: this.codeHistory.originalRequest,
        appliedCode: this.codeHistory.appliedCode,
        conversationLog: this.codeHistory.conversationLog,
        newRequest: newRequest
      };

      this.addStatusLog(`📜 Context: ${this.codeHistory.conversationLog.length} previous request(s)`, 'info');
      this.addStatusLog(`🎯 Original page: ${this.codeHistory.originalPageData?.url || 'captured'}`, 'info');
      this.addStatusLog('⚙️ Adjusting code to include new changes...', 'info');

      // Call ADJUST_CODE instead of GENERATE_CODE
      const response = await chrome.runtime.sendMessage({
        type: 'ADJUST_CODE',
        data: {
          pageData: this.codeHistory.originalPageData, // Use ORIGINAL page data
          previousCode: this.formatCodeForAdjustment(this.codeHistory.appliedCode),
          newRequest: newRequest,
          conversationHistory: this.codeHistory.conversationLog,
          variations: this.variations,
          settings: this.settings
        }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Code adjustment failed');
      }

      // Update code and history
      this.generatedCode = response.code;
      this.codeHistory.appliedCode = response.code;
      this.codeHistory.conversationLog.push({
        request: newRequest,
        code: response.code,
        timestamp: Date.now()
      });

      this.recordUsage(response.usage);
      this.addStatusLog('✓ Code adjusted successfully', 'success');

      // Update generated code and history
      this.generatedCode = response.code;

      // Display and apply updated code
      this.displayGeneratedCode(response.code);
      await this.handleGenerationSuccess(response.code);

      // NEW: Auto-test and iterate like initial generation
      const generatedVariations = Array.isArray(this.generatedCode?.variations)
        ? this.generatedCode.variations
        : [];

      if (generatedVariations.length > 0) {
        this.addStatusLog('🧪 Auto-testing follow-up changes...', 'info');
        this.setAiActivity('working', 'Testing updated code...');

        // NEW: Refresh page before testing follow-up to ensure clean state
        const tab = await this.getTargetTab();
        if (tab) {
          this.addStatusLog('🔄 Refreshing page for clean testing...', 'info');
          await chrome.tabs.reload(tab.id);
          await this.sleep(3000); // Wait for page to fully reload
        }

        // Set up auto-iteration state
        this.autoIteration = {
          active: true,
          currentVariation: 1,
          iterations: 0,
          maxIterations: 5,
          startTime: Date.now()
        };

        // Test each variation with auto-iteration
        for (let i = 0; i < generatedVariations.length; i++) {
          if (!this.autoIteration.active) {
            this.addStatusLog('⏸ Testing stopped by user', 'info');
            break;
          }

          const generatedVariation = generatedVariations[i];
          const variationNumber = generatedVariation?.number || (i + 1);
          const variationConfig = this.variations[i] || {
            id: variationNumber,
            name: generatedVariation?.name || `Variation ${variationNumber}`,
            description: newRequest // Use the new request as description
          };

          this.autoIteration.currentVariation = variationNumber;
          const variationLabel = generatedVariation?.name || variationConfig.name || `Variation ${variationNumber}`;

          this.addStatusLog(`\n📋 Testing ${variationLabel}...`, 'info');
          await this.autoIterateVariation(variationNumber, variationConfig);
        }

        this.autoIteration.active = false;
        this.addStatusLog('\n✅ Follow-up changes tested and applied!', 'success');
      }

      this.updateIndicator('active');
      this.showSuccess('Code updated and tested successfully!');
      this.setAiActivity('preview', 'Follow-up changes applied and tested.');

    } catch (error) {
      console.error('Follow-up request failed:', error);
      this.addStatusLog(`✗ Follow-up failed: ${error.message}`, 'error');
      this.updateIndicator('error');
      this.showError(error.message);
      this.setAiActivity('error', error.message || 'Follow-up request failed.');
    } finally {
      this.setButtonLoading(btn, false);
    }
  }

  // Helper: Format code for adjustment context
  formatCodeForAdjustment(code) {
    if (!code) return '';

    try {
      // Convert code object to formatted string for AI context
      let formatted = '';

      if (code.variations && Array.isArray(code.variations)) {
        code.variations.forEach((variation, index) => {
          formatted += `// VARIATION ${variation.number || (index + 1)} - ${variation.name || 'Unnamed'}\n`;
          if (variation.css) {
            formatted += `// CSS:\n${variation.css}\n\n`;
          }
          if (variation.js) {
            formatted += `// JavaScript:\n${variation.js}\n\n`;
          }
        });
      }

      if (code.globalCSS) {
        formatted += `// GLOBAL CSS:\n${code.globalCSS}\n\n`;
      }

      if (code.globalJS) {
        formatted += `// GLOBAL JS:\n${code.globalJS}\n`;
      }

      return formatted;
    } catch (error) {
      console.error('Error formatting code:', error);
      return JSON.stringify(code, null, 2);
    }
  }

  async autoIterateVariation(variationNumber, variationConfig) {
    let iteration = 0;
    const maxIterations = this.autoIteration.maxIterations;

    // Find the variation object for Visual QA
    const variation = this.generatedCode?.variations?.find(v => v.number === variationNumber);
    if (!variation) {
      console.error('[Auto-Iterate] Variation not found:', variationNumber);
      this.addStatusLog(`  ✗ Variation ${variationNumber} not found`, 'error');
      return;
    }

    // Capture BEFORE screenshot once at start
    const tab = await this.getTargetTab();
    let beforeScreenshot = null;
    if (tab) {
      try {
        beforeScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        });
        // Convert to data URL format for GPT-4 Vision
        beforeScreenshot = `data:image/png;base64,${beforeScreenshot.split(',')[1] || beforeScreenshot}`;
      } catch (error) {
        console.warn('[Auto-Iterate] Failed to capture before screenshot:', error);
      }
    }

    let previousDefects = [];

    while (iteration < maxIterations && this.autoIteration.active) {
      iteration++;
      this.autoIteration.iterations++;

      const variationLabel = variationConfig?.name || `Variation ${variationNumber}`;
      this.addStatusLog(`  Iteration ${iteration}/${maxIterations}...`, 'info');
      this.setAiActivity('working', `Auto-testing ${variationLabel} (${iteration}/${maxIterations})...`);

      // Test the variation (includes screenshot capture)
      const testResult = await this.testVariation(variationNumber);

      if (!testResult) {
        this.addStatusLog(`  ✗ Test execution failed`, 'error');
        this.setAiActivity('error', `Unable to test ${variationLabel}. Check the status log.`);
        break;
      }

      // Technical validation - check for errors
      if (testResult.errors && testResult.errors.length > 0) {
        this.addStatusLog(`  ⚠️ ${testResult.errors.length} technical issue(s) detected`, 'error');
        testResult.errors.forEach((err, idx) => {
          this.addStatusLog(`    ${idx + 1}. ${err}`, 'error');
        });

        // If last iteration, stop
        if (iteration >= maxIterations) {
          this.addStatusLog(`  ⚠️ Max iterations reached. Manual review needed.`, 'error');
          this.setAiActivity('error', `${variationLabel} still has issues after ${maxIterations} attempts.`);
          break;
        }

        // Request AI to fix technical issues
        this.addStatusLog(`  🔧 Requesting AI to fix technical issues...`, 'info');
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
        continue; // Restart loop with fixed code
      }

      // Technical validation passed - run Visual QA
      this.addStatusLog(`  ✓ No technical errors detected`, 'success');

      // Debug screenshot availability
      console.log('[Auto-Iterate] Screenshot availability:', {
        hasBeforeScreenshot: !!beforeScreenshot,
        hasAfterScreenshot: !!testResult.screenshot,
        beforeLength: beforeScreenshot?.length || 0,
        afterLength: testResult.screenshot?.length || 0
      });

      // Run Visual QA if we have screenshots OR force it for important iterations
      const shouldRunVisualQA = (beforeScreenshot && testResult.screenshot) || iteration === 1;
      
      if (shouldRunVisualQA) {
        this.addStatusLog(`  👁️ Running AI Visual QA...`, 'info');
        this.setAiActivity('working', `Checking visual quality of ${variationLabel}...`);

        // Handle missing screenshots gracefully
        if (!beforeScreenshot || !testResult.screenshot) {
          this.addStatusLog(`  ⚠️ Missing screenshots (before: ${!!beforeScreenshot}, after: ${!!testResult.screenshot}) - running simplified QA`, 'info');
        }

        try {
          // Convert after screenshot to data URL format
          let afterScreenshot = testResult.screenshot;
          if (!afterScreenshot.startsWith('data:')) {
            afterScreenshot = `data:image/png;base64,${afterScreenshot.split(',')[1] || afterScreenshot}`;
          }

          // Run Visual QA
          // Use enhanced prompt for full suite reviews
          const originalRequest = variationConfig?.enhancedPrompt || 
                                  variationConfig?.description || 
                                  'No description provided';
          
          const visualQAResult = await this.visualQAService.runQA({
            originalRequest: originalRequest,
            beforeScreenshot: beforeScreenshot,
            afterScreenshot: afterScreenshot,
            iteration: iteration,
            previousDefects: previousDefects,
            elementDatabase: this.elementDatabase,
            generatedCode: variation
          });

          // Record Visual QA API usage for cost tracking
          if (visualQAResult.usage) {
            this.recordUsage(visualQAResult.usage);
          }

          // Display Visual QA results
          this.displayVisualQAResult(visualQAResult, variationNumber);

          if (visualQAResult.status === 'PASS') {
            this.addStatusLog(`  ✓ Visual QA PASSED - variation looks good!`, 'success');
            this.setAiActivity('preview', `${variationLabel} passed all checks.`);
            break; // Success!
          }

          // Visual defects found
          const defectCount = visualQAResult.defects?.length || 0;
          const criticalCount = visualQAResult.defects?.filter(d => d.severity === 'critical').length || 0;

          this.addStatusLog(`  ⚠️ Visual QA found ${defectCount} defect(s) (${criticalCount} critical)`, 'error');
          visualQAResult.defects?.forEach((defect, idx) => {
            const icon = defect.severity === 'critical' ? '🔴' : '🟡';
            this.addStatusLog(`    ${icon} ${idx + 1}. [${defect.type || 'issue'}] ${defect.description}`, 'error');
            if (defect.suggestedFix) {
              this.addStatusLog(`       💡 How to fix: ${defect.suggestedFix}`, 'info');
            }
          });

          // Check termination conditions
          if (!this.visualQAService.shouldContinueIteration(visualQAResult, iteration, previousDefects)) {
            this.addStatusLog(`  ⚠️ Stopping iteration (max attempts or repeated defects)`, 'error');
            this.setAiActivity('error', `${variationLabel} needs manual review.`);
            break;
          }

          // Additional safety check: if we're on iteration 3+ and still have defects, force stop
          if (iteration >= 3) {
            this.addStatusLog(`  ⚠️ Stopping after ${iteration} iterations to prevent infinite loop`, 'error');
            this.setAiActivity('warning', `${variationLabel} has minor issues but stopping to prevent infinite iterations.`);
            break;
          }

          // Build feedback for regeneration
          const visualFeedback = this.visualQAService.buildFeedbackForRegeneration(visualQAResult);
          if (!visualFeedback) {
            this.addStatusLog(`  ⚠️ No actionable feedback generated from Visual QA`, 'error');
            this.setAiActivity('error', `Unable to generate improvement feedback for ${variationLabel}.`);
            break;
          }

          this.addStatusLog(`  🔧 Requesting AI to fix visual defects...`, 'info');
          this.setAiActivity('working', `Adjusting ${variationLabel} based on visual feedback...`);

          const adjusted = await this.adjustCode(visualFeedback, {
            ...testResult,
            visualQA: visualQAResult
          });

          if (!adjusted) {
            this.addStatusLog(`  ✗ AI adjustment failed - check console for details`, 'error');
            this.setAiActivity('error', `Automatic adjustment failed for ${variationLabel}. Check console log.`);
            break;
          }

          if (!adjusted.code || !adjusted.code.variations || adjusted.code.variations.length === 0) {
            this.addStatusLog(`  ✗ AI returned invalid code structure`, 'error');
            this.setAiActivity('error', `AI returned invalid code for ${variationLabel}.`);
            break;
          }

          this.generatedCode = adjusted.code;
          this.recordUsage(adjusted.usage);
          this.displayGeneratedCode(adjusted.code);

          // Track defects for repeated detection
          previousDefects = visualQAResult.defects || [];

          this.addStatusLog(`  ✓ Code updated, retesting...`, 'info');
          await this.sleep(500);
        } catch (error) {
          console.error('[Auto-Iterate] Visual QA error:', error);
          this.addStatusLog(`  ⚠️ Visual QA failed: ${error.message}`, 'error');
          // Continue without Visual QA if it fails
          this.addStatusLog(`  ✓ Technical validation passed (Visual QA skipped)`, 'success');
          this.setAiActivity('preview', `${variationLabel} passed technical validation.`);
          break;
        }
      } else {
        // Force Visual QA even without screenshots for consistency
        this.addStatusLog(`  👁️ Running Visual QA without screenshots...`, 'info');
        this.setAiActivity('working', `Running code-only Visual QA for ${variationLabel}...`);

        try {
          const originalRequest = variationConfig?.enhancedPrompt || 
                                  variationConfig?.description || 
                                  'No description provided';
          
          const visualQAResult = await this.visualQAService.runQA({
            originalRequest: originalRequest,
            beforeScreenshot: null,
            afterScreenshot: null,
            iteration: iteration,
            previousDefects: previousDefects,
            elementDatabase: this.elementDatabase,
            generatedCode: variation
          });

          // Record Visual QA API usage for cost tracking
          if (visualQAResult.usage) {
            this.recordUsage(visualQAResult.usage);
          }

          // Display Visual QA results
          this.displayVisualQAResult(visualQAResult, variationNumber);

          this.addStatusLog(`  ✓ Visual QA completed (code-only review)`, 'success');
          this.setAiActivity('preview', `${variationLabel} passed Visual QA.`);
          break;

        } catch (error) {
          console.error('[Auto-Iterate] Visual QA error:', error);
          this.addStatusLog(`  ⚠️ Visual QA failed: ${error.message}`, 'error');
          this.addStatusLog(`  ✓ Technical validation passed (Visual QA unavailable)`, 'success');
          this.setAiActivity('preview', `${variationLabel} passed technical validation.`);
          break;
        }
      }
    }
  }

  async testVariation(variationNumber) {
    const variation = this.generatedCode?.variations.find(v => v.number === variationNumber);
    if (!variation) return null;

    const variationName = variation.name || `Variation ${variationNumber}`;

    const tab = await this.getTargetTab();
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

      // Step 2: Clear previous variation and reset DOM
      const resetResult = await this.resetVariationOnTab(tab.id, 'convert-ai-');
      await this.resetVariationOnTab(tab.id, 'convert-ai-preview');
      
      // NEW: For iterations, ALWAYS refresh page to ensure clean DOM state
      // This is needed because JavaScript variations make complex DOM changes that are hard to track/undo
      if (this.autoIteration?.iterations > 0) {
        this.addStatusLog(`  🔄 Refreshing page for clean DOM state (iteration ${this.autoIteration.iterations})`, 'info');
        console.log(`🔄 Refreshing page for iteration ${this.autoIteration.iterations} to ensure clean DOM state`);
        
        // Store current base page data before refresh
        const currentBaseData = this.basePageData;
        
        // Refresh the page to get clean state
        await chrome.tabs.reload(tab.id);
        
        // Wait for page to fully reload
        await this.sleep(3000); // Increased wait time for stability
        
        // Restore base page data (it might get lost during reload)
        if (currentBaseData) {
          this.basePageData = currentBaseData;
          console.log('✅ Restored base page data after refresh');
        }
        
        // Re-inject content script after reload
        await this.ensureContentScript(tab.id);
        
        console.log('✅ Page refreshed and content scripts re-injected');
        this.addStatusLog(`  ✅ Page refreshed and ready for testing`, 'success');
      }
      
      if (!resetResult && this.autoIteration?.iterations === 0) {
        this.addStatusLog('  ⚠️ Unable to reset previously injected code. Try reloading the page.', 'error');
        result.errors.push('Content script injection failed - try reloading the page');
      }

      await this.sleep(500); // Wait for everything to settle

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

      // Give extra time for complex DOM manipulations to complete
      await this.sleep(2000);
      console.log('⏱️ Waited 2 seconds for JavaScript to complete DOM modifications');
      
      // DEBUG: Check what's actually on the page after variation is applied
      try {
        const pageState = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: () => {
            const videoContainer = document.querySelector('#Video--template--21560119033891__section_video_VDBjPY');
            const splitHeroContainer = document.querySelector('.split-hero-container');
            const splitHeroLeft = document.querySelector('.split-hero-left');
            const splitHeroContent = document.querySelector('.split-hero-content');
            const buttons = document.querySelectorAll('button');
            const links = document.querySelectorAll('a');
            
            return {
              hasVideoContainer: !!videoContainer,
              hasSplitHeroContainer: !!splitHeroContainer,
              hasSplitHeroLeft: !!splitHeroLeft,
              hasSplitHeroContent: !!splitHeroContent,
              videoContainerApplied: videoContainer?.dataset?.varApplied,
              splitContainerHTML: splitHeroContainer?.innerHTML?.substring(0, 300),
              buttonCount: buttons.length,
              linkCount: links.length,
              allButtonTexts: Array.from(buttons).map(b => b.textContent),
              allLinkTexts: Array.from(links).slice(0, 10).map(l => l.textContent?.substring(0, 50))
            };
          }
        });
        
        if (pageState?.[0]?.result) {
          console.log('🔍 Page state after variation applied:', pageState[0].result);
          this.addStatusLog(`  🔍 Debug: Found ${pageState[0].result.buttonCount} buttons, varApplied=${pageState[0].result.videoContainerApplied}`, 'info');
        }
      } catch (debugError) {
        console.log('⚠️ Could not check page state:', debugError);
      }

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

      // Step 5: Check if critical elements exist (with smart fallback detection)
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
            
            // Check if these selectors exist and if code has fallback logic
            const missing = [];
            selectors.forEach(selector => {
              try {
                const element = document.querySelector(selector);
                if (!element) {
                  // Check if this selector is part of fallback logic
                  const hasFallbackPattern = 
                    // Multiple selector attempts with ||
                    (jsCode.includes('||') && jsCode.includes('querySelector')) ||
                    // Conditional element checking
                    /if\s*\(\s*\w+Element\s*\)/.test(jsCode) ||
                    // Ternary with fallback text
                    /\?\s*[^:]+\s*:\s*['"`][^'"`]{3,}['"`]/.test(jsCode) ||
                    // Default fallback text assignment
                    jsCode.includes('Up to 50% Off Sitewide');
                  
                  if (!hasFallbackPattern) {
                    missing.push(selector);
                  }
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
        console.log('[testVariation] Screenshot captured successfully:', {
          hasScreenshot: !!result.screenshot,
          screenshotLength: result.screenshot?.length || 0
        });
        this.displayTestScreenshot(result.screenshot, variationNumber);
      } catch (error) {
        console.error('[testVariation] Screenshot capture failed:', error);
        this.addStatusLog(`  ⚠️ Screenshot capture failed: ${error.message}`, 'error');
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
      console.log('🔧 Starting code adjustment with feedback:', feedback?.substring(0, 200) + '...');
      
      const payload = {
        generationData: this.buildGenerationData(),
        previousCode: this.serializeCode(this.generatedCode),
        feedback,
        testSummary
      };

      if (options.includeConversation) {
        // Enhanced conversation context with code history
        payload.conversationHistory = this.getConversationHistoryForAI();
        payload.codeEvolution = this.getCodeEvolutionSummary();
        payload.originalRequest = this.codeHistory.originalRequest || this.generationData?.description;
        payload.currentElements = this.elementDatabase || {};
      }

      if (options.chatContext) {
        payload.chatContext = options.chatContext;
      }

      if (options.extraContext) {
        payload.extraContext = options.extraContext;
      }

      console.log('📤 Sending ADJUST_CODE message to service worker');
      
      const response = await chrome.runtime.sendMessage({
        type: 'ADJUST_CODE',
        data: payload
      });

      console.log('📥 Received ADJUST_CODE response:', {
        success: response?.success,
        hasCode: !!response?.code,
        error: response?.error,
        usage: response?.usage
      });

      if (!response?.success) {
        const errorMessage = response?.error || 'Adjustment failed - no error details provided';
        console.error('❌ Adjustment failed with error:', errorMessage);
        throw new Error(errorMessage);
      }

      if (!response.code) {
        console.error('❌ Adjustment succeeded but no code returned');
        throw new Error('Adjustment succeeded but no code was returned');
      }

      console.log('✅ Code adjustment completed successfully');
      return response;
    } catch (error) {
      console.error('❌ Adjustment failed with exception:', error);
      this.addStatusLog(`  ✗ Adjustment error: ${error.message}`, 'error');
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
    // Use base page data for iterations to prevent code stacking
    const pageDataToUse = this.basePageData || this.currentPageData;
    
    const data = {
      pageData: pageDataToUse,
      description: '', // Shared context section removed
      variations: this.variations,
      settings: this.settings
    };
    
    console.log('🎯 Building generation data:', {
      hasPageData: !!data.pageData,
      usingBaseData: !!this.basePageData,
      pageDataUrl: data.pageData?.url,
      pageDataKeys: data.pageData ? Object.keys(data.pageData) : 'no pageData'
    });
    
    if (this.basePageData) {
      console.log('✅ Using BASE page data to prevent code stacking');
    } else {
      console.log('⚠️ No base page data - using current page data');
    }
    
    return data;
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
      tab = await this.getTargetTab();
    } catch (error) {
      console.error('Failed to get target tab:', error);
    }

    if (!tab) {
      this.showError('No target tab available for preview');
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

    // NEW: Enhanced full suite review if we have conversation history
    if (this.codeHistory.conversationLog.length > 0) {
      await this.performFullSuiteReview(variationNumber);
      return;
    }

    // Fallback to simple retest for initial variations
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

  /**
   * NEW: Perform comprehensive full suite review against BASE page
   * Reviews ALL conversation requests to verify complete implementation
   */
  async performFullSuiteReview(variationNumber) {
    const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
    const variationName = variation.name || `Variation ${variationNumber}`;
    
    this.addStatusLog(`🔍 Full Suite Review: Checking ALL requests against BASE page...`, 'info');
    
    // Build comprehensive request summary
    const allRequests = [this.codeHistory.originalRequest];
    this.codeHistory.conversationLog.forEach(entry => {
      allRequests.push(entry.request);
    });
    
    const fullRequestSummary = allRequests
      .map((req, idx) => `${idx + 1}. ${req}`)
      .join('\n');
    
    this.addStatusLog(`📋 Reviewing ${allRequests.length} total request(s):`, 'info');
    allRequests.forEach((req, idx) => {
      this.addStatusLog(`  ${idx + 1}. ${req.substring(0, 80)}${req.length > 80 ? '...' : ''}`, 'info');
    });
    
    try {
      // Refresh page to get clean BASE state
      const tab = await this.getTargetTab();
      if (tab) {
        await chrome.tabs.reload(tab.id);
        await this.sleep(3000);
        this.addStatusLog('🔄 Page refreshed to BASE state', 'info');
      }
      
      // Run comprehensive Visual QA against ALL requests
      this.addStatusLog('🎯 Running Visual QA for complete suite...', 'info');
      
      // Set up auto-iteration for full validation
      this.autoIteration = {
        active: true,
        currentVariation: variationNumber,
        iterations: 0,
        maxIterations: 5, // More iterations for comprehensive review
        startTime: Date.now(),
        source: 'full-suite-retest',
        fullSuiteRequests: fullRequestSummary
      };
      
      // Apply variation and test
      await this.autoIterateVariation(variation, {
        enhancedPrompt: `FULL SUITE REVIEW - Verify ALL requests implemented correctly:

${fullRequestSummary}

This is a comprehensive review against the BASE page (before any changes). 
All ${allRequests.length} requests above should be visible and working correctly in the final result.
Pay special attention to ensuring NO requests were missed or incompletely implemented.`
      });
      
    } catch (error) {
      console.error('[Full Suite Review] Error:', error);
      this.addStatusLog('✗ Full suite review failed', 'error');
      this.showError('Full suite review encountered an error');
    }
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
      // Add timeout to prevent hanging
      const messagePromise = chrome.tabs.sendMessage(tabId, {
        type: 'RESET_VARIATION',
        keyPrefix
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.warn(`[Reset Variation] Timeout after 3s for key: ${keyPrefix}`);
          resolve({ success: false, timeout: true });
        }, 3000);
      });

      const result = await Promise.race([messagePromise, timeoutPromise]);

      if (result?.timeout) {
        console.warn('Reset variation timed out, continuing anyway');
        return true; // Continue anyway, reset is not critical
      }

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
        // Add timeout to retry as well
        const retryPromise = chrome.tabs.sendMessage(tabId, {
          type: 'RESET_VARIATION',
          keyPrefix
        });

        const retryTimeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            console.warn(`[Reset Variation] Retry timeout after 3s for key: ${keyPrefix}`);
            resolve({ success: false, timeout: true });
          }, 3000);
        });

        const retryResult = await Promise.race([retryPromise, retryTimeoutPromise]);

        if (retryResult?.timeout) {
          console.warn('Reset variation retry timed out, continuing anyway');
          return true; // Continue anyway
        }

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
      const tab = await this.getTargetTab();
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

  displayVisualQAResult(qaResult, variationNumber) {
    // Find or create Visual QA display container
    let container = document.getElementById('visualQAResults');

    if (!container) {
      // Create container if it doesn't exist
      const testScreenshot = document.getElementById('testScreenshot');
      if (testScreenshot && testScreenshot.parentNode) {
        container = document.createElement('div');
        container.id = 'visualQAResults';
        container.className = 'visual-qa-results';
        testScreenshot.parentNode.insertBefore(container, testScreenshot.nextSibling);
      } else {
        console.warn('[Visual QA] No container to display results');
        return;
      }
    }

    // Build status badge
    const statusIcons = {
      'PASS': '✓',
      'GOAL_NOT_MET': '⚠️',
      'CRITICAL_DEFECT': '🔴',
      'MAJOR_DEFECT': '🟡',
      'ERROR': '❌'
    };

    const statusColors = {
      'PASS': '#10b981',
      'GOAL_NOT_MET': '#f59e0b',
      'CRITICAL_DEFECT': '#ef4444',
      'MAJOR_DEFECT': '#f59e0b',
      'ERROR': '#ef4444'
    };

    const icon = statusIcons[qaResult.status] || '?';
    const color = statusColors[qaResult.status] || '#6b7280';

    // Build defects list HTML
    let defectsHTML = '';
    if (qaResult.defects && qaResult.defects.length > 0) {
      defectsHTML = '<div class="visual-qa-defects">';
      qaResult.defects.forEach((defect, idx) => {
        const defectIcon = defect.severity === 'critical' ? '🔴' : '🟡';
        defectsHTML += `
          <div class="visual-qa-defect">
            <div class="defect-header">
              <span class="defect-icon">${defectIcon}</span>
              <span class="defect-severity">${defect.severity.toUpperCase()}</span>
              <span class="defect-type">${defect.type}</span>
            </div>
            <div class="defect-description">${this.escapeHTML(defect.description)}</div>
            ${defect.suggestedFix ? `<div class="defect-fix">Fix: ${this.escapeHTML(defect.suggestedFix)}</div>` : ''}
          </div>
        `;
      });
      defectsHTML += '</div>';
    }

    // Build complete HTML
    container.innerHTML = `
      <div class="visual-qa-card">
        <div class="visual-qa-header">
          <div class="visual-qa-title">
            <span class="status-icon" style="color: ${color}">${icon}</span>
            <h3>Visual QA - Iteration ${qaResult.iteration}</h3>
          </div>
          <div class="visual-qa-status" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}">
            ${qaResult.status.replace(/_/g, ' ')}
          </div>
        </div>

        <div class="visual-qa-body">
          ${qaResult.reasoning ? `<div class="visual-qa-reasoning">${this.escapeHTML(qaResult.reasoning)}</div>` : ''}
          ${defectsHTML}

          <div class="visual-qa-meta">
            <span>Goal Accomplished: ${qaResult.goalAccomplished ? '✓ Yes' : '✗ No'}</span>
            <span>Should Continue: ${qaResult.shouldContinue ? 'Yes' : 'No'}</span>
            ${qaResult.timestamp ? `<span>${new Date(qaResult.timestamp).toLocaleTimeString()}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    container.classList.remove('hidden');
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    
    // Debug logging for cost calculation
    console.log('💰 Usage Recorded:', {
      model: usage.model,
      promptTokens,
      completionTokens,
      totalTokens: tokens,
      cacheCreationTokens: usage.cacheCreationTokens || 0,
      cacheReadTokens: usage.cacheReadTokens || 0,
      costDelta: costDelta.toFixed(6),
      totalCost: this.usageStats.cost.toFixed(6)
    });
    
    this.updateUsageDisplay();
    this.persistUsageStats();
  }

  calculateCost(usage) {
    const prices = {
      // OpenAI Models
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4.1-mini': { input: 0.00015, output: 0.0006 },
      'gpt-5-nano': { input: 0.0001, output: 0.0004 },
      'gpt-5-micro': { input: 0.0002, output: 0.0008 },
      'gpt-5-mini': { input: 0.0003, output: 0.0012 },
      'gpt-5-turbo': { input: 0.007, output: 0.021 },
      'gpt-5': { input: 0.01, output: 0.03 },
      // Anthropic Claude Models
      'claude-3-5-sonnet-20240620': { input: 0.003, output: 0.015 },
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015 }, // Generic fallback
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 }, // Alternative naming
      'claude-4.5-sonnet': { input: 0.003, output: 0.015 }, // Alternative naming
      default: { input: 0.0003, output: 0.0012 }
    };
    const rawModel = (usage?.model || this.settings.model || 'gpt-4o-mini').toLowerCase();
    const normalizedModel = 
      // Claude models (check specific versions first)
      rawModel.includes('claude-3-5-sonnet-20240620') ? 'claude-3-5-sonnet-20240620'
      : rawModel.includes('claude-3-5-sonnet-20241022') ? 'claude-3-5-sonnet-20241022'
      : rawModel.includes('claude-sonnet-4-20250514') ? 'claude-sonnet-4-20250514'
      : rawModel.includes('claude-3.5-sonnet') ? 'claude-3.5-sonnet'
      : rawModel.includes('claude-4.5-sonnet') ? 'claude-4.5-sonnet'
      : rawModel.includes('claude-3-5-sonnet') ? 'claude-3-5-sonnet'
      // OpenAI models
      : rawModel.startsWith('gpt-5-nano') ? 'gpt-5-nano'
      : rawModel.startsWith('gpt-5-micro') ? 'gpt-5-micro'
      : rawModel.startsWith('gpt-5-mini') ? 'gpt-5-mini'
      : rawModel.startsWith('gpt-5-turbo') ? 'gpt-5-turbo'
      : rawModel.startsWith('gpt-5') ? 'gpt-5'
      : rawModel.startsWith('gpt-4o-mini') ? 'gpt-4o-mini'
      : rawModel.startsWith('gpt-4.1-mini') ? 'gpt-4.1-mini'
      : rawModel.startsWith('gpt-4o') ? 'gpt-4o'
      : 'default';
    const pricing = prices[normalizedModel] || prices.default;

    const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
    const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;
    
    // Handle Claude cache tokens (priced differently)
    const cacheCreationTokens = usage?.cacheCreationTokens || 0;
    const cacheReadTokens = usage?.cacheReadTokens || 0;
    
    // Claude cache pricing: Cache writes = 1.25x, Cache reads = 0.1x input price
    let totalCost = (completionTokens * pricing.output) / 1000;
    
    if (normalizedModel.includes('claude') && (cacheCreationTokens > 0 || cacheReadTokens > 0)) {
      // Claude cache system
      const regularInputTokens = promptTokens - cacheCreationTokens - cacheReadTokens;
      totalCost += (regularInputTokens * pricing.input) / 1000; // Regular input tokens
      totalCost += (cacheCreationTokens * pricing.input * 1.25) / 1000; // Cache creation (25% premium)
      totalCost += (cacheReadTokens * pricing.input * 0.1) / 1000; // Cache reads (90% discount)
    } else {
      // Standard pricing for OpenAI and non-cached Claude requests
      totalCost += (promptTokens * pricing.input) / 1000;
    }
    
    return totalCost;
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

    // Design file upload removed for space optimization
    // this.setupDesignFileUpload();

    // Setup prompt helper
    this.setupPromptHelper();

    // Setup chat tools
    this.setupChatTools();

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
    // Design file upload section removed for UI space optimization
    // Elements no longer exist in HTML
    const uploadBox = document.getElementById('uploadBox');
    if (!uploadBox) {
      console.log('Design file upload section removed for space optimization');
      return;
    }
    // Original functionality preserved but disabled
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
    // Shared context section was removed - suggestions no longer applicable
    console.log('Suggestion ignored (shared context removed):', suggestion);
    
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

  setupChatTools() {
    const elementSelector = document.getElementById('chatElementSelector');
    const capturePage = document.getElementById('chatCapturePage');
    const clearSelection = document.getElementById('chatClearSelection');
    const viewElements = document.getElementById('chatViewElements');

    if (!elementSelector || !capturePage || !clearSelection) return;

    // Initialize chat selected elements storage
    if (!this.chatSelectedElements) {
      this.chatSelectedElements = [];
    }

    // Element selector tool
    elementSelector.addEventListener('click', async () => {
      try {
        elementSelector.classList.add('active');
        this.addChatToolStatus('🎯 Click any element on the page to add it to your chat context...');

        const tab = await this.getTargetTab();
        if (!tab?.url) throw new Error('No target tab found');

        const response = await chrome.runtime.sendMessage({
          type: 'START_ELEMENT_SELECTION',
          tabId: tab.id
        });

        if (response.success) {
          this.addChatSelectedElement(response.data);
          this.updateChatElementsDisplay();
          this.addChatToolStatus('✓ Element added to chat context');
        } else {
          throw new Error(response.error || 'Element selection failed');
        }
      } catch (error) {
        console.error('Chat element selection failed:', error);
        this.addChatToolStatus('✗ Element selection failed: ' + error.message, 'error');
      } finally {
        elementSelector.classList.remove('active');
      }
    });

    // Page capture tool
    capturePage.addEventListener('click', async () => {
      try {
        capturePage.classList.add('active');
        this.addChatToolStatus('📸 Capturing current page...');

        const tab = await this.getTargetTab();
        if (!tab?.url) throw new Error('No target tab found');

        const response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_PAGE',
          tabId: tab.id
        });

        if (response.success) {
          // Add page capture to chat context
          this.chatPageCapture = response.data;
          this.addChatToolStatus('✓ Page captured and added to chat context');
        } else {
          throw new Error(response.error || 'Page capture failed');
        }
      } catch (error) {
        console.error('Chat page capture failed:', error);
        this.addChatToolStatus('✗ Page capture failed: ' + error.message, 'error');
      } finally {
        capturePage.classList.remove('active');
      }
    });

    // Clear selection tool
    clearSelection.addEventListener('click', () => {
      this.chatSelectedElements = [];
      this.chatPageCapture = null;
      this.updateChatElementsDisplay();
      this.addChatToolStatus('✓ Chat context cleared');
    });

    // View elements modal
    viewElements?.addEventListener('click', () => {
      this.showChatElementsModal();
    });
  }

  addChatSelectedElement(elementData) {
    // Avoid duplicates based on selector
    const exists = this.chatSelectedElements.find(el => el.selector === elementData.selector);
    if (exists) {
      this.addChatToolStatus('Element already selected', 'warning');
      return;
    }

    // Add timestamp for ordering
    elementData.addedAt = Date.now();
    this.chatSelectedElements.push(elementData);

    // Limit to 5 elements to keep context manageable
    if (this.chatSelectedElements.length > 5) {
      this.chatSelectedElements.shift(); // Remove oldest
      this.addChatToolStatus('Oldest element removed (max 5 elements)');
    }
  }

  updateChatElementsDisplay() {
    const selectedElements = document.getElementById('chatSelectedElements');
    const elementsCount = document.getElementById('chatElementsCount');
    const elementsList = document.getElementById('chatElementsList');
    const clearBtn = document.getElementById('chatClearSelection');
    const contextIndicator = document.getElementById('chatContextIndicator');

    if (!selectedElements || !elementsCount || !elementsList) return;

    const totalElements = this.chatSelectedElements.length;
    const hasPageCapture = !!this.chatPageCapture;
    const totalContext = totalElements + (hasPageCapture ? 1 : 0);

    if (totalContext === 0) {
      selectedElements.classList.add('hidden');
      contextIndicator?.classList.add('hidden');
      clearBtn.disabled = true;
      return;
    }

    // Show elements display and context indicator
    selectedElements.classList.remove('hidden');
    contextIndicator?.classList.remove('hidden');
    clearBtn.disabled = false;

    // Update count
    let countText = '';
    if (hasPageCapture && totalElements > 0) {
      countText = `Full page + ${totalElements} element${totalElements === 1 ? '' : 's'}`;
    } else if (hasPageCapture) {
      countText = 'Full page captured';
    } else {
      countText = `${totalElements} element${totalElements === 1 ? '' : 's'} selected`;
    }
    elementsCount.textContent = countText;

    // Update elements list
    elementsList.innerHTML = '';

    // Show page capture if exists
    if (hasPageCapture) {
      const pageItem = this.createChatElementItem({
        selector: 'Full Page',
        tag: 'PAGE',
        dimensions: { width: this.chatPageCapture.viewport?.width || 1200, height: this.chatPageCapture.viewport?.height || 800 },
        screenshot: this.chatPageCapture.screenshot,
        type: 'page'
      });
      elementsList.appendChild(pageItem);
    }

    // Show selected elements
    this.chatSelectedElements.forEach(element => {
      const item = this.createChatElementItem(element);
      elementsList.appendChild(item);
    });
  }

  createChatElementItem(elementData) {
    const item = document.createElement('div');
    item.className = 'selected-element-item';
    
    const isPage = elementData.type === 'page';
    
    item.innerHTML = `
      <img src="${elementData.screenshot || ''}" class="element-preview-thumb" alt="${elementData.selector}">
      <div class="element-item-info">
        <div class="element-item-selector">${elementData.selector}</div>
        <div class="element-item-meta">
          ${elementData.tag} • ${Math.round(elementData.dimensions?.width || 0)}×${Math.round(elementData.dimensions?.height || 0)}px
        </div>
      </div>
      <button class="element-item-remove" title="Remove from context">×</button>
    `;

    // Remove functionality
    const removeBtn = item.querySelector('.element-item-remove');
    removeBtn.addEventListener('click', () => {
      if (isPage) {
        this.chatPageCapture = null;
      } else {
        const index = this.chatSelectedElements.findIndex(el => el.selector === elementData.selector);
        if (index > -1) {
          this.chatSelectedElements.splice(index, 1);
        }
      }
      this.updateChatElementsDisplay();
      this.addChatToolStatus('✓ Removed from chat context');
    });

    return item;
  }

  addChatToolStatus(message, type = 'info') {
    // Add or update tool status
    let statusEl = document.querySelector('.chat-tools .tool-status');
    
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'tool-status';
      document.querySelector('.chat-tools').appendChild(statusEl);
    }

    const icon = type === 'error' ? '⚠️' : type === 'warning' ? '⚠️' : 'ℹ️';
    statusEl.innerHTML = `<span class="tool-status-icon">${icon}</span>${message}`;
    statusEl.className = `tool-status ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;

    // Auto-clear after 3 seconds
    clearTimeout(this.chatToolStatusTimeout);
    this.chatToolStatusTimeout = setTimeout(() => {
      if (statusEl.parentElement) {
        statusEl.remove();
      }
    }, 3000);
  }

  getChatContextForAI() {
    // Build context string for AI that includes selected elements and page capture
    let context = '';

    if (this.chatPageCapture) {
      context += 'FULL PAGE CONTEXT: Complete page screenshot and HTML provided.\n\n';
    }

    if (this.chatSelectedElements.length > 0) {
      context += 'SELECTED ELEMENTS:\n';
      this.chatSelectedElements.forEach((element, index) => {
        context += `${index + 1}. ${element.selector} (${element.tag})\n`;
        context += `   Dimensions: ${Math.round(element.dimensions?.width || 0)}×${Math.round(element.dimensions?.height || 0)}px\n`;
        if (element.textContent) {
          context += `   Content: "${element.textContent.substring(0, 100)}..."\n`;
        }
      });
      context += '\n';
    }

    if (context) {
      context += 'Please consider this context when providing suggestions and generating code.\n\n';
    }

    return context;
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
    const description = ''; // Shared context section removed

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
        if (modelSelect) modelSelect.value = this.settings.model || 'gpt-5-mini';
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

  /**
   * Log code quality analysis results
   */
  logQualityAnalysis(analysis) {
    const summary = this.codeQualityMonitor.getSummary();

    console.log('📊 Code Quality Analysis:', {
      score: summary.score,
      status: summary.status,
      issues: analysis.issues.length,
      degraded: summary.degraded
    });

    // Log quality score
    if (summary.score >= 80) {
      this.addStatusLog(`📊 Code Quality: ${summary.status} (${summary.score}/100)`, 'success');
    } else if (summary.score >= 60) {
      this.addStatusLog(`📊 Code Quality: ${summary.status} (${summary.score}/100)`, 'info');
    } else {
      this.addStatusLog(`⚠️ Code Quality: ${summary.status} (${summary.score}/100)`, 'error');
    }

    // Log major issues
    const majorIssues = analysis.issues.filter(i => i.severity === 'major');
    if (majorIssues.length > 0) {
      majorIssues.forEach(issue => {
        this.addStatusLog(`  ⚠️ ${issue.message}`, 'error');
        console.warn(`[Code Quality] ${issue.type}:`, issue.message, '\nSuggestion:', issue.suggestion);
      });
    }
  }
}

// Initialize
let experimentBuilder;
document.addEventListener('DOMContentLoaded', () => {
  experimentBuilder = new ExperimentBuilder();
  window.experimentBuilder = experimentBuilder;
  console.log('✅ Experiment Builder initialized');
});
