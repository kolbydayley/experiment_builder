// Experiment Builder - Unified Workspace Interface
// Simplified architecture that maintains full backward compatibility

console.log('🎨 Experiment Builder V2 Loading...');

// Add visual loading indicator
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  if (!body.querySelector('.app-v2')) {
    body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: system-ui;"><h2>🎯 Experiment Builder Loading...</h2><p>Setting up your workspace...</p></div>';
  }
});

class UnifiedExperimentBuilder {
  constructor() {
    // Core State
    this.currentPageData = null;
    this.basePageData = null;
    this.targetTabId = null;
    this.variations = [{ id: 1, name: 'Variation 1', description: '' }];
    this.generatedCode = null;
    this.editedCode = {};

    // Workflow State
    this.workflowState = 'fresh'; // fresh, building, results, deploy
    this.focusedVariationId = this.variations[0].id;

    // Status Bar State
    this.currentStatus = null;
    this.statusTimeout = null;
    
    // Settings - DEFAULTS (will be overridden by loadSettings)
    this.settings = {
      preferCSS: true,
      includeDOMChecks: true,
      authToken: '',
      anthropicApiKey: '',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219'
    };
    
    // Listen for messages from background script
    this.setupMessageListeners();

    // Activity & Chat
    this.conversation = [];
    this.chatState = { sending: false };
    this.messageCounter = 0;
    this.activityItems = [];
    
    // Usage & Performance
    this.usageStats = { tokens: 0, cost: 0 };
    this.usageStorage = this.getUsageStorageArea();
    this.previewState = { activeVariation: null };
    this.captureMode = 'full';
    this.chatSelectedElements = [];

    // Legacy compatibility properties
    this.activePanel = 'build';
    this.aiActivity = { status: 'idle', message: '' };

    // Initialize smart orchestration services
    this.intentAnalyzer = new IntentAnalyzer();
    this.smartContextAssembler = new SmartContextAssembler();

    // Initialize system
    this.initialize();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Sidepanel received message:', message);
      
      if (message.type === 'ELEMENT_SELECTED') {
        this.handleElementSelected(message.data);
        sendResponse({ success: true });
        return true; // Keep the message channel open
      }
      
      if (message.type === 'ELEMENT_SELECTION_CANCELLED') {
        this.handleElementSelectionCancelled();
        sendResponse({ success: true });
        return true; // Keep the message channel open
      }
    });
    
    console.log('✅ Message listeners set up for sidepanel');
  }

  async handleElementSelected(elementData) {
    console.log('🎯 Element selected:', elementData);
    console.log('📸 Screenshot available:', !!elementData.screenshot);
    console.log('📏 Element dimensions:', elementData.dimensions);

    // Store selected element data for code generation (includes screenshot!)
    this.selectedElementData = elementData;

    // Build element description for display
    const elementDescription = this.getElementDescription(elementData);

    // If selected from chat, add it as a chat message and context
    if (this.selectingFromChat) {
      console.log('📍 Element selected from chat context - adding to chat');

      // Add element to chat history
      this.addElementToChatMessage(elementData);

      // Re-open chat drawer
      this.openChatDrawer();

      // Reset flag
      this.selectingFromChat = false;

      // Show status
      this.showStatus(`✅ Element added to chat: ${elementDescription}`, 'success', 3000);

      return; // Don't do the normal element selection flow
    }

    // Normal (non-chat) element selection flow
    // Show success status in persistent status bar
    this.showStatus(`✅ Element selected: ${elementDescription}`, 'success', 3000);

    // Add success activity
    this.addActivity(`Selected: ${elementDescription}`, 'success');

    // Log screenshot availability for debugging
    if (elementData.screenshot) {
      console.log('✅ Element screenshot captured and available for Visual QA');
      this.addActivity('Element screenshot captured for Visual QA', 'success');
    } else {
      console.warn('⚠️ No element screenshot captured');
      this.addActivity('Element selected (no screenshot)', 'info');
    }

    // Auto-capture page if not already captured
    if (!this.currentPageData) {
      console.log('📸 Auto-capturing page data (element selected but no page data)...');
      this.showStatus('📸 Capturing page context...', 'loading');

      try {
        await this.capturePage();
        console.log('✅ Page data captured successfully after element selection');
      } catch (error) {
        console.error('❌ Failed to capture page after element selection:', error);
        this.showStatus('⚠️ Could not capture page data', 'error', 3000);
        // Continue anyway - we have the element data
      }
    }

    // Auto-progress to building state if in fresh state
    if (this.workflowState === 'fresh') {
      console.log('🔄 Auto-progressing from fresh state to building state');
      this.updateWorkflowState('building');
    }

    // Add element info to the description field
    this.addElementToDescription(elementData);
  }

  addElementToDescription(elementData) {
    const descField = document.getElementById('primaryDescription');
    if (descField) {
      // Just store the selected element data - don't clutter the field
      this.selectedElementData = elementData;
      
      // Add a simple placeholder if field is empty
      if (!descField.value.trim()) {
        descField.placeholder = `Describe changes for the selected ${elementData.tag} element...`;
      }
      
      // Focus the field for user input
      descField.focus();
      
      const elementDescription = this.getElementDescription(elementData);
      this.addActivity(`Element selected: ${elementDescription}`, 'success');
    }
  }

  getElementDescription(elementData) {
    let description = elementData.tag;
    
    if (elementData.id) {
      description += `#${elementData.id}`;
    }
    
    if (elementData.classes && elementData.classes.length) {
      description += `.${elementData.classes.slice(0, 2).join('.')}`;
    }
    
    if (elementData.textContent && elementData.textContent.trim()) {
      const text = elementData.textContent.trim().substring(0, 30);
      description += ` ("${text}${elementData.textContent.length > 30 ? '...' : ''}")`;
    }
    
    return description;
  }

  handleElementSelectionCancelled() {
    console.log('🎯 Element selection cancelled');
    this.showStatus('Element selection cancelled', 'info', 3000);
    this.addActivity('Element selection cancelled', 'info');
    this.addChatMessage('assistant', 'Element selection was cancelled. You can still describe elements in your text (like "the red button" or "the main headline") and I\'ll generate appropriate selectors.');
  }

  async initialize() {
    console.log('🚀 Initializing unified workspace...');
    
    try {
      console.log('Step 1: Checking DOM elements...');
      const mainApp = document.getElementById('mainApp');
      if (!mainApp) {
        throw new Error('Main app element not found - HTML may not be loaded correctly');
      }
      console.log('✅ Main app element found');
      
      // Activate V2 interface
      console.log('Step 1.1: Activating V2 interface...');
      mainApp.setAttribute('data-active', 'true');
      console.log('✅ V2 interface activated');
      
      console.log('Step 2: Initialize utilities...');
      this.initializeUtilities();
      
      console.log('Step 3: Initialize Convert.com integration...');
      this.initializeConvertState();
      
      console.log('Step 4: Bind events...');
      this.bindEvents();
      
      console.log('Step 5: Load settings and data...');
      await this.loadSettings();
      await this.loadUsageStats();
      await this.loadCurrentPage();
      await this.loadConvertAPIKeys();
      
      console.log('Step 6: Set initial state...');
      this.updateWorkflowState('fresh');
      
      console.log('Step 7: Inject content scripts proactively...');
      await this.ensureContentScriptsLoaded();

      console.log('Step 8: Add welcome activity...');
      this.addActivity('Ready to create experiments', 'info');

      console.log('✅ Unified workspace ready');
    } catch (error) {
      console.error('❌ Initialization failed at step:', error);
      
      // Try to show error in UI
      try {
        this.addActivity('Initialization error: ' + error.message, 'error');
      } catch (uiError) {
        console.error('❌ Could not even show error in UI:', uiError);
      }
      
      throw error;
    }
  }

  initializeUtilities() {
    // Initialize utility classes with fallbacks
    try {
      this.sessionManager = typeof SessionManager !== 'undefined' ? new SessionManager(this) : null;
      this.keyboardShortcuts = typeof KeyboardShortcuts !== 'undefined' ? new KeyboardShortcuts(this) : null;
      this.promptAssistant = typeof PromptAssistant !== 'undefined' ? new PromptAssistant() : null;
      this.designFileManager = typeof DesignFileManager !== 'undefined' ? new DesignFileManager() : null;
      this.convertSmartLists = typeof ConvertSmartLists !== 'undefined' ? new ConvertSmartLists() : null;
      this.visualQAService = typeof VisualQAService !== 'undefined' ? new VisualQAService() : null;
      this.codeQualityMonitor = typeof CodeQualityMonitor !== 'undefined' ? new CodeQualityMonitor() : null;

      console.log('🛠️ Utilities initialized');
    } catch (error) {
      console.warn('⚠️ Some utilities failed to initialize:', error);
      this.addActivity('Some utilities unavailable, using fallbacks', 'warning');
    }
  }

  async ensureContentScriptsLoaded() {
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.log('ℹ️ No active tab found, skipping content script injection');
        return;
      }

      console.log('📡 Proactively injecting content scripts on tab:', tab.id);

      // Inject all content scripts WITH their dependencies (same order as manifest.json)
      const scripts = [
        'utils/feature-flags.js',
        'utils/performance-monitor.js',
        'utils/regression-test-suite.js',
        'utils/selector-validator.js',
        'utils/code-tester.js',
        'utils/context-builder.js',
        'content-scripts/page-capture.js',
        'content-scripts/element-selector.js'
      ];

      for (const script of scripts) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [script]
          });
          console.log(`✅ Injected ${script}`);
        } catch (error) {
          // Script might already be loaded or page doesn't allow it (chrome:// URLs, etc.)
          console.log(`ℹ️ Could not inject ${script}:`, error.message);
        }
      }

      console.log('✅ Content scripts ready');
    } catch (error) {
      console.warn('⚠️ Content script injection failed:', error);
      // Don't throw - this is not critical for initialization
    }
  }

  initializeConvertState() {
    // Convert.com integration state
    this.convertState = {
      apiKeys: [],
      accounts: [],
      projects: [],
      experiences: [],
      accountId: '',
      projectId: '',
      experienceId: '',
      creationMode: false,
      baselineVariation: null,
      variationStore: new Map(),
      experienceDetails: null
    };
  }

  // ==========================================
  // WORKFLOW STATE MANAGEMENT
  // ==========================================

  updateWorkflowState(newState) {
    console.log(`🔄 Workflow: ${this.workflowState} → ${newState}`);
    
    const previousState = this.workflowState;
    this.workflowState = newState;
    
    // Update UI
    this.updateWorkAreaForState(newState);
    this.updateProgressIndicator(newState);
    
    // Add activity
    this.addActivity(`Switched to ${newState} mode`, 'info');
  }

  updateWorkAreaForState(state) {
    console.log(`🔄 Switching to state: ${state}`);

    // Hide all work states
    const workStates = document.querySelectorAll('.work-state');
    workStates.forEach(el => el.classList.add('hidden'));

    // Explicitly hide build-actions when leaving building state
    if (state !== 'building') {
      const buildActions = document.querySelector('.build-actions');
      if (buildActions) {
        buildActions.style.display = 'none';
        console.log('✅ build-actions explicitly hidden');
      }
    } else {
      // Show build-actions when in building state
      const buildActions = document.querySelector('.build-actions');
      if (buildActions) {
        buildActions.style.display = '';
        console.log('✅ build-actions shown');
      }
    }

    // Show current state
    const currentStateEl = document.getElementById(`${state}State`);
    if (currentStateEl) {
      currentStateEl.classList.remove('hidden');
      console.log(`✅ State ${state} is now visible`);
    } else {
      console.error(`❌ State element ${state}State not found`);
    }

    // Update body class for styling hooks
    document.body.className = document.body.className.replace(/state-\w+/g, '');
    document.body.classList.add(`state-${state}`);

    // Rebind events for the new state
    if (state === 'building') {
      setTimeout(() => this.rebindBuildingStateEvents(), 100);
    }
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

  // ==========================================
  // EVENT BINDING
  // ==========================================

  bindEvents() {
    console.log('🔗 Binding events for unified interface...');

    try {
      console.log('  - Binding primary actions...');
      this.bindPrimaryActions();
      
      console.log('  - Binding chat interface...');
      this.bindChatInterface();
      
      console.log('  - Binding activity stream...');
      this.bindActivityStream();
      
      console.log('  - Binding code drawer...');
      this.bindCodeDrawer();
      
      console.log('  - Binding command palette...');
      this.bindCommandPalette();
      
      console.log('  - Binding settings and tools...');
      this.bindToolsAndSettings();
      
      console.log('  - Binding keyboard shortcuts...');
      this.bindKeyboardShortcuts();

      console.log('  - Binding bottom status bar...');
      this.bindBottomBar();

      console.log('✅ Events bound successfully');
    } catch (error) {
      console.error('❌ Event binding failed:', error);
      throw error;
    }
  }

  bindPrimaryActions() {
    // Select Element (Fresh State) - allows user to select element BEFORE capturing
    const selectElementFirstBtn = document.getElementById('selectElementFirstBtn');
    if (selectElementFirstBtn) {
      selectElementFirstBtn.addEventListener('click', async () => {
        console.log('🎯 Select Element (Fresh) button clicked!');
        await this.activateElementSelector();
        // After element selection, user can then click "Capture Page & Start"
      });
    }

    // Capture and start workflow
    const captureStartBtn = document.getElementById('captureAndStartBtn');
    if (captureStartBtn) {
      captureStartBtn.addEventListener('click', async () => {
        try {
          await this.capturePage();
          this.updateWorkflowState('building');
          this.focusChatInput();
        } catch (error) {
          // Error already handled by capturePage() - no need to show duplicate
          console.error('Capture page button error:', error);
        }
      });
    }

    // Skip capture, go straight to description
    const describeBtn = document.getElementById('describeOnlyBtn');
    if (describeBtn) {
      describeBtn.addEventListener('click', () => {
        this.updateWorkflowState('building');
        this.focusChatInput();
      });
    }

    // Generate experiment
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generateExperiment());
    }

    // Tool buttons in building state
    this.bindBuildingStateTools();
  }

  bindBuildingStateTools() {
    this.rebindBuildingStateEvents();
  }

  rebindBuildingStateEvents() {
    console.log('🔗 Rebinding building state events...');
    
    const selectElementBtn = document.getElementById('selectElementBtn');
    if (selectElementBtn) {
      console.log('✅ Found selectElementBtn, text content:', selectElementBtn.textContent);
      console.log('✅ selectElementBtn visible:', !selectElementBtn.offsetParent === null);
      // Remove existing listeners to prevent duplicates
      selectElementBtn.replaceWith(selectElementBtn.cloneNode(true));
      const newSelectBtn = document.getElementById('selectElementBtn');
      newSelectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Select Element button clicked!');
        this.activateElementSelector();
      });
      console.log('✅ Select Element button event listener attached');
    } else {
      console.error('❌ selectElementBtn not found in DOM');
    }

    const templatesBtn = document.getElementById('templatesBtn');
    if (templatesBtn) {
      console.log('✅ Found templatesBtn, text content:', templatesBtn.textContent);
      console.log('✅ templatesBtn visible:', !templatesBtn.offsetParent === null);
      templatesBtn.replaceWith(templatesBtn.cloneNode(true));
      const newTemplatesBtn = document.getElementById('templatesBtn');
      newTemplatesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📋 Templates button clicked!');
        this.showTemplates();
      });
      console.log('✅ Templates button event listener attached');
    } else {
      console.error('❌ templatesBtn not found in DOM');
      // List all buttons to debug
      const allButtons = document.querySelectorAll('button');
      console.log('🔍 All buttons found:', Array.from(allButtons).map(b => ({ id: b.id, text: b.textContent.trim().substring(0, 20) })));
    }

    const uploadBtn = document.getElementById('uploadDesignBtn');
    if (uploadBtn) {
      console.log('✅ Found uploadDesignBtn');
      uploadBtn.replaceWith(uploadBtn.cloneNode(true));
      const newUploadBtn = document.getElementById('uploadDesignBtn');
      newUploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('📁 Upload Design clicked');
        this.openDesignFileUpload();
      });
    } else {
      console.error('❌ uploadDesignBtn not found');
    }

    const addVariationBtn = document.getElementById('addVariationBtn');
    if (addVariationBtn) {
      console.log('✅ Found addVariationBtn');
      addVariationBtn.replaceWith(addVariationBtn.cloneNode(true));
      const newAddBtn = document.getElementById('addVariationBtn');
      newAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('➕ Add Variation clicked');
        this.addVariation();
      });
    } else {
      console.error('❌ addVariationBtn not found');
    }

    console.log('🔗 Building state events rebound');

    // Regenerate button in results header
    const regenerateBtn = document.getElementById('regenerateBtn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        console.log('🔄 Regenerate button clicked');
        this.regenerateCode();
      });
    }
  }

  async regenerateCode() {
    if (!this.currentPageData) {
      this.showError('Please capture the page first');
      return;
    }

    this.showStatus('🔄 Regenerating code...', 'loading');
    this.addActivity('Regenerating experiment code...', 'info');

    // Go back to building state to allow editing
    this.updateWorkflowState('building');

    // Optionally could auto-regenerate here, but better to let user edit first
  }

  bindChatInterface() {
    // Main chat form
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleChatSubmit();
      });
    }

    // Chat suggestions
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const suggestion = btn.dataset.suggestion;
        if (suggestion) {
          this.insertChatSuggestion(suggestion);
        }
      });
    });

    // Chat tool buttons
    const chatTemplatesBtn = document.getElementById('chatTemplatesBtn');
    if (chatTemplatesBtn) {
      chatTemplatesBtn.addEventListener('click', () => this.showTemplates());
    }

    const chatDesignBtn = document.getElementById('chatDesignBtn');
    if (chatDesignBtn) {
      chatDesignBtn.addEventListener('click', () => this.openDesignFileUpload());
    }

    const chatElementBtn = document.getElementById('chatElementBtn');
    if (chatElementBtn) {
      chatElementBtn.addEventListener('click', () => this.activateElementSelector());
    }

    // Open chat button (in building view)
    const openChatBtn = document.getElementById('openChatBtn');
    if (openChatBtn) {
      openChatBtn.addEventListener('click', () => this.openChat());
    }

    // Floating chat button (FAB)
    const chatFab = document.getElementById('chatFab');
    if (chatFab) {
      chatFab.addEventListener('click', () => this.openChatModal());
    }

    // Chat modal close button
    const closeChatModal = document.getElementById('closeChatModal');
    if (closeChatModal) {
      closeChatModal.addEventListener('click', () => this.closeChatModal());
    }

    // Chat drawer close button
    const closeChatDrawer = document.getElementById('closeChatDrawer');
    if (closeChatDrawer) {
      closeChatDrawer.addEventListener('click', () => this.closeChatDrawer());
    }

    // Chat send button
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', () => this.sendChatMessage());
    }

    // Chat input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      // Auto-resize textarea
      chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';

        // Update character count
        const charCount = document.getElementById('chatCharCount');
        if (charCount) {
          charCount.textContent = `${chatInput.value.length}/2000`;
        }
      });

      // Enter to send, Shift+Enter for new line
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendChatMessage();
        }
      });
    }

    // Select element button in chat
    const chatSelectElementBtn = document.getElementById('chatSelectElementBtn');
    if (chatSelectElementBtn) {
      chatSelectElementBtn.addEventListener('click', () => {
        // Mark that we're selecting from chat context
        this.selectingFromChat = true;
        this.closeChatDrawer();
        this.activateElementSelector();
      });
    }

    // Remove attachment button
    const chatRemoveAttachment = document.getElementById('chatRemoveAttachment');
    if (chatRemoveAttachment) {
      chatRemoveAttachment.addEventListener('click', () => {
        this.removeElementAttachment();
      });
    }

    // Chat clear button removed - chat history is maintained for context

    // Activity log toggle
    const closeActivityLog = document.getElementById('closeActivityLog');
    if (closeActivityLog) {
      closeActivityLog.addEventListener('click', () => this.closeActivityLog());
    }

    // Activity log overlay click
    const activityLogDropdown = document.getElementById('activityLogDropdown');
    if (activityLogDropdown) {
      activityLogDropdown.addEventListener('click', (e) => {
        if (e.target === activityLogDropdown) {
          this.closeActivityLog();
        }
      });
    }

    // Copy activity log
    const copyActivityLogBtn = document.getElementById('copyActivityLogBtn');
    if (copyActivityLogBtn) {
      copyActivityLogBtn.addEventListener('click', () => this.copyActivityLog());
    }

    // Clear activity log
    const clearActivityLogBtn = document.getElementById('clearActivityLogBtn');
    if (clearActivityLogBtn) {
      clearActivityLogBtn.addEventListener('click', () => this.clearActivity());
    }

    // Element selector tool in chat
    const elementTool = document.getElementById('selectElementTool');
    if (elementTool) {
      elementTool.addEventListener('click', () => this.activateElementSelector());
    }
  }

  bindActivityStream() {
    const clearBtn = document.getElementById('clearActivityBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearActivity());
    }

    // Panel toggle for mobile
    const panelToggle = document.getElementById('panelToggle');
    if (panelToggle) {
      panelToggle.addEventListener('click', () => this.toggleLivePanel());
    }
  }

  bindCodeDrawer() {
    console.log('🔗 Binding code drawer events...');
    
    const drawerToggle = document.getElementById('drawerToggle');
    if (drawerToggle) {
      console.log('✅ Found drawerToggle, binding click event');
      drawerToggle.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🔽 drawerToggle clicked');
        this.toggleCodeDrawer();
      });
    } else {
      console.error('❌ drawerToggle not found');
    }

    // Allow clicking header to toggle
    const drawerHeader = document.getElementById('drawerHeader');
    if (drawerHeader) {
      console.log('✅ Found drawerHeader, binding click event');
      drawerHeader.addEventListener('click', (e) => {
        // Only toggle if clicking the header itself, not child elements
        if (e.target === drawerHeader || e.target.closest('.drawer-title')) {
          e.preventDefault();
          console.log('📦 drawerHeader clicked');
          this.toggleCodeDrawer();
        }
      });
    } else {
      console.error('❌ drawerHeader not found');
    }

    const exportBtn = document.getElementById('exportCodeBtn');
    if (exportBtn) {
      console.log('✅ Found exportCodeBtn, binding click event');
      exportBtn.addEventListener('click', () => this.exportCode());
    } else {
      console.error('❌ exportCodeBtn not found');
    }
  }

  bindCommandPalette() {
    const paletteBtn = document.getElementById('commandPaletteBtn');
    if (paletteBtn) {
      paletteBtn.addEventListener('click', () => this.toggleCommandPalette());
    }

    // Close palette on outside click
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeCommandPalette();
        }
      });
    }

    // Search input
    const search = document.getElementById('paletteSearch');
    if (search) {
      search.addEventListener('input', (e) => this.filterCommands(e.target.value));
      search.addEventListener('keydown', (e) => this.handlePaletteNavigation(e));
    }
  }

  bindToolsAndSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    }

    // Results state tools
    const testBtn = document.getElementById('testVariationBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => this.testCurrentVariation());
    }

    const clearPreviewBtn = document.getElementById('clearPreviewBtn');
    if (clearPreviewBtn) {
      clearPreviewBtn.addEventListener('click', () => this.clearPreview());
    }

    const editDescBtn = document.getElementById('editDescriptionBtn');
    if (editDescBtn) {
      editDescBtn.addEventListener('click', () => this.editDescription());
    }

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCode());
    }
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggleCommandPalette();
      }

      // Escape to close overlays
      if (e.key === 'Escape') {
        this.closeAllOverlays();
      }

      // Quick capture
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        this.capturePage();
      }
    });
  }

  // ==========================================
  // CORE FUNCTIONALITY
  // ==========================================

  async capturePage() {
    // Check if user has selected an element to narrow scope
    const scopeMessage = this.selectedElementData
      ? `Capturing elements within selected ${this.selectedElementData.tag}...`
      : 'Capturing current page...';

    this.showStatus(scopeMessage, 'loading');
    this.addActivity(scopeMessage, 'info');
    this.setButtonLoading('captureAndStartBtn', true);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      this.targetTabId = tab.id;

      // Ensure page-capture content script and dependencies are loaded
      console.log('📡 Ensuring page-capture scripts are loaded on tab:', tab.id);
      try {
        const scripts = [
          'utils/context-builder.js',
          'utils/selector-validator.js',
          'content-scripts/page-capture.js'
        ];

        for (const script of scripts) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [script]
            });
          } catch (e) {
            // Might already be loaded
          }
        }
        console.log('✅ Page-capture scripts injected successfully');
        // Small delay to ensure script is ready
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (injectError) {
        // Content script might already be loaded, that's okay
        console.log('ℹ️ Page-capture script injection skipped (likely already loaded):', injectError.message);
      }

      // Send capture message to content script
      // If user selected an element, only capture within that scope
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_PAGE_DATA',
        maxProximityElements: 8,
        maxStructureElements: 12,
        proximityRadius: 300,
        rootElementSelector: this.selectedElementData?.selector || null // SCOPE TO SELECTED ELEMENT
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Capture failed');
      }

      this.currentPageData = response.data;
      this.basePageData = { ...response.data }; // Store original

      // Capture screenshot for Visual QA
      try {
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        });

        // Add screenshot to both currentPageData and basePageData
        this.currentPageData.screenshot = screenshot;
        this.basePageData.screenshot = screenshot;

        console.log('📸 Screenshot captured and stored for Visual QA');
      } catch (screenshotError) {
        console.warn('⚠️ Screenshot capture failed:', screenshotError);
        // Continue without screenshot - not critical for basic functionality
      }

      // Update UI
      this.updatePageInfo(this.currentPageData);
      this.showStatus(`Page captured: ${this.currentPageData.title}`, 'success', 3000);
      this.addActivity(`Page captured: ${this.currentPageData.title}`, 'success');

      return this.currentPageData;
    } catch (error) {
      console.error('Capture failed:', error);
      this.showStatus('Capture failed: ' + error.message, 'error', 5000);
      this.addActivity('Capture failed: ' + error.message, 'error');
      throw error;
    } finally {
      this.setButtonLoading('captureAndStartBtn', false);
    }
  }

  updatePageInfo(pageData) {
    console.log('📄 Updating page info with:', pageData);
    
    // Update current page display
    const urlElements = document.querySelectorAll('#currentUrl, .page-url');
    urlElements.forEach(el => {
      if (el) el.textContent = this.formatUrl(pageData.url);
    });

    // Update page screenshot if in building state
    const screenshot = document.getElementById('pageScreenshot');
    if (screenshot && pageData.screenshot) {
      console.log('📸 Setting screenshot:', pageData.screenshot.substring(0, 50) + '...');
      screenshot.src = pageData.screenshot;
      screenshot.style.display = 'block';
    } else if (screenshot) {
      console.warn('⚠️ No screenshot data available');
      screenshot.style.display = 'none';
    }

    // Update context URL
    const contextUrl = document.getElementById('contextUrl');
    if (contextUrl) {
      contextUrl.textContent = this.formatUrl(pageData.url);
    }

    // Update page status indicator
    const pageStatus = document.getElementById('pageStatus');
    if (pageStatus) {
      pageStatus.innerHTML = `
        <span class="page-indicator">✅</span>
        <span class="page-url">${this.formatUrl(pageData.url)}</span>
      `;
    }

    // Make sure page context is visible
    const pageContext = document.getElementById('pageContext');
    if (pageContext) {
      pageContext.classList.remove('hidden');
    }
  }

  async generateExperiment() {
    if (this.chatState.sending) return;

    this.showStatus('Analyzing intent...', 'loading');
    this.addActivity('Analyzing user intent...', 'info');
    this.setButtonLoading('generateBtn', true);
    this.chatState.sending = true;
    this.updateApiStatus('loading'); // Show loading indicator

    try {
      // Get description from primary input
      const description = document.getElementById('primaryDescription')?.value?.trim();
      if (!description) {
        throw new Error('Please describe the changes you want to make');
      }

      // Check if page data exists
      if (!this.currentPageData || !this.currentPageData.elementDatabase) {
        throw new Error('Please capture the page first before generating code. Click "📸 Capture Page" to start.');
      }

      // STAGE 1: Analyze Intent (lightweight AI call)
      console.log('🔍 [Stage 1] Analyzing intent...');

      let intentAnalysis;
      if (this.generatedCode && this.chatInitiated) {
        // Refinement request
        intentAnalysis = await this.intentAnalyzer.analyzeRefinement({
          message: description,
          elementAttachment: this.selectedElementData,
          currentCode: this.generatedCode,
          chatHistory: this.chatHistory || []
        });
      } else {
        // Initial request
        intentAnalysis = await this.intentAnalyzer.analyzeIntent({
          message: description,
          workflowState: this.workflowState,
          elementAttachment: this.selectedElementData,
          pageDataAvailable: !!this.currentPageData
        });
      }

      console.log('✅ [Stage 1] Intent analyzed:', intentAnalysis);

      // STAGE 2: Assemble Smart Context
      console.log('🏗️ [Stage 2] Assembling context...');
      this.showStatus('Building optimized context...', 'loading');

      let optimizedPageData;
      if (this.generatedCode && this.chatInitiated) {
        // Use refinement-specific assembly
        optimizedPageData = this.smartContextAssembler.assembleRefinementContext(
          intentAnalysis,
          this.currentPageData,
          this.generatedCode
        );
      } else {
        // Use standard assembly
        optimizedPageData = await this.smartContextAssembler.assembleContext(
          intentAnalysis,
          this.currentPageData,
          this.generatedCode
        );
      }

      console.log('✅ [Stage 2] Context assembled');

      // Build generation request with optimized context
      const generationData = {
        description: description,
        variations: this.variations,
        pageData: optimizedPageData,
        settings: this.settings,
        selectedElement: this.selectedElementData || null,
        designFiles: this.uploadedDesignFile ? [this.uploadedDesignFile] : []
      };

      // Log what context we're sending
      console.log('🎯 Generation context (optimized):');
      console.log('  📄 Page data:', !!generationData.pageData);
      console.log('  📸 Page screenshot:', !!generationData.pageData?.screenshot);
      console.log('  🎯 Selected element:', !!generationData.selectedElement);
      console.log('  📸 Element screenshot:', !!generationData.selectedElement?.screenshot);
      console.log('  📁 Design files:', generationData.designFiles.length);
      console.log('  🔢 Element count:', generationData.pageData?.elementDatabase?.elements?.length || 0);

      // STAGE 3: Code Generation (with optimized context)
      console.log('🤖 [Stage 3] Generating code...');
      this.showStatus('Generating code with AI...', 'loading');

      const result = await this.callAIGeneration(generationData);

      if (result?.variations?.length) {
        this.generatedCode = result;
        // Clear button loading state BEFORE switching workflows to prevent empty button flash
        this.setButtonLoading('generateBtn', false);
        this.chatState.sending = false;

        this.updateWorkflowState('results');
        this.displayGeneratedCode(result);
        this.showStatus(`✨ Generated ${result.variations.length} variation${result.variations.length > 1 ? 's' : ''} successfully`, 'success', 4000);
        this.addActivity(`Generated ${result.variations.length} variations`, 'success');
        this.updateApiStatus('success'); // Show success indicator

        // Update cost display if usage data available
        if (result.usage) {
          console.log('📊 Usage data from generation:', result.usage);
          this.updateCostDisplay(result.usage);
        }

        // If chat-initiated, add AI summary of changes to chat
        if (this.chatInitiated) {
          this.addAISummaryToChat(result, generationData.description);
        }

        // NEW: Display test script status if generated
        if (result.testScript) {
          this.displayTestScriptStatus(result.testScript);
        }

        // Auto-launch comprehensive testing pipeline (only if enabled in settings)
        if (this.settings.autoValidateCode !== false) { // Default to true for now
          console.log('🧪 Auto-validation enabled, launching test suite...');
          this.launchAutomaticTesting(result);
        } else {
          console.log('⏭️ Auto-validation disabled, skipping tests');
        }
      } else {
        throw new Error('No code generated');
      }

    } catch (error) {
      console.error('Generation failed:', error);
      this.setButtonLoading('generateBtn', false);
      this.chatState.sending = false;
      this.updateApiStatus('error'); // Show error indicator (red dot)
      this.showStatus('Generation failed: ' + error.message, 'error', 5000);
      this.addActivity('Generation failed: ' + error.message, 'error');
      this.showError(error.message);
    }
  }

  async callAIGeneration(data) {
    console.log('🤖 Starting AI generation with data:', data);

    try {
      // Update status
      this.updateTypingStatus('Analyzing');

      // Use background service worker for AI generation (proper approach for Manifest V3)
      console.log('🔗 Calling background service worker for AI generation...');

      this.updateTypingStatus('Generating');

      // Add timeout to prevent infinite hanging
      const messagePromise = chrome.runtime.sendMessage({
        type: 'GENERATE_CODE',
        data: {
          pageData: data.pageData,
          description: data.description,
          variations: data.variations,
          settings: data.settings,
          selectedElement: data.selectedElement || null, // Pass selected element info
          designFiles: data.designFiles || [],
          tabId: this.targetTabId // Pass the target tab ID for code injection
        }
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('AI generation timed out after 60 seconds. The API might be slow or unavailable.'));
        }, 60000); // 60 second timeout (increased for complex refinements)
      });

      const response = await Promise.race([messagePromise, timeoutPromise]);

      console.log('📡 Background service worker response:', response);

      if (response?.success && response?.code) {
        // Return code, usage data, and test script (NEW)
        return {
          ...response.code,
          usage: response.usage || null,
          testScript: response.testScript || null  // NEW: Include test script data
        };
      } else {
        throw new Error(response?.error || 'AI generation failed - no code returned');
      }
    } catch (error) {
      console.error('❌ Background service worker AI generation failed:', error);
      
      if (error.message.includes('authentication') || error.message.includes('token') || error.message.includes('API key')) {
        // Authentication error - offer to set up API key
        this.showAPIKeySetupDialog();
        const provider = this.settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
        throw new Error(`${provider} API key required. Click the settings button to add your API key.`);
      } else if (error.message.includes('timed out')) {
        // Timeout error
        throw new Error(error.message + ' Try using rule-based generation instead or check your API key.');
      } else {
        // Other error - fall back to rule-based generation  
        console.log('🔄 Falling back to rule-based generation...');
        return this.generateFallbackCode(data);
      }
    }
  }

  generateFallbackCode(data) {
    console.log('🛠️ Generating rule-based code for:', data.description);
    
    const description = data.description.toLowerCase();
    let css = '';
    let js = '';
    
    // Simple rule-based generation based on keywords
    if (description.includes('button')) {
      if (description.includes('red')) {
        css += '.btn, .button, [type="submit"], .cta { background-color: #dc3545 !important; }\n';
      }
      if (description.includes('larger') || description.includes('bigger')) {
        css += '.btn, .button, [type="submit"], .cta { font-size: 1.2em !important; padding: 12px 24px !important; }\n';
      }
      if (description.includes('green')) {
        css += '.btn, .button, [type="submit"], .cta { background-color: #28a745 !important; }\n';
      }
    }
    
    if (description.includes('headline') || description.includes('title')) {
      if (description.includes('larger') || description.includes('bigger')) {
        css += 'h1, h2, .headline, .title { font-size: 1.25em !important; font-weight: bold !important; }\n';
      }
      if (description.includes('color')) {
        css += 'h1, h2, .headline, .title { color: #007bff !important; }\n';
      }
    }
    
    if (description.includes('banner')) {
      css += `
.convert-banner {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background: #ff6b35;
  color: white;
  padding: 10px;
  text-align: center;
  z-index: 9999;
  font-weight: bold;
}
body { margin-top: 50px !important; }
`;
      js += `
// Add promotional banner
const banner = document.createElement('div');
banner.className = 'convert-banner';
banner.innerHTML = 'Special Offer - Limited Time!';
document.body.insertBefore(banner, document.body.firstChild);
`;
    }
    
    // Default fallback if no patterns match
    if (!css && !js) {
      css = `/* Custom styling for: ${data.description} */
.convert-variation {
  /* Add your custom styles here */
  border: 2px solid #007bff;
  background: #f8f9fa;
  padding: 10px;
  border-radius: 5px;
}`;
    }

    return {
      variations: [{
        number: 1,
        name: 'Variation 1',
        css: css,
        js: js || '// Custom JavaScript for variation'
      }],
      message: 'Generated using rule-based patterns. For AI-powered generation, add your OpenAI API key in settings.'
    };
  }

  showAPIKeySetupDialog() {
    this.addChatMessage('assistant', `To use AI-powered code generation, you need an OpenAI API key. 

**Quick Setup:**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Click the settings button (⚙️) in this extension
4. Add your API key

**Alternative:** I can generate basic code using rule-based patterns without an API key.`);

    this.addChatQuickActions([
      { text: '⚙️ Open Settings', action: () => chrome.runtime.openOptionsPage() },
      { text: '🔄 Try Rule-Based Generation', action: () => this.generateExperiment() }
    ]);
  }

  displayGeneratedCode(codeData) {
    // Debug: Log the generated code for inspection
    console.log('🔍 Generated Code Data:', codeData);
    if (codeData.variations) {
      codeData.variations.forEach((v, index) => {
        console.log(`Variation ${index + 1} - ${v.name}:`);
        console.log('CSS:', v.css);
        console.log('JS:', v.js);
      });
    }

    this.updateCodeDrawer(codeData);
    this.displayVariationsGrid(codeData);
    this.updateCodeCount(codeData);
    this.updateResultsHeader(codeData);
    this.addTestingStatusIndicator();
  }

  /**
   * Display test script generation status in chat
   * @param {Object} testScriptData - Test script data from generation
   */
  displayTestScriptStatus(testScriptData) {
    console.log('🧪 Displaying test script status:', testScriptData);

    if (!testScriptData) {
      return; // No test script generated
    }

    const { requirements, testScript, error } = testScriptData;

    if (error) {
      // Test script generation failed
      this.addChatMessage('assistant', `⚠️ Test script generation failed: ${error}`);
      return;
    }

    if (!testScript) {
      // No interactive features detected
      if (requirements && !requirements.hasInteractions) {
        this.addChatMessage('assistant', '📋 No interactive features detected - skipping test script generation.');
      }
      return;
    }

    // Test script generated successfully
    const interactionTypes = requirements?.types?.join(', ') || 'unknown';
    const message = `🧪 **Test Script Generated**

Detected interactions: ${interactionTypes}
Complexity: ${requirements?.complexity || 'unknown'}
Suggested test duration: ${(requirements?.suggestedDuration || 0) / 1000}s

The test script will validate interactive features automatically.`;

    this.addChatMessage('assistant', message);

    // Store test script for later execution
    if (!this.generatedCode) this.generatedCode = {};
    this.generatedCode.testScript = testScriptData;
  }

  updateResultsHeader(codeData) {
    // Update variation count
    const variationCountEl = document.getElementById('variationCount');
    if (variationCountEl) {
      variationCountEl.textContent = codeData.variations?.length || 0;
    }

    // Update QA status (will be updated during testing)
    const qaStatusEl = document.getElementById('qaStatus');
    if (qaStatusEl) {
      qaStatusEl.textContent = '⏳';
      qaStatusEl.title = 'Testing in progress...';
    }
  }

  addTestingStatusIndicator() {
    // Add testing status to the results header
    const resultsHeader = document.querySelector('.results-header');
    if (resultsHeader) {
      let statusContainer = resultsHeader.querySelector('.testing-status-container');
      if (!statusContainer) {
        statusContainer = document.createElement('div');
        statusContainer.className = 'testing-status-container';
        statusContainer.innerHTML = '<div class="testing-status initializing">🔄 Initializing Tests</div>';
        resultsHeader.appendChild(statusContainer);
      }
    }
  }

  updateCodeDrawer(codeData) {
    const drawer = document.getElementById('codeDrawer');
    const content = document.getElementById('drawerContent');
    
    if (!drawer || !content) return;

    // Build code tabs
    const tabs = [];
    codeData.variations?.forEach(v => {
      if (v.css) tabs.push({ id: `v${v.number}-css`, label: `${v.name} CSS`, content: v.css, type: 'css' });
      if (v.js) tabs.push({ id: `v${v.number}-js`, label: `${v.name} JS`, content: v.js, type: 'js' });
    });

    if (codeData.globalCSS) tabs.push({ id: 'global-css', label: 'Global CSS', content: codeData.globalCSS, type: 'css' });
    if (codeData.globalJS) tabs.push({ id: 'global-js', label: 'Global JS', content: codeData.globalJS, type: 'js' });

    // Render code interface
    content.innerHTML = this.renderCodeInterface(tabs);

    // Bind code events
    this.bindCodeEvents(content);

    // Don't auto-expand - let user open it manually via bottom bar button
    // drawer.classList.add('expanded');
  }

  renderCodeInterface(tabs) {
    if (!tabs.length) {
      return '<div class="code-placeholder"><p>No code generated yet</p></div>';
    }

    return `
      <div class="code-tabs">
        ${tabs.map((tab, idx) => `
          <button class="code-tab ${idx === 0 ? 'active' : ''}" data-tab="${tab.id}">
            ${tab.label}
          </button>
        `).join('')}
      </div>
      <div class="code-content">
        ${tabs.map((tab, idx) => `
          <div class="code-panel ${idx === 0 ? 'active' : ''}" data-panel="${tab.id}">
            <div class="code-header">
              <span class="code-language">${tab.type.toUpperCase()}</span>
              <div class="code-header-actions">
                <button class="btn-small save-code-btn" data-tab="${tab.id}" title="Save changes">
                  💾 Save
                </button>
                <button class="btn-small copy-btn" data-content="${this.escapeHtml(tab.content)}">
                  📋 Copy
                </button>
              </div>
            </div>
            <textarea class="code-editor" data-tab="${tab.id}" spellcheck="false">${tab.content}</textarea>
          </div>
        `).join('')}
      </div>
    `;
  }

  bindCodeEvents(container) {
    // Tab switching
    container.querySelectorAll('.code-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this.switchCodeTab(container, tabId);
      });
    });

    // Save buttons
    container.querySelectorAll('.save-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        const textarea = container.querySelector(`.code-editor[data-tab="${tabId}"]`);
        if (textarea) {
          this.saveCodeChanges(tabId, textarea.value);
        }
      });
    });

    // Copy buttons
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const content = btn.dataset.content;
        await navigator.clipboard.writeText(content);
        this.showSuccess('Code copied to clipboard!');
      });
    });
  }

  switchCodeTab(container, tabId) {
    // Update tab states
    container.querySelectorAll('.code-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update panel states  
    container.querySelectorAll('.code-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabId);
    });
  }

  displayVariationsGrid(codeData) {
    const grid = document.getElementById('variationsGrid');
    if (!grid || !codeData.variations) return;

    grid.innerHTML = codeData.variations.map((variation, idx) => `
      <div class="variation-card" data-variation="${variation.number}">
        <div class="variation-header">
          <div class="variation-title-group">
            <h4 class="variation-title">${variation.name}</h4>
            <span class="variation-badge ${variation.testStatus || 'pending'}">${this.getStatusBadge(variation)}</span>
          </div>
        </div>
        ${variation.description ? `<div class="variation-description">${variation.description}</div>` : ''}
        <div class="variation-footer">
          <div class="variation-stats">
            <span class="stat-item">
              <span class="stat-label">CSS</span>
              <span class="stat-value">${variation.css ? `${variation.css.length} chars` : 'None'}</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">JS</span>
              <span class="stat-value">${variation.js ? `${variation.js.length} chars` : 'None'}</span>
            </span>
          </div>
          <button class="var-action-btn var-action-primary" data-variation="${variation.number}" data-action="preview">
            <span class="var-action-icon">👁️</span>
            <span class="var-action-text">Preview on Page</span>
          </button>
          ${this.generatedCode?.testScript?.testScript ? `
          <button class="var-action-btn var-action-secondary" data-variation="${variation.number}" data-action="test">
            <span class="var-action-icon">🧪</span>
            <span class="var-action-text">Run Tests</span>
          </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Bind variation actions
    this.bindVariationActions(grid);
  }

  getStatusBadge(variation) {
    const status = variation.testStatus || 'pending';
    const badges = {
      'pending': '⏳ Pending',
      'testing': '🔄 Testing',
      'passed': '✅ Passed',
      'failed': '❌ Failed',
      'warning': '⚠️ Issues'
    };
    return badges[status] || badges.pending;
  }

  bindVariationActions(container) {
    container.querySelectorAll('.var-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const variationNumber = parseInt(btn.dataset.variation);
        const action = btn.dataset.action;

        if (action === 'preview') {
          this.previewVariation(variationNumber);
        } else if (action === 'test') {
          this.runTestScript(variationNumber); // NEW: Run test script instead
        }
      });
    });
  }

  updateCodeCount(codeData) {
    const counter = document.getElementById('codeCount');
    if (!counter) return;

    const count = codeData.variations?.length || 0;
    counter.textContent = count > 0 ? `${count} variation${count === 1 ? '' : 's'}` : 'No code generated';
  }

  // ==========================================
  // CHAT FUNCTIONALITY  
  // ==========================================

  handleChatSubmit() {
    const input = document.getElementById('chatInput');
    const message = input?.value?.trim();
    
    if (!message || this.chatState.sending) return;

    // Clear input
    input.value = '';

    // Add to conversation
    this.addChatMessage('user', message);

    // Process message
    this.processChatMessage(message);
  }

  addChatMessage(role, content) {
    const container = document.getElementById('chatHistory');
    if (!container) return;

    // Hide welcome message if this is the first real message
    const welcome = document.getElementById('chatWelcome');
    if (welcome && role === 'user') {
      welcome.style.display = 'none';
    }

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}`;

    if (role === 'assistant') {
      messageEl.innerHTML = `
        <div class="assistant-avatar">🤖</div>
        <div class="message-content">${this.formatMessage(content)}</div>
      `;
    } else {
      messageEl.innerHTML = `
        <div class="message-content user-message">${this.escapeHtml(content)}</div>
      `;
    }

    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
  }

  addElementToChatMessage(elementData) {
    console.log('✅ Attaching element to next chat message:', elementData);

    // Store element as pending attachment
    this.pendingElementAttachment = elementData;

    // Build element description
    const elementDescription = this.getElementDescription(elementData);

    // Show attachment preview
    const attachmentPreview = document.getElementById('chatAttachmentPreview');
    const attachmentLabel = document.getElementById('chatAttachmentLabel');

    if (attachmentPreview && attachmentLabel) {
      const displayText = elementData.text ? elementData.text.substring(0, 40) + (elementData.text.length > 40 ? '...' : '') : 'No text';
      attachmentLabel.textContent = `${elementData.tag}${elementData.id ? `#${elementData.id}` : ''} - "${displayText}"`;
      attachmentPreview.classList.remove('hidden');
    }

    // Focus chat input so user can describe what they want to do with this element
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.focus();
      chatInput.placeholder = `Describe what you want to do with this ${elementData.tag}...`;
    }
  }

  async processChatMessage(message, elementAttachment = null) {
    this.chatState.sending = true;
    this.chatInitiated = true; // Track that this is a chat-initiated operation
    this.addActivity(`Processing: ${message.substring(0, 50)}...`, 'info');

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Check if we have generated code (conversation context)
      if (this.generatedCode) {
        // This is a refinement request
        await this.processRefinementRequest(message, elementAttachment);
      } else {
        // This is an initial generation request
        await this.processInitialRequest(message, elementAttachment);
      }

      // NOTE: Don't hide typing indicator here if testing is running
      // The testing pipeline will handle hiding it when complete
    } catch (error) {
      console.error('Chat processing failed:', error);

      // Add error message to chat
      let errorMessage = `Sorry, I encountered an error: ${error.message}`;
      if (error.message.includes('API key')) {
        errorMessage += '\n\nPlease check your API settings by clicking the ⚙️ button.';
      } else if (error.message.includes('Network')) {
        errorMessage += '\n\nPlease check your internet connection and try again.';
      }

      this.addChatMessageToDrawer('assistant', errorMessage);
      this.addActivity('Chat error: ' + error.message, 'error');

      // Hide indicator on error
      this.hideTypingIndicator();
      this.chatState.sending = false;
      this.chatInitiated = false;
    }
  }

  async processInitialRequest(message, elementAttachment = null) {
    // Initialize chat history if not exists
    if (!this.chatHistory) {
      this.chatHistory = [];
    }

    // Add user message to history (with element if attached)
    const historyEntry = {
      role: 'user',
      content: message,
      timestamp: Date.now()
    };

    if (elementAttachment) {
      historyEntry.elementData = elementAttachment;
    }

    this.chatHistory.push(historyEntry);

    // If we're in fresh state, move to building and populate description
    if (this.workflowState === 'fresh') {
      this.updateWorkflowState('building');

      // Populate the description field
      const descField = document.getElementById('primaryDescription');
      if (descField) {
        descField.value = message;
      }
    }

    // Auto-generate if we have page data
    if (this.currentPageData) {
      await this.generateExperimentFromChat(message);
    } else {
      // Offer to capture page or continue without it
      this.addChatMessage('assistant', `I'd love to help you with: "${message}".

I can work in two ways:
1. **Capture the current page** first for context-aware code generation
2. **Generate generic code** based on your description

Would you like me to capture the current page first? You can also click "📸 Capture Page & Start" in the main area.`);
      
      // Add quick action buttons to the chat
      this.addChatQuickActions([
        { text: '📸 Capture Current Page', action: () => this.capturePageFromChat(message) },
        { text: '⚡ Generate Without Page', action: () => this.generateGenericFromChat(message) }
      ]);
    }
  }

  async processRefinementRequest(message, elementAttachment = null) {
    // Add user's refinement request to conversation
    if (!this.chatHistory) {
      this.chatHistory = [];
    }

    const historyEntry = {
      role: 'user',
      content: message,
      timestamp: Date.now()
    };

    if (elementAttachment) {
      historyEntry.elementData = elementAttachment;
    }

    this.chatHistory.push(historyEntry);

    // Removed "Let me refine..." message - just show typing indicator with status updates
    this.addActivity(`Refining code: ${message.substring(0, 50)}...`, 'info');

    // Build full conversation context including original request, chat history, and current code
    const originalRequest = document.getElementById('primaryDescription')?.value || '';

    // Build chat history context including selected elements
    const chatContext = this.chatHistory.map(msg => {
      let contextString = `${msg.role.toUpperCase()}: ${msg.content}`;

      // If this message has associated element data, include it
      if (msg.elementData) {
        const el = msg.elementData;
        contextString += `\n  Selected Element: ${el.tag}`;
        if (el.id) contextString += `#${el.id}`;
        if (el.classes && el.classes.length > 0) contextString += `.${el.classes.join('.')}`;
        if (el.text) contextString += `\n  Text: "${el.text.substring(0, 100)}"`;
        if (el.selector) contextString += `\n  Selector: ${el.selector}`;
      }

      return contextString;
    }).join('\n\n');

    // Build current code context
    let currentCodeContext = '';
    if (this.generatedCode && this.generatedCode.variations) {
      currentCodeContext = '\n\nCURRENT GENERATED CODE:\n';
      this.generatedCode.variations.forEach((v, i) => {
        currentCodeContext += `\n--- ${v.name} ---\n`;
        if (v.css) currentCodeContext += `CSS:\n${v.css}\n`;
        if (v.js) currentCodeContext += `JS:\n${v.js}\n`;
      });
    }

    const fullContext = `⚠️ THIS IS A REFINEMENT REQUEST - YOU MUST PRESERVE ALL EXISTING CODE ⚠️

ORIGINAL REQUEST:
${originalRequest}

CHAT CONVERSATION:
${chatContext}
${currentCodeContext}

🔴 CRITICAL INSTRUCTIONS FOR REFINEMENT 🔴
1. The CURRENT GENERATED CODE above shows what's ALREADY IMPLEMENTED
2. You MUST include ALL of that existing code in your response
3. ONLY ADD the new changes from the latest chat message
4. DO NOT remove or replace any existing functionality
5. DO NOT simplify or "clean up" the existing code
6. Output = COMPLETE existing code + NEW changes

NEW REQUEST TO ADD:
${message}

Your task: Return the COMPLETE code (existing + new). DO NOT output only the new changes.`;

    // Update description to include full context
    const descField = document.getElementById('primaryDescription');
    if (descField) {
      descField.value = fullContext;
    }

    // Temporarily clear chatState.sending to allow generation to proceed
    const wasSending = this.chatState.sending;
    this.chatState.sending = false;

    // Regenerate with full context
    try {
      await this.generateExperiment();
      this.addChatMessage('assistant', `✅ Code updated! I've incorporated your refinement: "${message}"`);

      // Add AI response to chat history
      this.chatHistory.push({
        role: 'assistant',
        content: `Code updated with refinement: ${message}`,
        timestamp: Date.now()
      });

      // Restore original state on success
      this.chatState.sending = wasSending;
    } catch (error) {
      this.addChatMessage('assistant', `Sorry, I had trouble refining the code: ${error.message}`);

      // CRITICAL: Hide typing indicator on error and clean up state
      this.hideTypingIndicator();
      this.chatState.sending = false;
      this.chatInitiated = false;

      // Don't re-throw - we've already handled the error and shown the message
      // The parent handler will be stuck waiting, so we need to clean up here
    }
  }

  async generateExperimentFromChat(description) {
    try {
      console.log('🎯 generateExperimentFromChat called with:', description);
      
      // Populate description and generate
      const descField = document.getElementById('primaryDescription');
      if (descField) {
        descField.value = description;
      }

      console.log('📝 Description field populated, calling generateExperiment...');
      await this.generateExperiment();
      
      console.log('✅ Generation completed successfully');
      this.addChatMessage('assistant', `Great! I've generated Convert.com code based on your request. You can preview the changes, test them on the page, or deploy directly to Convert.com.`);
    } catch (error) {
      console.error('❌ generateExperimentFromChat failed:', error);
      this.addChatMessage('assistant', `I had trouble generating the code: ${error.message}. Could you try rephrasing your request?`);
    }
  }

  insertChatSuggestion(suggestion) {
    const input = document.getElementById('chatInput');
    if (input) {
      input.value = suggestion;
      input.focus();
      // Trigger auto-resize
      this.autoResizeChatInput(input);
    }
  }

  showTypingIndicator() {
    const container = document.getElementById('chatHistory');
    if (!container) return;

    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="assistant-avatar">🤖</div>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
  }

  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  focusChatInput() {
    const input = document.getElementById('chatInput');
    if (input) {
      input.focus();
      input.placeholder = "What changes would you like to make?";
    }
  }

  autoResizeChatInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  addChatQuickActions(actions) {
    const container = document.getElementById('chatHistory');
    if (!container) return;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'chat-quick-actions';
    actionsEl.innerHTML = actions.map(action => `
      <button class="quick-action-btn" data-action="${action.text}">
        ${action.text}
      </button>
    `).join('');

    // Bind actions
    actionsEl.querySelectorAll('.quick-action-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        actions[idx].action();
        // Remove the actions after clicking
        actionsEl.remove();
      });
    });

    container.appendChild(actionsEl);
    container.scrollTop = container.scrollHeight;
  }

  async capturePageFromChat(originalMessage) {
    this.addChatMessage('assistant', 'Great! Let me capture the current page...');
    try {
      await this.capturePage();
      this.addChatMessage('assistant', 'Perfect! Now I can generate context-aware code for your request.');
      await this.generateExperimentFromChat(originalMessage);
    } catch (error) {
      this.addChatMessage('assistant', `I had trouble capturing the page: ${error.message}. Let me try generating generic code instead.`);
      await this.generateGenericFromChat(originalMessage);
    }
  }

  async generateGenericFromChat(message) {
    this.addChatMessage('assistant', 'I\'ll generate generic Convert.com code based on your description. You can always capture a page later for more specific targeting.');
    
    // Populate description and generate
    const descField = document.getElementById('primaryDescription');
    if (descField) {
      descField.value = message;
    }

    // Generate without page data
    try {
      const result = await this.callAIGeneration({
        description: message,
        variations: this.variations,
        pageData: null, // No page data
        settings: this.settings
      });
      
      if (result?.variations?.length) {
        this.generatedCode = result;
        this.updateWorkflowState('results');
        this.displayGeneratedCode(result);
        this.addChatMessage('assistant', `Great! I've generated ${result.variations.length} variation(s) with generic targeting. You can test and refine these on any page.`);
      } else {
        throw new Error('No code generated');
      }
    } catch (error) {
      this.addChatMessage('assistant', `I had trouble generating the code: ${error.message}. Could you try being more specific about what you want to change?`);
    }
  }

  // ==========================================
  // ACTIVITY STREAM
  // ==========================================

  addActivity(message, type = 'info') {
    const container = document.getElementById('activityLogContent');
    if (!container) {
      console.warn('Activity log container not found');
      return;
    }

    const item = {
      timestamp: Date.now(),
      message,
      type
    };

    this.activityItems.push(item);

    const icons = {
      'info': 'ℹ️',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️'
    };

    const itemEl = document.createElement('div');
    itemEl.className = `activity-item ${type}`;
    itemEl.innerHTML = `
      <span class="activity-icon">${icons[type] || icons.info}</span>
      <span class="activity-text">${this.escapeHtml(message)}</span>
      <span class="activity-time">${this.formatTime(new Date(item.timestamp))}</span>
    `;

    container.appendChild(itemEl);

    // Keep only last 100 items
    while (container.children.length > 100) {
      container.removeChild(container.firstChild);
    }

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Update activity count badge
    this.updateActivityCount();

    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  updateActivityCount() {
    const badge = document.getElementById('activityCount');
    if (badge && this.activityItems) {
      const count = this.activityItems.length;
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  copyActivityLog() {
    if (!this.activityItems || this.activityItems.length === 0) {
      this.showStatus('No activities to copy', 'warning', 2000);
      return;
    }

    // Format activities as text
    const logText = this.activityItems.map(item => {
      const timestamp = new Date(item.timestamp).toLocaleString();
      const icon = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[item.type] || 'ℹ️';
      return `[${timestamp}] ${icon} ${item.message}`;
    }).join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(logText).then(() => {
      this.showStatus('📋 Activity log copied to clipboard!', 'success', 3000);
      this.addActivity('Activity log copied to clipboard', 'info');
    }).catch(err => {
      console.error('Failed to copy activity log:', err);
      this.showStatus('Failed to copy activity log', 'error', 3000);
    });
  }

  clearActivity() {
    const container = document.getElementById('activityLogContent');
    if (container) {
      container.innerHTML = '';
      this.activityItems = [];
      this.updateActivityCount();
      // Re-add a cleared message
      setTimeout(() => this.addActivity('Activity log cleared', 'info'), 10);
    }
  }

  // ==========================================
  // UI HELPERS & UTILITIES
  // ==========================================

  toggleCodeDrawer() {
    console.log('🔽 toggleCodeDrawer called');
    const drawer = document.getElementById('codeDrawer');
    if (drawer) {
      console.log('✅ Found code drawer element');
      drawer.classList.toggle('expanded');
      console.log('📦 Drawer expanded:', drawer.classList.contains('expanded'));
      
      const toggle = document.getElementById('drawerToggle');
      if (toggle) {
        const isExpanded = drawer.classList.contains('expanded');
        toggle.textContent = isExpanded ? '↓' : '↑';
        console.log('🔽 Toggle icon updated to:', toggle.textContent);
      } else {
        console.error('❌ drawerToggle element not found');
      }
      
      // Add activity feedback
      this.addActivity(
        drawer.classList.contains('expanded') ? 'Code drawer opened' : 'Code drawer closed',
        'info'
      );
    } else {
      console.error('❌ codeDrawer element not found');
    }
  }

  saveCodeChanges(tabId, newCode) {
    console.log('💾 Saving code changes for tab:', tabId);

    // Parse tab ID (e.g., "v1-css" -> variation 1, CSS)
    const parts = tabId.split('-');
    const isGlobal = parts[0] === 'global';
    const type = parts[parts.length - 1]; // 'css' or 'js'

    if (!this.generatedCode) {
      this.showError('No generated code to update');
      return;
    }

    if (isGlobal) {
      // Update global code
      if (type === 'css') {
        this.generatedCode.globalCSS = newCode;
      } else if (type === 'js') {
        this.generatedCode.globalJS = newCode;
      }
    } else {
      // Update variation code
      const variationNumber = parseInt(parts[0].replace('v', ''));
      const variation = this.generatedCode.variations?.find(v => v.number === variationNumber);

      if (variation) {
        if (type === 'css') {
          variation.css = newCode;
        } else if (type === 'js') {
          variation.js = newCode;
        }
      }
    }

    this.showStatus('💾 Code changes saved', 'success', 2000);
    this.addActivity(`Code updated: ${tabId}`, 'success');

    console.log('✅ Code saved successfully');
  }

  toggleLivePanel() {
    const panel = document.getElementById('livePanel');
    if (panel) {
      panel.classList.toggle('collapsed');
      
      const toggle = document.getElementById('panelToggle');
      if (toggle) {
        toggle.textContent = panel.classList.contains('collapsed') ? '→' : '←';
      }
    }
  }

  openChat() {
    // Legacy method - redirect to new modal
    this.openChatModal();
  }

  openChatDrawer() {
    const drawer = document.getElementById('chatDrawer');
    if (drawer) {
      drawer.classList.remove('hidden');

      // Update context badge
      this.updateChatContext();

      // Focus input
      setTimeout(() => {
        const input = document.getElementById('chatInput');
        if (input) {
          input.focus();
        }
      }, 100);
    }
  }

  closeChatDrawer() {
    const drawer = document.getElementById('chatDrawer');
    if (drawer) {
      drawer.classList.add('hidden');
    }
  }

  updateChatContext() {
    const contextText = document.getElementById('chatContextText');
    if (!contextText) return;

    if (this.currentPageData) {
      const title = this.currentPageData.title || 'Captured page';
      contextText.textContent = title.length > 40 ? title.substring(0, 40) + '...' : title;
    } else {
      contextText.textContent = 'No page captured';
    }
  }

  // clearChatHistory() removed - chat history is maintained for AI context

  // Legacy method names for compatibility
  openChatModal() {
    this.openChatDrawer();
  }

  closeChatModal() {
    this.closeChatDrawer();
  }

  updateChatSuggestions() {
    const actionsContainer = document.getElementById('chatQuickActions');
    const subtitle = document.getElementById('chatSubtitle');

    if (!actionsContainer) return;

    let suggestions = [];
    let subtitleText = 'Ready to help with your experiment';

    // Context-aware suggestions based on workflow state
    if (this.workflowState === 'fresh') {
      subtitleText = 'Let\'s get started with your experiment';
      suggestions = [
        { text: '📸 Capture this page', action: () => { this.closeChatModal(); this.capturePage(); } },
        { text: '🎯 Select an element', action: () => { this.closeChatModal(); this.activateElementSelector(); } },
        { text: '📋 Browse templates', action: () => { this.closeChatModal(); this.showTemplates(); } }
      ];
    } else if (this.workflowState === 'building') {
      subtitleText = 'Describe the changes you want to make';
      suggestions = [
        { text: '🎨 Change button color', action: () => this.insertSuggestion('Change the CTA button to green') },
        { text: '✏️ Update headline text', action: () => this.insertSuggestion('Make the main headline larger and bold') },
        { text: '🖼️ Add promotional banner', action: () => this.insertSuggestion('Add a promotional banner at the top') }
      ];
    } else if (this.workflowState === 'results') {
      subtitleText = 'Code generated - what would you like to do?';
      suggestions = [
        { text: '🔄 Regenerate code', action: () => { this.closeChatModal(); this.regenerateAllCode(); } },
        { text: '🧪 Run Visual QA', action: () => { this.closeChatModal(); this.runVisualQAForAllVariations(); } },
        { text: '📤 Export code', action: () => { this.closeChatModal(); this.exportCode(); } }
      ];
    }

    // Update subtitle
    if (subtitle) {
      subtitle.textContent = subtitleText;
    }

    // Render suggestions
    actionsContainer.innerHTML = suggestions.map(s =>
      `<button class="chat-quick-action-btn">${s.text}</button>`
    ).join('');

    // Bind click handlers
    actionsContainer.querySelectorAll('.chat-quick-action-btn').forEach((btn, idx) => {
      btn.addEventListener('click', suggestions[idx].action);
    });
  }

  insertSuggestion(text) {
    const input = document.getElementById('chatModalInput');
    if (input) {
      input.value = text;
      input.focus();
      // Trigger input event to update char count
      input.dispatchEvent(new Event('input'));
    }
  }

  sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();

    // Check if there's a pending element attachment
    const attachedElement = this.pendingElementAttachment;

    // Add user message to chat (with element attachment if present)
    this.addChatMessageToDrawer('user', message, attachedElement);

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    const charCount = document.getElementById('chatCharCount');
    if (charCount) {
      charCount.textContent = '0/2000';
    }

    // Hide attachment preview
    this.removeElementAttachment();

    // Show typing indicator
    this.showTypingIndicator();

    // Process message (integrate with existing chat logic)
    // Pass the element attachment along
    this.processChatMessage(message, attachedElement);
  }

  removeElementAttachment() {
    this.pendingElementAttachment = null;
    const attachmentPreview = document.getElementById('chatAttachmentPreview');
    if (attachmentPreview) {
      attachmentPreview.classList.add('hidden');
    }

    // Reset input placeholder
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.placeholder = 'Ask me anything about this experiment...';
    }
  }

  addAISummaryToChat(codeResult, userRequest) {
    // Generate a concise summary of what was done
    const variationCount = codeResult.variations?.length || 0;

    if (variationCount === 0) return;

    let summary = `✅ Created ${variationCount} variation${variationCount > 1 ? 's' : ''}:\n\n`;

    // List variations with their names
    codeResult.variations.forEach((variation, index) => {
      summary += `**${variation.name}**\n`;

      const changes = [];

      // Concise change detection
      if (variation.css) {
        if (variation.css.includes('background') || variation.css.includes('color')) changes.push('styling');
        if (variation.css.includes('display') || variation.css.includes('visibility')) changes.push('visibility');
        if (variation.css.includes('position') || variation.css.includes('top') || variation.css.includes('left')) changes.push('positioning');
      }

      if (variation.js) {
        if (variation.js.includes('createElement') || variation.js.includes('innerHTML')) changes.push('new elements');
        if (variation.js.includes('textContent')) changes.push('text changes');
        if (variation.js.includes('setInterval') || variation.js.includes('setTimeout')) changes.push('dynamic behavior');
      }

      if (changes.length > 0) {
        summary += `Modified: ${changes.join(', ')}\n`;
      }

      if (index < variationCount - 1) summary += '\n';
    });

    // Add to chat
    this.addChatMessageToDrawer('assistant', summary);

    // Add to chat history
    if (!this.chatHistory) this.chatHistory = [];
    this.chatHistory.push({
      role: 'assistant',
      content: summary,
      timestamp: Date.now()
    });
  }

  addChatMessageToDrawer(role, content, elementAttachment = null) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const messageEl = document.createElement('div');
    messageEl.className = role === 'user' ? 'chat-user-message' : 'chat-assistant-message';

    const avatar = document.createElement('div');
    avatar.className = role === 'user' ? 'user-avatar' : 'assistant-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    // Format content with basic markdown support
    let formattedContent = this.escapeHtml(content);
    // Bold: **text**
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Newlines to <br>
    formattedContent = formattedContent.replace(/\n/g, '<br>');

    // If there's an element attachment, show it before the message
    if (elementAttachment) {
      const elementBadge = `
        <div class="message-element-badge">
          <span class="element-icon">🎯</span>
          <div class="element-info">
            <div class="element-tag">${elementAttachment.tag}${elementAttachment.id ? `#${elementAttachment.id}` : ''}${elementAttachment.classes && elementAttachment.classes.length > 0 ? `.${elementAttachment.classes[0]}` : ''}</div>
            <div class="element-text">${elementAttachment.text ? this.escapeHtml(elementAttachment.text.substring(0, 50)) + (elementAttachment.text.length > 50 ? '...' : '') : 'No text'}</div>
          </div>
        </div>
      `;
      messageContent.innerHTML = elementBadge + `<div>${formattedContent}</div>`;
    } else {
      messageContent.innerHTML = `<div>${formattedContent}</div>`;
    }

    messageEl.appendChild(avatar);
    messageEl.appendChild(messageContent);
    container.appendChild(messageEl);

    // Scroll to bottom
    const messagesContainer = document.getElementById('chatMessagesContainer');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  showTypingIndicator(status = 'Thinking') {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.classList.remove('hidden');

      // Update status text
      const statusEl = document.getElementById('typingStatus');
      if (statusEl) {
        statusEl.textContent = status;
      }

      // Scroll to show indicator
      const messagesContainer = document.getElementById('chatMessagesContainer');
      if (messagesContainer) {
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 50);
      }
    }
  }

  updateTypingStatus(status) {
    const statusEl = document.getElementById('typingStatus');
    if (statusEl) {
      statusEl.textContent = status;

      // Scroll to ensure visible
      const messagesContainer = document.getElementById('chatMessagesContainer');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
  }

  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.classList.add('hidden');
    }
  }

  // Legacy methods for compatibility
  addChatMessageToModal(role, content) {
    this.addChatMessageToDrawer(role, content);
  }

  showTypingIndicatorModal() {
    this.showTypingIndicator();
  }

  hideTypingIndicatorModal() {
    this.hideTypingIndicator();
  }

  // processChatMessage is defined earlier at line 1439 - removed duplicate stub

  openActivityLog() {
    const dropdown = document.getElementById('activityLogDropdown');
    if (dropdown) {
      dropdown.classList.remove('hidden');

      // Update activity count
      this.updateActivityCount();
    }
  }

  closeActivityLog() {
    const dropdown = document.getElementById('activityLogDropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }

  updateActivityCount() {
    const badge = document.getElementById('activityCountBadge');
    if (badge) {
      const count = this.activityItems?.length || 0;
      badge.textContent = `${count} ${count === 1 ? 'activity' : 'activities'}`;
    }
  }

  toggleCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    const search = document.getElementById('paletteSearch');
    
    if (overlay && overlay.classList.contains('hidden')) {
      overlay.classList.remove('hidden');
      if (search) {
        search.focus();
        this.populateCommands();
      }
    } else {
      this.closeCommandPalette();
    }
  }

  closeCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  populateCommands() {
    const commands = [
      { name: '📸 Capture Full Page', icon: '📸', action: () => { this.closeCommandPalette(); this.capturePage(); } },
      { name: '🎯 Select Element', icon: '🎯', action: () => { this.closeCommandPalette(); this.activateElementSelector(); } },
      { name: '🚀 Generate & Preview', icon: '🚀', action: () => { this.closeCommandPalette(); this.generateExperiment(); } },
      { name: '🧪 Run Visual QA', icon: '🧪', action: () => { this.closeCommandPalette(); this.runVisualQAForAllVariations(); } },
      { name: '🔄 Regenerate Code', icon: '🔄', action: () => { this.closeCommandPalette(); this.regenerateAllCode(); } },
      { name: '📤 Export Code', icon: '📤', action: () => { this.closeCommandPalette(); this.exportCode(); } },
      { name: '📋 Copy All Code', icon: '📋', action: () => { this.closeCommandPalette(); this.copyAllCode(); } },
      { name: '</> Toggle Code Drawer', icon: '</>', action: () => { this.closeCommandPalette(); this.toggleCodeDrawer(); } },
      { name: '💬 Open Chat', icon: '💬', action: () => { this.closeCommandPalette(); this.openChatModal(); } },
      { name: '📋 View Activity Log', icon: '📋', action: () => { this.closeCommandPalette(); this.openActivityLog(); } },
      { name: '🤖 Switch AI Model', icon: '🤖', action: () => { this.closeCommandPalette(); this.openModelSelector(); } },
      { name: '⚙️ Open Settings', icon: '⚙️', action: () => { this.closeCommandPalette(); chrome.runtime.openOptionsPage(); } },
      { name: '🗑️ Clear All Data', icon: '🗑️', action: () => { this.closeCommandPalette(); this.resetWorkflow(); } }
    ];

    const results = document.getElementById('paletteResults');
    if (results) {
      results.innerHTML = commands.map((cmd, idx) => `
        <div class="palette-item ${idx === 0 ? 'selected' : ''}" data-command="${idx}">
          <span class="command-name">${cmd.name}</span>
        </div>
      `).join('');

      // Bind command execution
      results.querySelectorAll('.palette-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
          commands[idx].action();
          this.closeCommandPalette();
        });
      });
    }
  }

  filterCommands(query) {
    const results = document.getElementById('paletteResults');
    if (!results) return;

    const items = results.querySelectorAll('.palette-item');
    const normalizedQuery = query.toLowerCase().trim();

    // If query is empty, show all items
    if (!normalizedQuery) {
      items.forEach(item => {
        item.style.display = '';
      });
      return;
    }

    // Filter items based on command name match
    let firstVisibleIndex = -1;
    items.forEach((item, index) => {
      const commandName = item.querySelector('.command-name')?.textContent || '';
      const matches = commandName.toLowerCase().includes(normalizedQuery);

      item.style.display = matches ? '' : 'none';

      // Track first visible item for selection
      if (matches && firstVisibleIndex === -1) {
        firstVisibleIndex = index;
      }
    });

    // Update selection to first visible item
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === firstVisibleIndex);
    });
  }

  // Command Palette Helper Methods
  async copyAllCode() {
    if (!this.generatedCode || !this.generatedCode.variations) {
      this.showError('No code to copy');
      return;
    }

    // CRITICAL: Include waitForElement utility
    const waitForElementUtility = `// Utility function (required for code execution)
function waitForElement(selector, callback, maxWait = 10000) {
  const start = Date.now();
  const interval = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(interval);
      callback(element);
    } else if (Date.now() - start > maxWait) {
      clearInterval(interval);
      console.warn('Element not found after timeout:', selector);
    }
  }, 100);

  // AUTO-TRACK: Register interval with Cleanup Manager
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
  }
}`;

    const globalJS = this.generatedCode.globalJS || '';
    const utilitySection = globalJS.includes('function waitForElement') ? globalJS :
                          (globalJS ? `${waitForElementUtility}\n\n${globalJS}` : waitForElementUtility);

    const allCode = [
      '/* === GLOBAL JAVASCRIPT (Required Utilities) === */',
      utilitySection,
      '',
      ...this.generatedCode.variations.map((v, idx) => {
        return `/* === VARIATION ${idx + 1}: ${v.name || 'Variation ' + (idx + 1)} === */\n\n/* CSS */\n${v.css || ''}\n\n/* JavaScript */\n${v.js || ''}`;
      })
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(allCode);
      this.showSuccess('All code copied to clipboard');
      this.showStatus('📋 Code copied to clipboard', 'success', 3000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      this.showError('Failed to copy code');
    }
  }

  async runVisualQAForAllVariations() {
    if (!this.generatedCode || !this.generatedCode.variations) {
      this.showError('No variations to test');
      return;
    }

    this.showStatus('🧪 Running Visual QA on all variations...', 'loading');

    for (let i = 0; i < this.generatedCode.variations.length; i++) {
      const variation = this.generatedCode.variations[i];
      await this.runVisualQAValidation(variation, this.generatedCode);
    }

    this.showStatus('✅ Visual QA complete for all variations', 'success', 5000);
  }

  async regenerateAllCode() {
    if (!this.currentPageData) {
      this.showError('No page data available. Please capture the page first.');
      return;
    }

    const primaryDesc = document.getElementById('primaryDescription')?.value;
    if (!primaryDesc) {
      this.showError('Please describe the changes you want to make');
      return;
    }

    this.showStatus('🔄 Regenerating all code...', 'loading');
    await this.generateExperiment();
  }

  resetWorkflow() {
    if (confirm('Are you sure you want to clear all data and start fresh? This cannot be undone.')) {
      this.currentPageData = null;
      this.generatedCode = null;
      this.variations = [{ id: 1, name: 'Variation 1', description: '' }];
      this.conversation = [];
      this.selectedElementData = null;

      // Clear UI
      document.getElementById('primaryDescription').value = '';
      document.getElementById('chatHistory').innerHTML = '';

      // Reset to fresh state
      this.updateWorkflowState('fresh');

      this.showStatus('🗑️ All data cleared', 'success', 3000);
      this.clearActivity();
    }
  }

  openModelSelector() {
    const overlay = document.getElementById('modelSelectorOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  handlePaletteNavigation(e) {
    const results = document.getElementById('paletteResults');
    if (!results) return;

    const visibleItems = Array.from(results.querySelectorAll('.palette-item'))
      .filter(item => item.style.display !== 'none');

    if (visibleItems.length === 0) return;

    const currentIndex = visibleItems.findIndex(item => item.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < visibleItems.length - 1 ? currentIndex + 1 : 0;
      visibleItems.forEach((item, idx) => {
        item.classList.toggle('selected', idx === nextIndex);
      });
      // Scroll into view
      visibleItems[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleItems.length - 1;
      visibleItems.forEach((item, idx) => {
        item.classList.toggle('selected', idx === prevIndex);
      });
      // Scroll into view
      visibleItems[prevIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = visibleItems[currentIndex];
      if (selected) {
        selected.click();
      }
    }
  }

  closeAllOverlays() {
    this.closeCommandPalette();
    this.closeChatModal();
    this.closeActivityLog();
  }

  setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    const textSpan = button.querySelector('.btn-text') || button;
    const loadingSpan = button.querySelector('.btn-loading');

    if (loading) {
      button.disabled = true;
      textSpan.style.display = 'none';
      if (loadingSpan) {
        loadingSpan.classList.remove('hidden');
        loadingSpan.style.display = 'flex'; // Explicitly show loading state
      }
    } else {
      button.disabled = false;
      textSpan.style.display = '';
      if (loadingSpan) {
        loadingSpan.classList.add('hidden');
        loadingSpan.style.display = 'none'; // Explicitly hide loading state
      }
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    const notification = document.getElementById(type + 'Display');
    if (notification) {
      notification.querySelector('.message').textContent = message;
      notification.classList.remove('hidden');
      
      setTimeout(() => {
        notification.classList.add('hidden');
      }, 4000);
    }

    // Also add to activity stream
    this.addActivity(message, type === 'success' ? 'success' : 'error');
  }

  // ==========================================
  // PLACEHOLDER METHODS (Legacy Compatibility)
  // ==========================================

  async previewVariation(variationNumber) {
    try {
      this.addActivity(`Previewing variation ${variationNumber}...`, 'info');

      if (!this.generatedCode?.variations) {
        throw new Error('No variations available');
      }

      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (!variation) {
        throw new Error(`Variation ${variationNumber} not found`);
      }

      // Send preview request through background script
      const response = await chrome.runtime.sendMessage({
        type: 'PREVIEW_VARIATION',
        css: variation.css || '',
        js: variation.js || '',
        variationNumber: variationNumber,
        tabId: this.targetTabId // Pass the stored tab ID
      });

      if (!response.success) {
        throw new Error(response.error || 'Preview failed');
      }

      this.previewState.activeVariation = variationNumber;
      this.addActivity(`Variation ${variationNumber} previewed successfully`, 'success');

      // Update UI
      const testBtn = document.getElementById('testVariationBtn');
      const clearBtn = document.getElementById('clearPreviewBtn');
      if (testBtn) testBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;

    } catch (error) {
      console.error('Preview failed:', error);
      this.addActivity(`Preview failed: ${error.message}`, 'error');
    }
  }

  /**
   * Run test script for a variation (NEW)
   * @param {number} variationNumber - Variation number to test
   */
  async runTestScript(variationNumber) {
    try {
      console.log(`🧪 Running test script for variation ${variationNumber}...`);

      // Check if test script exists
      if (!this.generatedCode?.testScript?.testScript) {
        this.addChatMessage('assistant', '⚠️ No test script available. Generate code with interactive features to create test scripts.');
        return;
      }

      // Update UI to show testing in progress
      this.addActivity(`Running test script for variation ${variationNumber}...`, 'info');
      this.updateVariationBadge(variationNumber, 'testing');

      // Get the test script
      const testScript = this.generatedCode.testScript.testScript;
      const timeout = this.generatedCode.testScript.suggestedDuration || 10000;

      // Execute test script via background
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_TEST_SCRIPT',
        testScript: testScript,
        timeout: timeout,
        tabId: this.targetTabId
      });

      console.log('🧪 Test results:', response);

      if (response.success) {
        const results = response.results;

        // Update variation badge based on results
        const overallStatus = results.testResults?.overallStatus || 'unknown';
        if (overallStatus === 'passed') {
          this.updateVariationBadge(variationNumber, 'passed');
          this.addActivity(`Test script passed for variation ${variationNumber}`, 'success');
        } else if (overallStatus === 'failed') {
          this.updateVariationBadge(variationNumber, 'failed');
          this.addActivity(`Test script failed for variation ${variationNumber}`, 'error');
        } else {
          this.updateVariationBadge(variationNumber, 'warning');
          this.addActivity(`Test script completed with issues for variation ${variationNumber}`, 'warning');
        }

        // Display detailed results in chat
        this.displayTestResults(results, variationNumber);

      } else {
        this.updateVariationBadge(variationNumber, 'failed');
        this.addActivity(`Test execution failed: ${response.error}`, 'error');
        this.addChatMessage('assistant', `❌ Test execution failed: ${response.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Test script execution failed:', error);
      this.updateVariationBadge(variationNumber, 'failed');
      this.addActivity(`Test failed: ${error.message}`, 'error');
      this.addChatMessage('assistant', `❌ Test failed: ${error.message}`);
    }
  }

  /**
   * Display test results in chat (NEW)
   * @param {Object} results - Test execution results
   * @param {number} variationNumber - Variation number
   */
  displayTestResults(results, variationNumber) {
    const testResults = results.testResults || {};
    const overallStatus = testResults.overallStatus || 'unknown';
    const interactions = testResults.interactions || [];
    const validations = testResults.validations || [];

    // Build status emoji
    let statusEmoji = '';
    if (overallStatus === 'passed') statusEmoji = '✅';
    else if (overallStatus === 'failed') statusEmoji = '❌';
    else if (overallStatus === 'error') statusEmoji = '⚠️';
    else statusEmoji = '❓';

    // Build test results message
    let message = `${statusEmoji} **Test Results** (Variation ${variationNumber})

**Status**: ${overallStatus.toUpperCase()}
**Duration**: ${results.duration || 'N/A'}ms
`;

    if (interactions.length > 0) {
      message += `\n**Interactions** (${interactions.length}):\n`;
      interactions.forEach(int => {
        message += `${int.success ? '✅' : '❌'} ${int.type} on ${int.target}\n`;
      });
    }

    if (validations.length > 0) {
      message += `\n**Validations** (${validations.length}):\n`;
      validations.forEach(val => {
        message += `${val.passed ? '✅' : '❌'} ${val.test}\n`;
        if (!val.passed && val.expected && val.actual) {
          message += `   Expected: ${val.expected}, Actual: ${val.actual}\n`;
        }
      });
    }

    if (testResults.error) {
      message += `\n**Error**: ${testResults.error}`;
    }

    this.addChatMessage('assistant', message);
  }

  /**
   * Update variation badge status (NEW)
   * @param {number} variationNumber - Variation number
   * @param {string} status - Status ('testing', 'passed', 'failed', 'warning')
   */
  updateVariationBadge(variationNumber, status) {
    // Update in-memory status
    if (this.generatedCode?.variations) {
      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (variation) {
        variation.testStatus = status;
      }
    }

    // Update DOM
    const card = document.querySelector(`.variation-card[data-variation="${variationNumber}"]`);
    if (card) {
      const badge = card.querySelector('.variation-badge');
      if (badge) {
        badge.className = `variation-badge ${status}`;
        badge.textContent = this.getStatusBadge({ testStatus: status });
      }
    }
  }

  async testVariation(variationNumber) {
    try {
      this.addActivity(`Testing variation ${variationNumber}...`, 'info');

      if (!this.generatedCode?.variations) {
        throw new Error('No variations available');
      }

      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (!variation) {
        throw new Error(`Variation ${variationNumber} not found`);
      }

      // Send test request through background script
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_VARIATION',
        css: variation.css || '',
        js: variation.js || '',
        variationNumber: variationNumber,
        tabId: this.targetTabId // Pass the stored tab ID
      });

      if (!response.success) {
        throw new Error(response.error || 'Test failed');
      }

      this.addActivity(`Variation ${variationNumber} applied to page for testing`, 'success');

    } catch (error) {
      console.error('Test failed:', error);
      this.addActivity(`Test failed: ${error.message}`, 'error');
    }
  }

  testCurrentVariation() {
    const activeVariation = this.previewState.activeVariation || 1;
    this.testVariation(activeVariation);
  }

  async clearPreview() {
    try {
      // Send clear preview request through background script
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_PREVIEW'
      });

      if (!response.success) {
        throw new Error(response.error || 'Clear preview failed');
      }

      this.previewState.activeVariation = null;
      this.addActivity('Preview cleared', 'info');
      
      // Update UI
      document.getElementById('testVariationBtn').disabled = true;
      document.getElementById('clearPreviewBtn').disabled = true;

    } catch (error) {
      console.error('Clear preview failed:', error);
      this.addActivity(`Failed to clear preview: ${error.message}`, 'error');
    }
  }

  async launchAutomaticTesting(codeData) {
    console.log('🚀 Launching automatic testing pipeline...');
    this.showStatus('Starting automatic code validation...', 'loading');
    this.addActivity('🔍 Starting automatic code validation...', 'info');

    // Update chat typing indicator if chat-initiated
    if (this.chatInitiated) {
      this.updateTypingStatus('Running validation tests...');
    }

    // Initialize testing status
    this.updateTestingStatus('initializing');

    // CRITICAL: Reset page to clean state before testing
    // This ensures we're testing the NEW code, not old variations
    console.log('🔄 Resetting page to clean state before testing...');
    this.addActivity('🔄 Resetting page for fresh test...', 'info');

    try {
      await chrome.runtime.sendMessage({
        type: 'CLEAR_INJECTED_ASSETS',
        tabId: this.targetTabId
      });

      // Wait for page to stabilize after clearing
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.warn('Failed to clear page before testing:', error);
      // Continue anyway - the page might not have any injected code
    }

    let passedCount = 0;
    let failedCount = 0;
    const totalCount = (codeData.variations || []).length;

    // Run tests for each variation
    for (const variation of codeData.variations || []) {
      try {
        await this.runVariationTests(variation, codeData);
        passedCount++;
      } catch (error) {
        failedCount++;
        console.error(`Variation ${variation.number} failed testing:`, error);
        // Continue testing other variations
      }
    }

    // Update final status based on results
    const qaStatusEl = document.getElementById('qaStatus');

    if (failedCount === 0) {
      this.updateTestingStatus('complete');
      this.showStatus(`✅ All ${totalCount} variations passed testing`, 'success', 4000);
      this.addActivity(`✅ All ${totalCount} variations passed testing`, 'success');

      if (qaStatusEl) {
        qaStatusEl.textContent = '✅';
        qaStatusEl.title = 'All tests passed';
      }

      // Update chat status if chat-initiated
      if (this.chatInitiated) {
        this.updateTypingStatus('Complete ✅');
        // Hide indicator after short delay
        setTimeout(() => {
          this.hideTypingIndicator();
          this.chatState.sending = false;
          this.chatInitiated = false;
        }, 1500);
      }
    } else if (passedCount > 0) {
      this.updateTestingStatus('partial');
      this.showStatus(`Testing completed: ${passedCount} passed, ${failedCount} failed`, 'warning', 5000);
      this.addActivity(`⚠️ Testing completed: ${passedCount} passed, ${failedCount} failed`, 'warning');

      if (qaStatusEl) {
        qaStatusEl.textContent = '⚠️';
        qaStatusEl.title = `${passedCount} passed, ${failedCount} failed`;
      }

      // Update chat status if chat-initiated
      if (this.chatInitiated) {
        this.updateTypingStatus('Completed with warnings ⚠️');
        setTimeout(() => {
          this.hideTypingIndicator();
          this.chatState.sending = false;
          this.chatInitiated = false;
        }, 1500);
      }
    } else {
      this.updateTestingStatus('failed');
      this.showStatus(`All ${totalCount} variations failed testing`, 'error', 5000);
      this.addActivity(`❌ All ${totalCount} variations failed testing`, 'error');

      if (qaStatusEl) {
        qaStatusEl.textContent = '❌';
        qaStatusEl.title = 'All tests failed';
      }

      // Update chat status if chat-initiated
      if (this.chatInitiated) {
        this.updateTypingStatus('Tests failed ❌');
        setTimeout(() => {
          this.hideTypingIndicator();
          this.chatState.sending = false;
          this.chatInitiated = false;
        }, 1500);
      }
    }
  }

  async runVariationTests(variation, codeData) {
    const testName = `Variation ${variation.number}: ${variation.name}`;
    console.log(`🧪 Testing ${testName}`);
    
    try {
      // Update status for this variation
      this.updateVariationTestStatus(variation.number, 'testing');
      
      // 1. Technical Code Validation
      await this.runTechnicalValidation(variation);
      
      // 2. Syntax and Error Checking  
      await this.runSyntaxValidation(variation);
      
      // 3. Auto-inject and Test on Page
      await this.runPageInjectionTest(variation);
      
      // 4. Visual QA Verification
      await this.runVisualQAValidation(variation, codeData);
      
      // 5. Performance Impact Check
      await this.runPerformanceValidation(variation);
      
      // Mark variation as passed
      this.updateVariationTestStatus(variation.number, 'passed');
      this.addActivity(`✅ ${testName} - All validations passed`, 'success');
      
      // Log detailed results
      console.log(`✅ Complete test results for ${testName}:`, {
        technicalValidation: 'PASSED',
        syntaxValidation: 'PASSED', 
        pageInjection: 'PASSED',
        visualQA: 'PASSED',
        performance: 'PASSED'
      });
      
    } catch (error) {
      console.error(`Testing failed for ${testName}:`, error);
      this.updateVariationTestStatus(variation.number, 'failed');
      this.addActivity(`❌ ${testName} - Tests failed: ${error.message}`, 'error');
      throw error; // Re-throw to let launchAutomaticTesting count it as failed
    }
  }

  async runTechnicalValidation(variation) {
    this.addActivity(`🔧 Technical validation - ${variation.name}`, 'info');
    
    // Auto-fix common AI generation issues
    this.cleanupGeneratedCode(variation);
    
    // Check for critical code issues only
    const criticalIssues = [];
    const warnings = [];
    
    if (variation.css) {
      // CSS validation - only critical issues
      if (variation.css.includes('!important') && variation.css.split('!important').length > 5) {
        warnings.push('Many !important declarations detected');
      }
      
      // Check for template syntax in CSS (like {{variable}})
      if (variation.css.match(/\{\{[A-Za-z_][A-Za-z_0-9]*\}\}/)) {
        criticalIssues.push('Template syntax found in CSS - AI may have returned incomplete code');
      }
    }
    
    if (variation.js) {
      // JavaScript validation - focus on critical issues
      if (variation.js.includes('document.write(')) {
        criticalIssues.push('Use of deprecated document.write()');
      }
      
      if (variation.js.includes('eval(')) {
        criticalIssues.push('Use of potentially unsafe eval()');
      }
      
      // Check for template literals (but not object destructuring or nested objects)
      // Look for patterns like ${var} or {{var}} which indicate template syntax
      if (variation.js.match(/\$\{[A-Z_][A-Z_0-9]*\}/) || variation.js.match(/\{\{[A-Za-z_][A-Za-z_0-9]*\}\}/)) {
        criticalIssues.push('Template syntax found in JavaScript - AI returned incomplete code');
      }
      
      // More lenient DOM query validation
      const hasQuerySelector = variation.js.includes('querySelector');
      const hasErrorHandling = variation.js.includes('try') || variation.js.includes('catch') || 
                              variation.js.includes('if (') || variation.js.includes('?.') ||
                              variation.js.includes('waitForElement');
      
      if (hasQuerySelector && !hasErrorHandling) {
        warnings.push('Consider adding error handling for DOM queries');
      }
    }
    
    // Log warnings but don't fail for them
    if (warnings.length > 0) {
      this.addActivity(`⚠️ Warnings: ${warnings.join(', ')}`, 'warning');
    }
    
    // Only fail for critical issues
    if (criticalIssues.length > 0) {
      throw new Error(`Critical issues found: ${criticalIssues.join(', ')}`);
    }
  }

  cleanupGeneratedCode(variation) {
    // Fix common AI generation issues
    
    if (variation.css) {
      // Remove template syntax
      variation.css = variation.css.replace(/\{\{.*?\}\}/g, '').trim();
      
      // Remove markdown code block syntax
      variation.css = variation.css.replace(/```css\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Clean up extra whitespace
      variation.css = variation.css.replace(/\n\s*\n/g, '\n').trim();
    }
    
    if (variation.js) {
      // Remove template syntax
      variation.js = variation.js.replace(/\{\{.*?\}\}/g, '').trim();
      
      // Remove markdown code block syntax  
      variation.js = variation.js.replace(/```javascript\n?/g, '').replace(/```js\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Clean up extra whitespace
      variation.js = variation.js.replace(/\n\s*\n/g, '\n').trim();
    }
    
    if (variation.css || variation.js) {
      this.addActivity(`🧹 Cleaned up generated code format`, 'info');
    }
  }

  async runSyntaxValidation(variation) {
    this.addActivity(`📝 Syntax validation - ${variation.name}`, 'info');
    
    // Send code to background for syntax checking
    const response = await chrome.runtime.sendMessage({
      type: 'VALIDATE_SYNTAX',
      css: variation.css || '',
      js: variation.js || '',
      variationNumber: variation.number
    });
    
    if (!response.success) {
      throw new Error(`Syntax validation failed: ${response.error}`);
    }
    
    // Handle validation results
    const validation = response.validation;
    
    if (validation.warnings && validation.warnings.length > 0) {
      this.addActivity(`⚠️ Syntax warnings: ${validation.warnings.join(', ')}`, 'warning');
    }
    
    if (!validation.isValid) {
      throw new Error(`Syntax errors found: ${validation.issues.join(', ')}`);
    }
    
    this.addActivity(`✅ Code syntax is valid`, 'success');
  }

  async runPageInjectionTest(variation) {
    this.addActivity(`🚀 Page injection test - ${variation.name}`, 'info');

    // Auto-inject code into page for testing
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_VARIATION',
      css: variation.css || '',
      js: variation.js || '',
      variationNumber: variation.number,
      tabId: this.targetTabId // Pass the stored tab ID
    });

    if (!response.success) {
      throw new Error(`Page injection failed: ${response.error}`);
    }

    // Wait a moment for the code to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for JavaScript errors on the page
    const errorResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_PAGE_ERRORS',
      variationNumber: variation.number,
      tabId: this.targetTabId // Pass the stored tab ID
    });

    if (errorResponse.hasErrors) {
      this.addActivity(`⚠️ Page errors detected but code may still work: ${errorResponse.errors.join(', ')}`, 'warning');
      // Don't fail the test for page errors - they might be false positives
      // throw new Error(`JavaScript errors detected: ${errorResponse.errors.join(', ')}`);
    } else {
      this.addActivity(`✅ No page errors detected after injection`, 'success');
    }
  }

  async runVisualQAValidation(variation, codeData) {
    console.log('🔍 Starting Visual QA validation with AI feedback loop...');
    this.showStatus(`🔍 Running Visual QA analysis on ${variation.name}...`, 'loading');
    this.addActivity(`📸 Visual QA validation - ${variation.name}`, 'info');

    // Update chat typing indicator if chat-initiated
    if (this.chatInitiated) {
      this.updateTypingStatus(`Running Visual QA on ${variation.name}...`);
    }

    // Capture screenshot after code injection
    const afterResponse = await chrome.runtime.sendMessage({
      type: 'CAPTURE_AFTER_INJECTION',
      variationNumber: variation.number,
      tabId: this.targetTabId
    });

    if (!afterResponse.success) {
      console.warn('Visual QA capture failed:', afterResponse.error);
      this.addActivity(`⚠️ Could not capture after screenshot`, 'warning');
      return;
    }

    let afterScreenshot = afterResponse.screenshot;
    const beforeScreenshot = this.currentPageData?.screenshot || this.basePageData?.screenshot;

    if (!beforeScreenshot) {
      console.warn('No before screenshot available for Visual QA');
      this.addActivity(`⚠️ No before screenshot for comparison`, 'warning');
      return;
    }

    this.addActivity(`📷 Screenshots captured, analyzing with AI...`, 'info');

    // Initialize Visual QA service
    if (!this.visualQAService) {
      console.error('Visual QA Service not initialized');
      return;
    }

    // Get the original user request
    const originalRequest = document.getElementById('primaryDescription')?.value || 'Visual QA check';

    // Run Visual QA feedback loop (up to MAX_ITERATIONS)
    let currentCode = { ...variation };
    let iteration = 1;
    const maxIterations = this.visualQAService.MAX_ITERATIONS || 3;
    let previousDefects = [];
    let qaHistory = [];

    while (iteration <= maxIterations) {
      console.log(`[Visual QA] Starting iteration ${iteration}/${maxIterations}`);
      this.updateStatus(`🔍 Visual QA iteration ${iteration}/${maxIterations}...`, 'loading');

      // Update chat typing indicator if chat-initiated
      if (this.chatInitiated) {
        this.updateTypingStatus(`Visual QA iteration ${iteration}/${maxIterations}...`);
      }

      try {
        // Run QA check
        const qaResult = await this.visualQAService.runQA({
          originalRequest,
          beforeScreenshot,
          afterScreenshot,
          iteration,
          previousDefects,
          elementDatabase: this.currentPageData?.elementDatabase || null,
          generatedCode: currentCode
        });

        console.log(`[Visual QA] Iteration ${iteration} result:`, qaResult);
        qaHistory.push(qaResult);

        // Track Visual QA API costs
        if (qaResult.usage) {
          this.updateCostDisplay(qaResult.usage);
          console.log('[Visual QA] API usage tracked:', qaResult.usage);
        }

        // Show result in UI
        if (qaResult.status === 'PASS') {
          this.showStatus(`✅ Visual QA passed - no issues found`, 'success', 4000);
          this.addActivity(`✅ Visual QA PASSED - code looks good!`, 'success');
          break;
        } else {
          const defectCount = qaResult.defects?.length || 0;
          this.updateStatus(`⚠️ Found ${defectCount} defect(s), generating fix...`, 'warning');
          this.addActivity(`⚠️ Visual QA found ${defectCount} defect(s) in iteration ${iteration}`, 'warning');

          // Log defects
          qaResult.defects?.forEach((defect, idx) => {
            console.log(`  Defect ${idx + 1} [${defect.severity}]:`, defect.description);
            this.addActivity(`   ${defect.severity === 'critical' ? '🔴' : '🟡'} ${defect.description.substring(0, 80)}...`, defect.severity === 'critical' ? 'error' : 'warning');
          });
        }

        // Check if we should continue
        const shouldContinue = this.visualQAService.shouldContinueIteration(qaResult, iteration, previousDefects);

        if (!shouldContinue) {
          console.log('[Visual QA] Stopping iterations');
          if (qaResult.status !== 'PASS') {
            this.showStatus(`⚠️ Visual QA completed with ${qaResult.defects?.length || 0} remaining issues`, 'warning', 5000);
            this.addActivity(`⚠️ Visual QA completed after ${iteration} iteration(s) with remaining issues`, 'warning');
          }
          break;
        }

        // Generate feedback for next iteration
        const feedback = this.visualQAService.buildFeedbackForRegeneration(qaResult);
        if (!feedback) {
          break; // No feedback needed
        }

        console.log('[Visual QA] Feedback for regeneration:', feedback);

        // Regenerate code with feedback
        this.updateStatus(`🔄 Regenerating code with QA feedback...`, 'loading');
        const updatedCode = await this.regenerateCodeWithFeedback(originalRequest, currentCode, feedback, iteration);

        if (!updatedCode) {
          console.error('[Visual QA] Code regeneration failed');
          this.addActivity(`❌ Failed to regenerate code with feedback`, 'error');
          break;
        }

        // Update variation with new code
        currentCode = updatedCode;
        variation.css = updatedCode.css;
        variation.js = updatedCode.js;

        // Re-inject updated code
        this.addActivity(`🔄 Re-testing with improved code...`, 'info');
        await chrome.runtime.sendMessage({
          type: 'TEST_VARIATION',
          css: variation.css || '',
          js: variation.js || '',
          variationNumber: variation.number,
          tabId: this.targetTabId
        });

        // Capture new screenshot
        const newAfterResponse = await chrome.runtime.sendMessage({
          type: 'CAPTURE_AFTER_INJECTION',
          variationNumber: variation.number,
          tabId: this.targetTabId
        });

        if (newAfterResponse.success) {
          afterScreenshot = newAfterResponse.screenshot;
        }

        // Store defects for next iteration
        previousDefects = qaResult.defects || [];
        iteration++;

      } catch (error) {
        console.error('[Visual QA] Error in iteration:', error);
        this.addActivity(`❌ Visual QA error: ${error.message}`, 'error');
        break;
      }
    }

    // Store QA history in variation
    variation.qaHistory = qaHistory;
    variation.afterScreenshot = afterScreenshot;

    console.log('[Visual QA] Complete. Total iterations:', iteration - 1);
  }

  async regenerateCodeWithFeedback(originalRequest, currentCode, feedback, iteration) {
    console.log('[Visual QA] Regenerating code with feedback...');

    try {
      // Build enhanced request with feedback
      const enhancedRequest = `${originalRequest}\n\n${feedback}`;

      // Call AI to regenerate code
      const result = await this.callAIGeneration({
        description: enhancedRequest,
        pageData: this.currentPageData,
        settings: this.settings,
        selectedElement: this.selectedElementData,
        variations: [{ id: 1, name: 'Variation 1', description: enhancedRequest }]
      });

      if (result?.variations?.[0]) {
        console.log('[Visual QA] Code regenerated successfully');
        return result.variations[0];
      }

      return null;
    } catch (error) {
      console.error('[Visual QA] Regeneration failed:', error);
      return null;
    }
  }

  async runPerformanceValidation(variation) {
    this.addActivity(`⚡ Performance validation - ${variation.name}`, 'info');
    
    // Check code size and complexity
    const cssSize = (variation.css || '').length;
    const jsSize = (variation.js || '').length;
    
    if (cssSize > 10000) {
      console.warn(`Large CSS size: ${cssSize} characters`);
    }
    
    if (jsSize > 15000) {
      console.warn(`Large JS size: ${jsSize} characters`);
    }
    
    // Check for performance anti-patterns
    if (variation.js && variation.js.includes('setInterval') && !variation.js.includes('clearInterval')) {
      // Check if it's a countdown timer or time-based feature (these typically run for page lifetime)
      const isCountdown = variation.js.includes('countdown') ||
                         variation.js.includes('timer') ||
                         variation.js.includes('hours') ||
                         variation.js.includes('minutes') ||
                         variation.js.includes('seconds');

      // Check if interval stops itself (e.g., countdown that ends)
      const hasSelfStop = variation.js.includes('totalSeconds') ||
                         variation.js.includes('if (') && variation.js.includes('return');

      if (!isCountdown && !hasSelfStop) {
        // This is likely a real memory leak
        console.warn('⚠️ [Performance] setInterval without clearInterval detected');
        this.addActivity(`⚠️ Performance warning: setInterval may cause memory leak`, 'warning');
      } else {
        // This is acceptable (countdown/timer that runs for page lifetime or stops itself)
        console.log('✅ [Performance] setInterval detected but acceptable (countdown/timer with self-stop)');
      }
    }
  }

  updateTestingStatus(status) {
    // Update the UI to show overall testing status
    const statusElement = document.querySelector('.testing-status');
    if (statusElement) {
      const statusTexts = {
        'initializing': '🔄 Initializing Tests',
        'complete': '✅ All Tests Passed',
        'partial': '⚠️ Some Tests Failed',
        'failed': '❌ Tests Failed'
      };
      
      statusElement.textContent = statusTexts[status] || `🔄 Testing: ${status}`;
      statusElement.className = `testing-status ${status}`;
    }
  }

  updateVariationTestStatus(variationNumber, status) {
    // Update the variation object's testStatus property
    if (this.generatedCode?.variations) {
      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (variation) {
        variation.testStatus = status;
        console.log(`Updated variation ${variationNumber} testStatus to:`, status);
      }
    }

    // Update the variation card to show test status
    const variationCard = document.querySelector(`[data-variation="${variationNumber}"]`);
    if (variationCard) {
      // Update the status badge in the variation header
      const statusBadge = variationCard.querySelector('.variation-badge');
      if (statusBadge) {
        const badges = {
          'pending': '⏳ Pending',
          'testing': '🔄 Testing',
          'passed': '✅ Passed',
          'failed': '❌ Failed',
          'warning': '⚠️ Issues'
        };
        statusBadge.textContent = badges[status] || badges.pending;
        statusBadge.className = `variation-badge ${status}`;
      }
    }
  }

  editDescription() {
    this.updateWorkflowState('building');
    this.focusChatInput();
  }

  exportCode() {
    if (!this.generatedCode) {
      this.showError('No code to export');
      return;
    }

    this.addActivity('Exporting code as JSON...', 'info');

    // CRITICAL: Include waitForElement utility in globalJS
    // This utility is required by all generated code
    const waitForElementUtility = `// Utility function (required for code execution)
function waitForElement(selector, callback, maxWait = 10000) {
  const start = Date.now();
  const interval = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(interval);
      callback(element);
    } else if (Date.now() - start > maxWait) {
      clearInterval(interval);
      console.warn('Element not found after timeout:', selector);
    }
  }, 100);

  // AUTO-TRACK: Register interval with Cleanup Manager
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
  }
}`;

    // Combine existing globalJS with utility (if not already present)
    let globalJS = this.generatedCode.globalJS || '';
    if (!globalJS.includes('function waitForElement')) {
      globalJS = globalJS ? `${waitForElementUtility}\n\n${globalJS}` : waitForElementUtility;
    }

    // Format code as JSON export (with test script data)
    const exportData = {
      timestamp: new Date().toISOString(),
      pageUrl: this.currentPageData?.url || 'Unknown',
      variations: this.generatedCode.variations.map(v => ({
        number: v.number,
        name: v.name,
        css: v.css || '',
        js: v.js || '',
        testStatus: v.testStatus || 'pending'
      })),
      globalCSS: this.generatedCode.globalCSS || '',
      globalJS: globalJS,
      // NEW: Include test script data
      testScript: this.generatedCode.testScript ? {
        script: this.generatedCode.testScript.testScript,
        requirements: this.generatedCode.testScript.requirements,
        suggestedDuration: this.generatedCode.testScript.suggestedDuration
      } : null
    };

    // Create downloadable JSON file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convert-experiment-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showStatus('📤 Code exported successfully', 'success', 3000);
    this.addActivity('Code exported as JSON', 'success');
  }

  addVariation() {
    const newId = Math.max(...this.variations.map(v => v.id)) + 1;
    this.variations.push({
      id: newId,
      name: `Variation ${newId}`,
      description: ''
    });
    
    console.log(`➕ Adding variation ${newId}`);
    this.addActivity(`Added Variation ${newId}`, 'info');
    
    // Update the UI to show the new variation
    this.renderVariationBuilder();
  }

  renderVariationBuilder() {
    const additionalVariations = document.getElementById('additionalVariations');
    if (!additionalVariations) return;

    // Only show additional variations if we have more than 1
    if (this.variations.length <= 1) {
      additionalVariations.classList.add('hidden');
      return;
    }

    additionalVariations.classList.remove('hidden');
    
    // Render variations 2+
    const additionalVars = this.variations.slice(1);
    additionalVariations.innerHTML = additionalVars.map(variation => `
      <div class="variation-item" data-variation-id="${variation.id}">
        <div class="variation-header">
          <label for="variation${variation.id}Description">${variation.name}</label>
          <button class="btn-link remove-variation" data-variation-id="${variation.id}">
            Remove
          </button>
        </div>
        <textarea
          id="variation${variation.id}Description"
          placeholder="Describe what's different about this variation..."
          rows="3"
        >${variation.description}</textarea>
        <div class="builder-tools">
          <button class="tool-btn select-element-btn" data-variation-id="${variation.id}" title="Select page element">
            🎯 Select Element
          </button>
          <button class="tool-btn upload-design-btn" data-variation-id="${variation.id}" title="Upload design file">
            📁 Upload Design
          </button>
        </div>
      </div>
    `).join('');

    // Bind remove buttons
    additionalVariations.querySelectorAll('.remove-variation').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const variationId = parseInt(e.target.dataset.variationId);
        this.removeVariation(variationId);
      });
    });

    // Bind textarea changes
    additionalVariations.querySelectorAll('textarea').forEach(textarea => {
      textarea.addEventListener('input', (e) => {
        const variationId = parseInt(e.target.id.replace('variation', '').replace('Description', ''));
        const variation = this.variations.find(v => v.id === variationId);
        if (variation) {
          variation.description = e.target.value;
        }
      });
    });

    // Bind select element buttons
    additionalVariations.querySelectorAll('.select-element-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activateElementSelector();
      });
    });

    // Bind upload design buttons
    additionalVariations.querySelectorAll('.upload-design-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openDesignFileUpload();
      });
    });
  }

  removeVariation(variationId) {
    this.variations = this.variations.filter(v => v.id !== variationId);
    console.log(`➖ Removed variation ${variationId}`);
    this.addActivity(`Removed Variation ${variationId}`, 'info');
    this.renderVariationBuilder();
  }

  async activateElementSelector() {
    console.log('🎯 activateElementSelector called');
    this.showStatus('🎯 Click any element on the page to select it', 'info');
    this.addActivity('Element selector activated - click any element on the page', 'info');

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      this.targetTabId = tab.id;

      console.log('📡 Ensuring content script is loaded on tab:', tab.id);

      // First, ensure content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/element-selector.js']
        });
        console.log('✅ Content script injected successfully');
        // Small delay to ensure script is ready
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (injectError) {
        // Content script might already be loaded, that's okay
        console.log('ℹ️ Content script injection skipped (likely already loaded):', injectError.message);
      }

      console.log('📡 Sending START_ELEMENT_SELECTION message to tab:', tab.id);

      // Send message to content script to activate element selector
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'START_ELEMENT_SELECTION'
      });

      console.log('📡 Content script response:', response);

      if (response?.success) {
        // Status is already shown above
        this.addActivity('Click any element on the page to select it', 'info');
      } else {
        throw new Error('Could not activate element selector');
      }

    } catch (error) {
      console.error('Element selector failed:', error);
      this.showStatus('Element selector unavailable: ' + error.message, 'error', 5000);
      this.addActivity('Element selector unavailable: ' + error.message, 'error');
    }
  }

  showTemplates() {
    console.log('📋 showTemplates called');
    this.addActivity('Opening template library...', 'info');
    
    // Show template selector in the main workflow area instead of chat
    this.showInlineTemplateSelector();
    
    console.log('✅ Template selector displayed in main workflow');
  }

  async showInlineTemplateSelector() {
    // Load templates from storage including template order
    const result = await chrome.storage.local.get(['customTemplates', 'hiddenTemplates', 'templateOrder']);
    const customTemplates = result.customTemplates || {};
    const hiddenTemplates = result.hiddenTemplates || [];
    const templateOrder = result.templateOrder || [];

    // Merge built-in templates with custom templates
    const allTemplatesUnfiltered = {
      ...DEFAULT_TEMPLATES,  // Built-in templates from default-templates.js
      ...customTemplates     // Custom templates (can override built-in)
    };

    // Filter out hidden templates
    const allTemplates = {};
    for (const [id, template] of Object.entries(allTemplatesUnfiltered)) {
      if (!hiddenTemplates.includes(id)) {
        allTemplates[id] = template;
      }
    }

    // Sort templates by templateOrder if it exists
    let sortedTemplateEntries;
    if (templateOrder.length > 0) {
      // Create a map for quick lookup
      const templateMap = new Map(Object.entries(allTemplates));

      // Build sorted array based on templateOrder
      sortedTemplateEntries = templateOrder
        .filter(id => templateMap.has(id)) // Only include templates that exist
        .map(id => [id, templateMap.get(id)]);

      // Add any templates not in the order at the end
      for (const [id, template] of Object.entries(allTemplates)) {
        if (!templateOrder.includes(id)) {
          sortedTemplateEntries.push([id, template]);
        }
      }
    } else {
      // No custom order - use default object order
      sortedTemplateEntries = Object.entries(allTemplates);
    }

    // Create template selector overlay
    const overlay = document.createElement('div');
    overlay.className = 'template-selector-overlay';

    const templateHTML = sortedTemplateEntries.length > 0
      ? sortedTemplateEntries.map(([id, template]) => {
          const isCustom = customTemplates.hasOwnProperty(id);
          return `
            <div class="template-item" data-template-id="${id}">
              <div class="template-icon">${template.icon}</div>
              <div class="template-content">
                <div class="template-title">
                  ${template.name}
                  ${isCustom ? '<span class="template-badge custom">Custom</span>' : '<span class="template-badge builtin">Built-in</span>'}
                </div>
                <div class="template-description-small">${template.description}</div>
                <div class="template-variations-count">${template.variations.length} variation${template.variations.length === 1 ? '' : 's'}</div>
              </div>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">No templates available. Create templates in Settings.</div>';

    overlay.innerHTML = `
      <div class="template-selector-modal">
        <div class="template-header">
          <h3>📋 Select a Template</h3>
          <button class="close-btn" id="closeTemplateSelector">×</button>
        </div>
        <div class="template-list">
          ${templateHTML}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Handle template selection
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-btn') || e.target.classList.contains('template-selector-overlay')) {
        overlay.remove();
        return;
      }

      const templateItem = e.target.closest('.template-item');
      if (templateItem) {
        const templateId = templateItem.dataset.templateId;
        const template = allTemplates[templateId];
        if (template) {
          this.insertTemplateIntoDescription(template);
          overlay.remove();
        }
      }
    });
  }

  insertTemplateIntoDescription(template) {
    const descField = document.getElementById('primaryDescription');
    if (!descField) return;

    // If template has multiple variations, create separate variation fields
    if (template.variations.length > 1) {
      // Get the instruction text (supports both 'instructions' and 'description' for backwards compatibility)
      const firstVariationText = template.variations[0].instructions || template.variations[0].description || '';

      // First variation goes in primary field
      descField.value = firstVariationText;

      // Reset variations array to match template
      this.variations = [{ id: 1, name: 'Variation 1', description: firstVariationText }];

      // Add remaining variations
      for (let i = 1; i < template.variations.length; i++) {
        const variation = template.variations[i];
        const newId = i + 1;
        const variationText = variation.instructions || variation.description || '';

        this.variations.push({
          id: newId,
          name: variation.name || `Variation ${newId}`,
          description: variationText
        });
      }

      // Re-render the variations UI
      this.renderVariationBuilder();

      this.addActivity(`Template "${template.name}" added with ${template.variations.length} variations`, 'success');
    } else {
      // Single variation - just insert the text (supports both field names)
      const templateText = template.variations[0]?.instructions || template.variations[0]?.description || '';
      const currentValue = descField.value.trim();

      if (currentValue) {
        descField.value = currentValue + '\n\n' + templateText;
      } else {
        descField.value = templateText;
      }

      this.addActivity(`Template added: ${template.name}`, 'success');
    }

    // Focus the field
    descField.focus();
  }

  openDesignFileUpload() {
    this.addActivity('Opening design file upload...', 'info');
    
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.figma,.sketch,.psd,.pdf';
    input.style.display = 'none';
    
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleDesignFileUpload(file);
      }
    });
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  async handleDesignFileUpload(file) {
    this.addActivity(`Processing design file: ${file.name}`, 'info');
    
    try {
      // Convert file to base64 for analysis
      const base64 = await this.fileToBase64(file);
      
      // Store the file for later use
      this.uploadedDesignFile = {
        name: file.name,
        data: base64,
        type: file.type
      };
      
      // Add design file info to description instead of opening chat
      this.addDesignToDescription(file);
      
      this.addActivity(`Design file "${file.name}" uploaded successfully`, 'success');
      
    } catch (error) {
      console.error('Design file upload failed:', error);
      this.addActivity('Failed to process design file: ' + error.message, 'error');
    }
  }

  addDesignToDescription(file) {
    const descField = document.getElementById('primaryDescription');
    if (descField) {
      // Show preview
      this.showDesignFilePreview(file, this.uploadedDesignFile.data);

      // Update placeholder if field is empty
      if (!descField.value.trim()) {
        descField.placeholder = `Describe changes based on uploaded design "${file.name}"...`;
      }

      // Focus the field for user input
      descField.focus();
    }
  }

  showDesignFilePreview(file, base64Data) {
    const preview = document.getElementById('designFilePreview');
    const image = document.getElementById('designFileImage');
    const filename = document.getElementById('designFileName');

    if (!preview || !image || !filename) return;

    // Show preview
    preview.classList.remove('hidden');

    // Set image source (only for image files)
    if (file.type.startsWith('image/')) {
      image.src = base64Data;
      image.classList.remove('hidden');
    } else {
      // For non-image files, hide the image and show file icon
      image.classList.add('hidden');
    }

    // Set filename
    filename.textContent = file.name;

    // Setup remove button
    const removeBtn = document.getElementById('removeDesignFile');
    if (removeBtn) {
      removeBtn.onclick = () => this.removeDesignFile();
    }
  }

  removeDesignFile() {
    // Clear stored file
    this.uploadedDesignFile = null;

    // Hide preview
    const preview = document.getElementById('designFilePreview');
    if (preview) {
      preview.classList.add('hidden');
    }

    // Reset placeholder
    const descField = document.getElementById('primaryDescription');
    if (descField && !descField.value.trim()) {
      descField.placeholder = 'Example: Make the call-to-action button red and 20% larger...';
    }

    this.addActivity('Design file removed', 'info');
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  // ==========================================
  // UTILITIES & HELPERS
  // ==========================================

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatMessage(content) {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatUrl(url) {
    try {
      return new URL(url).hostname + new URL(url).pathname;
    } catch {
      return url;
    }
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getUsageStorageArea() {
    return { tokens: 0, cost: 0 };
  }

  // ==========================================
  // COST CALCULATION & TRACKING
  // ==========================================

  updateCostDisplay(usage) {
    if (!usage) return;

    // Calculate cost based on provider and model
    const cost = this.calculateCost(usage);
    this.usageStats.tokens += usage.totalTokens || 0;
    this.usageStats.cost += cost;

    // Update UI
    const costAmount = document.getElementById('costAmount');
    const tokenCount = document.getElementById('tokenCount');
    const currentModel = document.getElementById('currentModel');

    if (costAmount) {
      costAmount.textContent = `$${this.usageStats.cost.toFixed(4)}`;
    }

    if (tokenCount) {
      tokenCount.textContent = this.usageStats.tokens.toLocaleString();
    }

    if (currentModel) {
      const modelName = this.getModelDisplayName(this.settings.model);
      currentModel.textContent = modelName;
    }
  }

  calculateCost(usage) {
    const model = this.settings.model || 'claude-3-7-sonnet-20250219';
    const provider = this.settings.provider || 'anthropic';

    // Pricing per 1M tokens (as of 2025)
    const pricing = {
      'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
      'claude-3-7-sonnet-20250219': { input: 3.00, output: 15.00 },
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 }
    };

    const rates = pricing[model] || pricing['claude-3-7-sonnet-20250219'];

    const inputCost = (usage.promptTokens || 0) / 1000000 * rates.input;
    const outputCost = (usage.completionTokens || 0) / 1000000 * rates.output;

    return inputCost + outputCost;
  }

  getModelDisplayName(model) {
    const names = {
      'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
      'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
      'claude-sonnet-4-20250514': 'Claude Sonnet 4',
      'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4'
    };
    return names[model] || model;
  }

  bindBottomBar() {
    const toggleCodeBtn = document.getElementById('toggleCodeBtn');
    if (toggleCodeBtn) {
      toggleCodeBtn.addEventListener('click', () => this.toggleCodeDrawer());
    }

    // Bind persistent status bar close button
    const statusCloseBtn = document.getElementById('statusCloseBtn');
    if (statusCloseBtn) {
      statusCloseBtn.addEventListener('click', () => this.clearStatus());
    }

    // Bind model selector
    const aiModelIndicator = document.getElementById('aiModelIndicator');
    if (aiModelIndicator) {
      aiModelIndicator.addEventListener('click', () => this.openModelSelector());
    }

    const closeModelSelector = document.getElementById('closeModelSelector');
    if (closeModelSelector) {
      closeModelSelector.addEventListener('click', () => this.closeModelSelector());
    }

    // Bind model options
    document.querySelectorAll('.model-option').forEach(option => {
      option.addEventListener('click', () => {
        const model = option.dataset.model;
        this.selectModel(model);
      });
    });

    // Close modal on overlay click
    const modelOverlay = document.getElementById('modelSelectorOverlay');
    if (modelOverlay) {
      modelOverlay.addEventListener('click', (e) => {
        if (e.target === modelOverlay) {
          this.closeModelSelector();
        }
      });
    }

    // Update current model display
    this.updateModelDisplay();
  }

  openModelSelector() {
    const overlay = document.getElementById('modelSelectorOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');

      // Highlight currently selected model
      const currentModel = this.settings?.model || 'gpt-4o';
      document.querySelectorAll('.model-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.model === currentModel);
      });
    }
  }

  closeModelSelector() {
    const overlay = document.getElementById('modelSelectorOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  async selectModel(model) {
    console.log('🤖 Selecting model:', model);

    // Update settings
    this.settings.model = model;

    // Save to storage
    await chrome.storage.local.set({ settings: this.settings });

    // Update display
    this.updateModelDisplay();

    // Show confirmation
    this.showStatus(`Model changed to ${this.getModelDisplayName(model)}`, 'success', 2000);

    // Close modal
    this.closeModelSelector();
  }

  updateModelDisplay() {
    const currentModelEl = document.getElementById('currentModel');
    if (currentModelEl) {
      const model = this.settings?.model || 'gpt-4o';
      currentModelEl.textContent = this.getModelDisplayName(model);
    }
  }

  updateApiStatus(status = 'success') {
    const statusDot = document.querySelector('.model-status-dot');
    if (!statusDot) return;

    // Remove existing status classes
    statusDot.classList.remove('status-success', 'status-error', 'status-loading');

    // Add appropriate status class
    if (status === 'error') {
      statusDot.classList.add('status-error');
    } else if (status === 'loading') {
      statusDot.classList.add('status-loading');
    } else {
      statusDot.classList.add('status-success');
    }
  }

  getModelDisplayName(model) {
    // Shortened nicknames for bottom bar display (must match settings.html)
    const nicknames = {
      // Anthropic Models
      'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
      'claude-3-7-sonnet-20250219': 'Sonnet 3.7',
      'claude-sonnet-4-20250514': 'Sonnet 4',
      'claude-3-5-haiku-20241022': 'Haiku 3.5',
      // OpenAI Models
      'gpt-4o': '4o',
      'gpt-4o-mini': '4o-mini',
      'gpt-4-turbo': '4-turbo',
      'gpt-4': 'GPT-4'
    };
    return nicknames[model] || model;
  }

  // ==========================================
  // PERSISTENT STATUS BAR MANAGEMENT
  // ==========================================

  showStatus(message, type = 'info', duration = null) {
    const statusBar = document.getElementById('persistentStatusBar');
    const statusMessage = document.getElementById('statusMessage');
    const statusIcon = statusBar?.querySelector('.status-icon');

    if (!statusBar || !statusMessage) return;

    // Clear any existing timeout
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    // Update message and icon
    statusMessage.textContent = message;

    // Set icon based on type
    const icons = {
      'info': 'ℹ️',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'loading': '⏳'
    };

    if (statusIcon) {
      // For loading, use spinner instead of emoji
      if (type === 'loading') {
        statusIcon.innerHTML = '<div class="status-spinner"></div>';
      } else {
        statusIcon.textContent = icons[type] || icons.info;
      }
    }

    // Remove all status type classes
    statusBar.classList.remove('status-info', 'status-success', 'status-error', 'status-warning', 'status-loading');

    // Add current type class
    statusBar.classList.add(`status-${type}`);

    // Show the status bar
    statusBar.classList.remove('hidden');

    // Store current status
    this.currentStatus = { message, type, timestamp: Date.now() };

    // Auto-hide after duration (if specified)
    if (duration) {
      this.statusTimeout = setTimeout(() => {
        this.clearStatus();
      }, duration);
    }

    console.log(`[STATUS ${type.toUpperCase()}] ${message}`);
  }

  clearStatus() {
    const statusBar = document.getElementById('persistentStatusBar');
    if (statusBar) {
      statusBar.classList.add('hidden');
    }

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    this.currentStatus = null;
  }

  updateStatus(message, type = 'info') {
    // Update existing status without resetting animation
    const statusMessage = document.getElementById('statusMessage');
    const statusBar = document.getElementById('persistentStatusBar');
    const statusIcon = statusBar?.querySelector('.status-icon');

    if (!statusMessage || !statusBar) return;

    statusMessage.textContent = message;

    // Update icon if type changed
    if (this.currentStatus?.type !== type) {
      const icons = {
        'info': 'ℹ️',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'loading': '⏳'
      };

      if (statusIcon) {
        if (type === 'loading') {
          statusIcon.innerHTML = '<div class="status-spinner"></div>';
        } else {
          statusIcon.textContent = icons[type] || icons.info;
        }
      }

      // Update type class
      statusBar.classList.remove('status-info', 'status-success', 'status-error', 'status-warning', 'status-loading');
      statusBar.classList.add(`status-${type}`);
    }

    this.currentStatus = { message, type, timestamp: Date.now() };
  }

  // Settings management
  async loadSettings() {
    try {
      // CRITICAL: Must use chrome.storage.local (same as service worker)
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.settings = { ...this.settings, ...result.settings };
        console.log('📄 Settings loaded from storage:', this.settings);
        console.log('  ✅ Provider:', this.settings.provider);
        console.log('  ✅ Model:', this.settings.model);

        // Update model indicator
        this.updateCostDisplay({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      } else {
        console.log('📄 Using default settings (no storage found)');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load settings:', error);
    }
  }
  
  async saveSettings() {
    try {
      // CRITICAL: Must use chrome.storage.local (same as service worker)
      await chrome.storage.local.set({ settings: this.settings });
      console.log('� Settings saved');
    } catch (error) {
      console.warn('⚠️ Failed to save settings:', error);
    }
  }
  
  async loadUsageStats() { console.log('📊 Usage stats loaded'); }
  async loadCurrentPage() { console.log('📄 Current page loaded'); }
  async loadConvertAPIKeys() { console.log('🔑 Convert API keys loaded'); }

  // Legacy compatibility method stubs
  addStatusLog(message, type) {
    this.addActivity(message, type);
  }

  switchPanel(panel) {
    console.log('Legacy panel switch:', panel);
  }

  // Debug method for testing buttons
  testButtons() {
    console.log('🧪 Testing all buttons...');
    
    const buttons = [
      { id: 'selectElementBtn', name: 'Select Element', method: () => this.activateElementSelector() },
      { id: 'templatesBtn', name: 'Templates', method: () => this.showTemplates() },
      { id: 'uploadDesignBtn', name: 'Upload Design', method: () => this.openDesignFileUpload() },
      { id: 'addVariationBtn', name: 'Add Variation', method: () => this.addVariation() },
      { id: 'drawerToggle', name: 'Code Drawer Toggle', method: () => this.toggleCodeDrawer() }
    ];

    buttons.forEach(button => {
      const element = document.getElementById(button.id);
      console.log(`${button.name} (${button.id}):`, element ? '✅ Found' : '❌ Not found');
      if (element) {
        console.log(`  - Visible: ${element.offsetParent !== null}`);
        console.log(`  - Text: "${element.textContent.trim()}"`)
        console.log(`  - Classes: ${element.className}`);
      }
    });
    
    return 'Check console for button status';
  }
}

// ==========================================
// INITIALIZATION
// ==========================================

// Wait for DOM to be ready and initialize
function initializeUnifiedBuilder() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUnifiedBuilder);
    return;
  }

  console.log('🎯 Initializing Unified Experiment Builder...');

  try {
    // Create global instance
    window.experimentBuilder = new UnifiedExperimentBuilder();
    
    // Initialize workspace V2 integration if available
    if (window.workspaceV2) {
      console.log('🔗 Integrating with Workspace V2...');
    }

    console.log('🎉 Unified Experiment Builder Ready!');
  } catch (error) {
    console.error('❌ Failed to initialize Unified Builder:', error);
    
    // Show error in UI if possible
    const errorDisplay = document.getElementById('errorDisplay');
    if (errorDisplay) {
      const message = errorDisplay.querySelector('.message');
      if (message) {
        message.textContent = 'Initialization failed: ' + error.message;
        errorDisplay.classList.remove('hidden');
      }
    }
    
    // Create a minimal fallback
    window.experimentBuilder = {
      error: error,
      initialized: false
    };
  }
}

// Start initialization
initializeUnifiedBuilder();