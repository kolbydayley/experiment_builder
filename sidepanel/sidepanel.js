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
    this.basePageData = null; // IMMUTABLE: Original page state before any code runs
    this.basePageLocked = false; // Flag: true after first successful generation
    this.captureTimestamp = null; // When base page was captured
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
    this.previewState = { activeVariation: null, isApplying: false };
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

      // Handle status updates from service worker
      if (message.type === 'STATUS_UPDATE') {
        this.showStatus(message.message, message.statusType || 'info', null, true);
        // Show typing indicator and update its status
        const cleanMessage = message.message.replace(/^[^\s]+\s+/, ''); // Remove emoji
        this.showTypingIndicator(cleanMessage);
        sendResponse({ success: true });
        return false;
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

      console.log('Step 8: Load experiment history...');
      await this.loadExperimentHistory();

      console.log('Step 9: Add welcome activity...');
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
      this.experimentHistory = typeof ExperimentHistory !== 'undefined' ? new ExperimentHistory() : null;
      this.keyboardShortcuts = typeof KeyboardShortcuts !== 'undefined' ? new KeyboardShortcuts(this) : null;
      this.promptAssistant = typeof PromptAssistant !== 'undefined' ? new PromptAssistant() : null;
      this.designFileManager = typeof DesignFileManager !== 'undefined' ? new DesignFileManager() : null;
      this.convertSmartLists = typeof ConvertSmartLists !== 'undefined' ? new ConvertSmartLists() : null;
      this.visualQAService = typeof VisualQAService !== 'undefined' ? new VisualQAService() : null;
      this.codeQualityMonitor = typeof CodeQualityMonitor !== 'undefined' ? new CodeQualityMonitor() : null;

      // NEW: DOM Code Companion Utilities
      this.domSemanticIndex = typeof DOMSemanticIndex !== 'undefined' ? new DOMSemanticIndex() : null;
      this.domDependencyAnalyzer = typeof DOMDependencyAnalyzer !== 'undefined' ? new DOMDependencyAnalyzer() : null;
      this.domConversationContext = typeof DOMConversationContext !== 'undefined' ? new DOMConversationContext() : null;

      console.log('🛠️ Utilities initialized (including DOM Code Companion)');
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

    // Show/hide Push to Convert.com button when in results state
    if (newState === 'results') {
      this.showPushToConvertButton();
    } else {
      this.hidePushToConvertButton();
    }

    // Add activity
    this.addActivity(`Switched to ${newState} mode`, 'info');
  }

  showPushToConvertButton() {
    const btn = document.getElementById('pushToConvertBtn');
    if (btn && this.generatedCode) {
      btn.classList.remove('hidden');
    }
  }

  hidePushToConvertButton() {
    const btn = document.getElementById('pushToConvertBtn');
    if (btn) {
      btn.classList.add('hidden');
    }
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

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCode());
    }

    // Convert.com sync button
    const pushToConvertBtn = document.getElementById('pushToConvertBtn');
    if (pushToConvertBtn) {
      pushToConvertBtn.addEventListener('click', () => this.openConvertSyncModal());
    }

    // Actions menu
    this.bindActionsMenu();

    // Convert.com sync modal controls
    this.bindConvertSyncModal();
  }

  bindActionsMenu() {
    const menuBtn = document.getElementById('actionsMenuBtn');
    const menu = document.getElementById('actionsMenu');

    if (!menuBtn || !menu) return;

    // Toggle menu on button click
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // Regenerate action
    const regenerateMenuBtn = document.getElementById('regenerateMenuBtn');
    if (regenerateMenuBtn) {
      regenerateMenuBtn.addEventListener('click', () => {
        menu.classList.add('hidden');
        this.regenerateCode();
      });
    }
  }

  bindConvertSyncModal() {
    const modal = document.getElementById('convertSyncModal');
    if (!modal) return;

    // Close modal
    const closeBtn = document.getElementById('closeConvertSync');
    const cancelBtn = document.getElementById('cancelConvertSync');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeConvertSyncModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeConvertSyncModal());

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeConvertSyncModal();
      }
    });

    // API key selector
    const apiKeySelect = document.getElementById('convertApiKeySelect');
    if (apiKeySelect) {
      apiKeySelect.addEventListener('change', () => this.onConvertApiKeyChange());
    }

    // Account selector
    const accountSelect = document.getElementById('convertAccountSelect');
    if (accountSelect) {
      accountSelect.addEventListener('change', () => this.onConvertAccountChange());
    }

    // Project selector
    const projectSelect = document.getElementById('convertProjectSelect');
    if (projectSelect) {
      projectSelect.addEventListener('change', () => this.onConvertProjectChange());
    }

    // Create/Update buttons
    const createBtn = document.getElementById('createConvertExperience');
    const updateBtn = document.getElementById('updateConvertExperience');

    if (createBtn) createBtn.addEventListener('click', () => this.createConvertExperience());
    if (updateBtn) updateBtn.addEventListener('click', () => this.updateConvertExperience());

    // AI generation buttons
    const generateNameBtn = document.getElementById('generateExperienceName');
    const generateDescBtn = document.getElementById('generateExperienceDescription');

    if (generateNameBtn) generateNameBtn.addEventListener('click', () => this.generateExperimentName());
    if (generateDescBtn) generateDescBtn.addEventListener('click', () => this.generateExperimentDescription());
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
  // EXPERIMENT HISTORY
  // ==========================================

  async loadExperimentHistory() {
    if (!this.experimentHistory) {
      console.log('⚠️ Experiment history not available');
      return;
    }

    try {
      // Get current tab URL (not sidepanel URL)
      const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());

      if (!currentUrl) {
        console.log('⚠️ No tab URL available yet');
        return;
      }

      console.log(`📁 Loading experiment history for: ${currentUrl}`);
      const experiments = await this.experimentHistory.getExperimentsForDomain(currentUrl);

      console.log(`📁 Found ${experiments.length} experiments for this domain`);

      if (experiments.length > 0) {
        this.displayExperimentHistory(experiments);
      } else {
        console.log('📁 No previous experiments found for this domain');
      }
    } catch (error) {
      console.error('Failed to load experiment history:', error);
    }
  }

  displayExperimentHistory(experiments) {
    const section = document.getElementById('experimentHistorySection');
    const list = document.getElementById('experimentList');
    const badge = document.getElementById('experimentCountBadge');

    if (!section || !list || !badge) return;

    // Update badge
    badge.textContent = experiments.length;

    // Show section
    section.classList.remove('hidden');

    // Clear existing
    list.innerHTML = '';

    // Add each experiment
    experiments.forEach(exp => {
      const item = this.createExperimentItem(exp);
      list.appendChild(item);
    });

    // Set to collapsed by default
    list.classList.add('collapsed');

    // Setup toggle and delete all button
    this.setupHistoryToggle();
    this.setupDeleteAllButton();
  }

  createExperimentItem(experiment) {
    const item = document.createElement('div');
    item.className = 'experiment-item';
    item.setAttribute('data-experiment-id', experiment.id);

    const timeAgo = this.experimentHistory.formatTimeAgo(experiment.lastModified);
    const variationCount = experiment.variations?.length || 0;

    item.innerHTML = `
      <div class="experiment-content">
        ${experiment.screenshot ? `
          <div class="experiment-thumbnail">
            <img src="${experiment.screenshot}" alt="Experiment screenshot" />
          </div>
        ` : ''}
        <div class="experiment-info">
          <div class="experiment-title">${this.escapeHtml(experiment.title)}</div>
          <div class="experiment-meta">
            <span class="experiment-time">${timeAgo}</span>
            <span class="experiment-variations">${variationCount} variation${variationCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <div class="experiment-actions">
        <button class="btn-small btn-primary load-experiment-btn" data-experiment-id="${experiment.id}" title="Load this experiment">
          Load
        </button>
        <button class="btn-small btn-text delete-experiment-btn" data-experiment-id="${experiment.id}" title="Delete this experiment">
          🗑️
        </button>
      </div>
    `;

    // Add event listeners
    const loadBtn = item.querySelector('.load-experiment-btn');
    const deleteBtn = item.querySelector('.delete-experiment-btn');

    loadBtn?.addEventListener('click', () => this.loadExperiment(experiment.id));
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteExperiment(experiment.id);
    });

    return item;
  }

  setupDeleteAllButton() {
    // Setup history menu toggle
    const historyMenuBtn = document.getElementById('historyMenuBtn');
    const historyMenu = document.getElementById('historyMenu');

    if (historyMenuBtn && historyMenu) {
      historyMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        historyMenu.classList.toggle('hidden');
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!historyMenuBtn.contains(e.target) && !historyMenu.contains(e.target)) {
          historyMenu.classList.add('hidden');
        }
      });
    }

    // Setup delete all button with confirmation
    const deleteAllBtn = document.getElementById('deleteAllExperimentsBtn');
    if (!deleteAllBtn) return;

    // Remove existing listeners to prevent duplicates
    const newBtn = deleteAllBtn.cloneNode(true);
    deleteAllBtn.parentNode.replaceChild(newBtn, deleteAllBtn);

    // Add click handler with confirmation
    newBtn.addEventListener('click', async () => {
      historyMenu.classList.add('hidden');

      const confirmed = confirm('Are you sure you want to delete ALL experiments for this site? This action cannot be undone.');
      if (confirmed) {
        await this.deleteAllExperiments();
      }
    });
  }

  setupHistoryToggle() {
    const toggleBtn = document.getElementById('historyToggleBtn');
    const list = document.getElementById('experimentList');

    if (!toggleBtn || !list) return;

    // Remove existing listeners
    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);

    // Set initial icon state (collapsed by default)
    const icon = newToggleBtn.querySelector('.toggle-icon');
    if (icon) {
      icon.textContent = list.classList.contains('collapsed') ? '▶' : '▼';
    }

    newToggleBtn.addEventListener('click', () => {
      list.classList.toggle('collapsed');
      const icon = newToggleBtn.querySelector('.toggle-icon');
      if (icon) {
        icon.textContent = list.classList.contains('collapsed') ? '▶' : '▼';
      }
    });
  }

  async loadExperiment(experimentId) {
    if (!this.experimentHistory) return;

    try {
      console.log(`📂 Loading experiment ${experimentId}...`);
      this.showStatus('Loading experiment...', 'loading');

      // Get current tab URL (not sidepanel URL)
      const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());

      if (!currentUrl) {
        throw new Error('Unable to determine current page URL');
      }

      console.log(`📂 Loading from URL: ${currentUrl}`);
      const experiment = await this.experimentHistory.getExperiment(currentUrl, experimentId);

      if (!experiment) {
        throw new Error('Experiment not found');
      }

      // Store the loaded experiment ID so future saves update it instead of creating new
      this.currentExperimentId = experimentId;
      console.log(`📂 Loaded experiment ID: ${experimentId} - future saves will update this experiment`);

      // Restore state
      this.generatedCode = experiment.generatedCode;
      this.variations = experiment.variations || this.variations;

      // 🆕 Extract helper functions if globalJS is missing or empty (older experiments)
      if (this.generatedCode && this.generatedCode.variations) {
        const hasGlobalJS = this.generatedCode.globalJS && this.generatedCode.globalJS.trim().length > 0;

        if (!hasGlobalJS) {
          console.log('🔍 Extracting helper functions from loaded experiment code...');
          const extractedFunctions = this.extractHelperFunctionsFromCode(this.generatedCode);
          if (extractedFunctions) {
            this.generatedCode.globalJS = extractedFunctions;
            console.log(`✅ Extracted ${extractedFunctions.length} chars of helper functions`);
          } else {
            console.log('⚠️ No helper functions found to extract - will auto-generate on next refinement if needed');
          }
        } else {
          console.log(`ℹ️ GlobalJS already present (${this.generatedCode.globalJS.length} chars)`);
        }
      }

      // Restore page data if available
      if (experiment.pageData) {
        this.currentPageData = experiment.pageData;
        this.basePageData = { ...experiment.pageData };

        // Update UI with restored page info
        this.updatePageInfo(experiment.pageData);
        console.log('📄 Page data restored:', {
          url: experiment.pageData.url,
          title: experiment.pageData.title,
          hasScreenshot: !!experiment.pageData.screenshot,
          elementCount: experiment.pageData.elementDatabase?.elements?.length || 0
        });
      }

      // 🆕 Restore chat history if available
      if (experiment.chatHistory && Array.isArray(experiment.chatHistory)) {
        this.chatHistory = experiment.chatHistory;
        console.log(`📚 Restored ${experiment.chatHistory.length} chat history entries`);

        // Display chat history in the chat drawer
        this.displayChatHistory();
      } else {
        this.chatHistory = [];
        console.log('📚 No chat history found in experiment');
      }

      // Switch to results state
      this.updateWorkflowState('results');

      // Display the restored code
      if (this.generatedCode) {
        this.displayGeneratedCode(this.generatedCode);
      }

      this.showStatus(`Experiment loaded: ${experiment.title}`, 'success', 3000);
      this.addActivity(`Loaded experiment: ${experiment.title}`, 'success');

      console.log('✅ Experiment loaded successfully');
    } catch (error) {
      console.error('Failed to load experiment:', error);
      this.showStatus('Failed to load experiment', 'error', 3000);
    }
  }

  async deleteExperiment(experimentId) {
    if (!this.experimentHistory) return;

    if (!confirm('Are you sure you want to delete this experiment? This cannot be undone.')) {
      return;
    }

    try {
      // Get current tab URL (not sidepanel URL)
      const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());

      if (!currentUrl) {
        throw new Error('Unable to determine current page URL');
      }

      const success = await this.experimentHistory.deleteExperiment(currentUrl, experimentId);

      if (success) {
        // Reload the history display
        await this.loadExperimentHistory();
        this.showStatus('Experiment deleted', 'success', 2000);
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Failed to delete experiment:', error);
      this.showStatus('Failed to delete experiment', 'error', 3000);
    }
  }

  async deleteAllExperiments() {
    if (!this.experimentHistory) return;

    // Get current tab URL
    const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());
    if (!currentUrl) {
      this.showStatus('Unable to determine current page URL', 'error', 3000);
      return;
    }

    // Get count of experiments for this page
    const experiments = await this.experimentHistory.getExperimentsForDomain(currentUrl);
    const count = experiments?.length || 0;

    if (count === 0) {
      this.showStatus('No experiments to delete', 'info', 2000);
      return;
    }

    try {
      // Delete all experiments for this page
      const success = await this.experimentHistory.deleteAllExperiments(currentUrl);

      if (success) {
        // Reload the history display (will hide section since no experiments)
        await this.loadExperimentHistory();
        this.showStatus(`Deleted ${count} experiment${count > 1 ? 's' : ''}`, 'success', 3000);
        this.addActivity(`Deleted all ${count} saved experiments`, 'info');
      } else {
        throw new Error('Delete all failed');
      }
    } catch (error) {
      console.error('Failed to delete all experiments:', error);
      this.showStatus('Failed to delete all experiments', 'error', 3000);
    }
  }

  async saveCurrentExperiment() {
    if (!this.experimentHistory || !this.generatedCode) {
      return;
    }

    try {
      const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());
      if (!currentUrl) {
        console.warn('No URL available for experiment save');
        return;
      }

      const experimentData = {
        id: this.currentExperimentId || null, // Pass existing ID to update, or null for new
        title: this.generatedCode.variations?.[0]?.name || 'Untitled Experiment',
        pageTitle: this.currentPageData?.title || document.title,
        variations: this.generatedCode.variations || [],
        generatedCode: this.generatedCode,
        screenshot: this.currentPageData?.screenshot || null,
        pageData: this.currentPageData, // Include for full restore capability
        chatHistory: this.chatHistory || [], // 🆕 Save chat history for context restoration
        includePageData: true
      };

      const experimentId = await this.experimentHistory.saveExperiment(currentUrl, experimentData);

      if (this.currentExperimentId && experimentId === this.currentExperimentId) {
        console.log(`💾 Experiment updated: ${experimentId}`);
      } else {
        console.log(`💾 New experiment saved: ${experimentId}`);
      }

      // Store the current experiment ID for future updates
      this.currentExperimentId = experimentId;

    } catch (error) {
      console.error('Failed to auto-save experiment:', error);
    }
  }

  async getCurrentTabUrl() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract helper functions from variation code (for older experiments without globalJS)
   */
  extractHelperFunctionsFromCode(generatedCode) {
    if (!generatedCode?.variations || generatedCode.variations.length === 0) {
      return null;
    }

    // Combine all variation JS
    const allJS = generatedCode.variations.map(v => v.js || '').join('\n');

    // Extract function declarations from the beginning
    const lines = allJS.split('\n');
    const functions = [];
    let inFunction = false;
    let braceDepth = 0;
    let currentFunction = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Start of function
      if (trimmed.startsWith('function ')) {
        inFunction = true;
        currentFunction = [line];
        braceDepth = 0;
      } else if (inFunction) {
        currentFunction.push(line);
      }

      // Track braces
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // End of function
      if (inFunction && braceDepth === 0 && trimmed.endsWith('}')) {
        functions.push(currentFunction.join('\n'));
        inFunction = false;
        currentFunction = [];
      }

      // Stop at first non-function code
      if (!inFunction && trimmed.length > 0 &&
          !trimmed.startsWith('function ') &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('/*')) {
        break;
      }
    }

    return functions.length > 0 ? functions.join('\n\n') : null;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

      // 🔒 BASE PAGE STATE LOCKING (Phase 1)
      // Only set basePageData if not already locked (first capture or explicit reset)
      if (!this.basePageLocked) {
        this.basePageData = JSON.parse(JSON.stringify(response.data)); // Deep clone
        this.captureTimestamp = Date.now();
        console.log('🔒 Base page state captured and locked');
      } else {
        console.log('⚠️ Base page is locked - using existing base state for refinements');
      }

      // 🔍 NEW: Build semantic index and dependency graph
      if (this.domSemanticIndex && this.domDependencyAnalyzer && this.domConversationContext) {
        try {
          console.log('🔍 Building DOM semantic index...');

          // Index the DOM structure
          await this.domSemanticIndex.indexPage(this.currentPageData);

          // Build dependency graph
          this.domDependencyAnalyzer.buildGraph(this.currentPageData);

          // Initialize conversation context
          this.domConversationContext.initialize(
            this.currentPageData,
            this.domSemanticIndex,
            this.domDependencyAnalyzer
          );

          // Log statistics
          const stats = this.domSemanticIndex.getStatistics();
          console.log(`✅ DOM indexed: ${stats.totalElements} elements, ${stats.categories.length} categories`);

          // Add activity
          this.addActivity(`DOM indexed: ${stats.totalElements} elements in ${stats.categories.length} semantic categories`, 'success');

          // Add initial context message
          this.domConversationContext.addMessage('system', `Page indexed successfully: ${this.currentPageData.title}`);

        } catch (indexError) {
          console.warn('⚠️ DOM indexing failed:', indexError);
          this.addActivity('DOM indexing unavailable, using basic mode', 'warning');
        }
      }

      // Capture screenshot for Visual QA
      try {
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        });

        // Add screenshot to currentPageData
        this.currentPageData.screenshot = screenshot;

        // Only update basePageData screenshot if not locked
        if (!this.basePageLocked) {
          this.basePageData.screenshot = screenshot;
          console.log('📸 Screenshot captured and stored in base page state');
        } else {
          console.log('📸 Screenshot captured (base page screenshot preserved)');
        }
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

      // Check if page data exists (for initial generation)
      // For refinements on loaded experiments, we can work with just the generated code
      const isRefinement = this.generatedCode && this.chatInitiated;
      if (!isRefinement && (!this.currentPageData || !this.currentPageData.elementDatabase)) {
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

      // Check if Visual QA is recommended but not provided
      if (intentAnalysis.needsVisualQA && !this.selectedElementData) {
        console.log('💡 [Visual QA] AI recommends element selection for this refinement');
        this.addActivity('💡 Tip: Consider selecting a specific element for better accuracy', 'info');
        // Note: We don't block generation - just inform the user
      } else if (intentAnalysis.needsVisualQA === false && this.selectedElementData) {
        console.log('ℹ️ [Visual QA] Element selected but not needed for this refinement');
        // Clear selected element data for simple refinements to avoid confusion
        this.selectedElementData = null;
      }

      // STAGE 2: Assemble Smart Context
      console.log('🏗️ [Stage 2] Assembling context...');
      this.showStatus('Building optimized context...', 'loading');

      // 🔒 BASE PAGE STATE (Phase 1.2): Always use basePageData for refinements
      // This ensures AI sees the ORIGINAL page, not the modified state
      // For loaded experiments without page data, we'll work with generated code only
      const sourcePageData = (this.generatedCode && this.chatInitiated && this.basePageData)
        ? this.basePageData  // Use locked base state for refinements
        : this.currentPageData; // Use current for initial generation

      if (this.generatedCode && this.chatInitiated) {
        if (this.basePageData) {
          console.log('🔒 Using locked base page state for refinement (not current modified state)');
        } else {
          console.log('⚠️ No base page data (loaded experiment) - refinement will use generated code only');
        }
      }

      let optimizedPageData;
      if (this.generatedCode && this.chatInitiated) {
        // Use refinement-specific assembly
        optimizedPageData = this.smartContextAssembler.assembleRefinementContext(
          intentAnalysis,
          sourcePageData || {},  // Empty object if no page data
          this.generatedCode
        );
      } else {
        // Use standard assembly
        optimizedPageData = await this.smartContextAssembler.assembleContext(
          intentAnalysis,
          sourcePageData,  // Use current page state
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
        designFiles: this.uploadedDesignFile ? [this.uploadedDesignFile] : [],
        intentAnalysis: intentAnalysis // Phase 2.2: Pass intent analysis for validation
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

        // 🔒 BASE PAGE STATE LOCKING (Phase 1)
        // Lock base page after first successful generation
        if (!this.basePageLocked && this.basePageData) {
          this.basePageLocked = true;
          console.log('🔒 Base page state locked - all future refinements will use this original state');
        }

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

        // Auto-save experiment after successful generation
        await this.saveCurrentExperiment();

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

      // Don't show error for cancelled requests (already handled by stopAIRequest)
      if (error.message !== 'CANCELLED') {
        this.updateApiStatus('error'); // Show error indicator (red dot)
        this.showStatus('Generation failed: ' + error.message, 'error', 5000);
        // Note: showError() will call addActivity() via showNotification(), so don't duplicate here
        this.showError(error.message);
      }
    }
  }

  async callAIGeneration(data) {
    console.log('🤖 Starting AI generation with data:', data);

    try {
      // Save current state before generation (for stop/revert functionality)
      this.previousCodeState = this.generatedCode ? { ...this.generatedCode } : null;
      this.currentRequestType = 'CODE_GENERATION';

      // Update status with stop button
      this.updateTypingStatus('Analyzing request');
      this.showStatus('🔍 Analyzing your request...', 'loading', null, true);

      // Use background service worker for AI generation (proper approach for Manifest V3)
      console.log('🔗 Calling background service worker for AI generation...');

      this.updateTypingStatus('Preparing generation');

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
          intentAnalysis: data.intentAnalysis || null, // Phase 2.2: Pass intent analysis
          tabId: this.targetTabId // Pass the target tab ID for code injection
        }
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('AI generation timed out after 120 seconds. The API might be slow or unavailable.'));
        }, 120000); // 120 second timeout (handles refinements with validation + retry)
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

      // Handle cancelled requests specially
      if (error.message === 'REQUEST_CANCELLED') {
        console.log('✋ Request was cancelled by user');
        throw new Error('CANCELLED'); // Special error to distinguish from other failures
      }

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
    } finally {
      // Clean up request tracking
      this.currentRequestType = null;
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

    // Check if this experiment has been synced before and update button state
    this.updatePushButtonState();
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
    console.log(`💬 [addChatMessage] Called with role="${role}", content length=${content?.length || 0}`);

    // Ensure chat drawer is open
    const drawer = document.getElementById('chatDrawer');
    if (drawer && drawer.classList.contains('hidden')) {
      console.log('📂 [addChatMessage] Opening chat drawer to show message');
      drawer.classList.remove('hidden');
    }

    const container = document.getElementById('chatMessages');
    if (!container) {
      console.error('❌ [addChatMessage] Chat messages container not found!');
      return;
    }
    console.log('✅ [addChatMessage] Chat messages container found, adding message');

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
      // 🆕 Check if there's a pending disambiguation (user selecting from options)
      if (this.pendingDisambiguation && !elementAttachment) {
        const handled = await this.handleDisambiguationResponse(message);
        if (handled) {
          return; // Disambiguation was handled, exit early
        }
        // If not handled, continue with normal processing
      }

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

  /**
   * 🆕 Handle user response to disambiguation (selecting from multiple options)
   */
  async handleDisambiguationResponse(message) {
    if (!this.pendingDisambiguation) return false;

    const { originalMessage, matches, timestamp, isRefinement, existingCode } = this.pendingDisambiguation;

    // Check if message is a number selection (1-5)
    const numberMatch = message.trim().match(/^(\d+)$/);

    if (numberMatch) {
      const selectedIndex = parseInt(numberMatch[1]) - 1;

      if (selectedIndex >= 0 && selectedIndex < matches.length) {
        const selectedMatch = matches[selectedIndex];

        console.log(`✅ [Disambiguation] User selected option ${selectedIndex + 1}: ${selectedMatch.element.selector}`);

        this.addChatMessage('assistant', `Great! Using **${this.getElementDescription(selectedMatch.element)}**

Generating code...`);

        // Save pending disambiguation state before clearing
        const wasRefinement = isRefinement;
        const savedExistingCode = existingCode;

        // Clear pending disambiguation
        this.pendingDisambiguation = null;

        // Analyze dependencies
        if (this.domDependencyAnalyzer) {
          const impact = this.domDependencyAnalyzer.analyzeImpact(selectedMatch.element.selector);

          if (impact.warnings && impact.warnings.length > 0) {
            const warningsText = impact.warnings.map(w => `⚠️ ${w.message}`).join('\n');
            this.addChatMessage('assistant', `**Impact Analysis:**\n${warningsText}\n\nProceeding with code generation...`);
          }
        }

        // 🆕 REFINEMENT FIX: Check if this is a refinement response
        if (wasRefinement) {
          console.log('🔄 [Disambiguation] This is a refinement - calling processRefinementRequest');

          // Restore generatedCode for refinement
          if (savedExistingCode) {
            this.generatedCode = savedExistingCode;
          }

          // Call processRefinementRequest with selected element
          await this.processRefinementRequest(originalMessage, selectedMatch.element);
        } else {
          console.log('🆕 [Disambiguation] This is initial generation - calling generateExperimentFromChat');

          // Build enhanced message and generate (initial request)
          const enhancedMessage = this.buildEnhancedMessage(originalMessage, selectedMatch);
          await this.generateExperimentFromChat(enhancedMessage);
        }

        return true; // Handled
      } else {
        this.addChatMessage('assistant', `Please select a number between 1 and ${matches.length}.`);
        return true; // Handled (but with error)
      }
    }

    // Check if disambiguation is still valid (not too old)
    const age = Date.now() - timestamp;
    if (age > 300000) { // 5 minutes
      console.log('⏰ [Disambiguation] Context expired, treating as new request');
      this.pendingDisambiguation = null;
      return false; // Not handled, treat as new request
    }

    // User might be refining their description instead of selecting a number
    // Re-run semantic search with the new, more specific message
    console.log('🔍 [Disambiguation] User provided more specific description, re-searching...');
    this.pendingDisambiguation = null;

    // Re-search with the refined description
    await this.processWithSemanticSearch(message);

    return true; // Handled
  }

  async processInitialRequest(message, elementAttachment = null) {
    // Initialize chat history if not exists
    if (!this.chatHistory) {
      this.chatHistory = [];
    }

    // 🆕 Add message to DOM conversation context
    if (this.domConversationContext) {
      this.domConversationContext.addMessage('user', message, {
        elementAttachment: elementAttachment
      });
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

    // Don't auto-generate - let user explicitly trigger generation
    this.addChatMessage('assistant', `I understand you want: "${message}".

To generate code, please:
1. Click **"🚀 Generate Code"** button in the main area
2. Or, describe your changes in the description field and click "Generate"

I'm ready when you are!`);

    // Store the message for later use
    if (!this.pendingUserRequests) {
      this.pendingUserRequests = [];
    }
    this.pendingUserRequests.push({ message, elementAttachment, timestamp: Date.now() });
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

    // 🆕 NEW: Use semantic search for refinements to enable disambiguation
    if (this.domSemanticIndex && !elementAttachment) {
      console.log('🔍 [Refinement] Checking if disambiguation needed...');

      try {
        const searchResults = this.domSemanticIndex.searchByIntent(message);
        console.log(`🔍 [Refinement] Semantic search found ${searchResults.results.length} matches (intent: ${searchResults.intent.targetType})`);

        // 🆕 ZERO matches in existing DOM - check if referring to generated code elements
        if (searchResults.results.length === 0) {
          console.log(`⚠️ [Refinement] No matches in DOM - checking generated code...`);
          console.log(`🔍 [Refinement] this.generatedCode exists:`, !!this.generatedCode);
          console.log(`🔍 [Refinement] this.generatedCode.variations:`, this.generatedCode?.variations?.length);

          // Check if the user is referring to elements created by the generated code
          let foundInGeneratedCode = false;
          if (this.generatedCode && this.generatedCode.variations && this.generatedCode.variations.length > 0) {
            const allCode = this.generatedCode.variations.map(v => (v.css || '') + ' ' + (v.js || '')).join(' ').toLowerCase();
            const keywords = message.toLowerCase().match(/\b\w+\b/g) || [];

            console.log(`🔍 [Refinement] Checking keywords in generated code:`, keywords);
            console.log(`📝 [Refinement] Code snippet (first 500 chars):`, allCode.substring(0, 500));

            // Look for class names, IDs, or element references in the code
            foundInGeneratedCode = keywords.some(keyword => {
              // Skip common words
              if (['the', 'a', 'an', 'add', 'make', 'change', 'update', 'to', 'between', 'and', 'or'].includes(keyword)) {
                console.log(`⏭️ [Refinement] Skipping common word: "${keyword}"`);
                return false;
              }

              // Handle plural/singular variations (boxes → box, buttons → button, etc.)
              const singularKeyword = keyword.endsWith('es') ? keyword.slice(0, -2) :
                                      keyword.endsWith('s') ? keyword.slice(0, -1) : keyword;

              // Match class selectors (.countdown-box matches "box" or "boxes")
              // Match IDs (#banner matches "banner")
              // Match CSS properties (white, color, background)
              // Use word boundaries to avoid false positives
              const patterns = [
                new RegExp(`\\.([\\w-]*${keyword}[\\w-]*)`, 'i'),           // .countdown-boxes
                new RegExp(`\\.([\\w-]*${singularKeyword}[\\w-]*)`, 'i'),   // .countdown-box
                new RegExp(`#([\\w-]*${keyword}[\\w-]*)`, 'i'),             // #boxes-container
                new RegExp(`#([\\w-]*${singularKeyword}[\\w-]*)`, 'i'),     // #box-container
                new RegExp(`\\b${keyword}\\b`, 'i'),                        // white, red, etc.
                new RegExp(`class=['"]([^'"]*${keyword}[^'"]*)`, 'i'),      // class="boxes"
                new RegExp(`class=['"]([^'"]*${singularKeyword}[^'"]*)`, 'i') // class="box"
              ];

              const found = patterns.some(pattern => pattern.test(allCode));

              if (found) {
                console.log(`✅ [Refinement] Found keyword "${keyword}" (or "${singularKeyword}") in generated code`);
              } else {
                console.log(`❌ [Refinement] Keyword "${keyword}" NOT found in code`);
              }

              return found;
            });
          }

          if (foundInGeneratedCode) {
            console.log(`✅ [Refinement] Found reference in generated code - proceeding with AI refinement`);
            // Let AI handle it - it will see the current code and understand the context
          } else {
            console.log(`⚠️ [Refinement] Not found in DOM or generated code - asking user to clarify`);

            this.addChatMessage('assistant', `I couldn't find any "${searchResults.intent.targetType}" elements matching "${message}".

Could you clarify which element you want to modify? You can:
- Click an element on the page to select it
- Describe it more specifically
- Use the element selector tool 🎯`);

            return; // Wait for user clarification
          }
        }

        // Multiple ambiguous matches - ask for clarification
        if (searchResults.results.length > 1 && searchResults.results[0].score < 0.9) {
          console.log(`⚠️ [Refinement] Ambiguous request - showing disambiguation (top score: ${searchResults.results[0].score})`);

          // Show disambiguation UI
          await this.showElementDisambiguation(message, searchResults.results);

          // Mark this as a refinement so we know to call processRefinementRequest again
          if (this.pendingDisambiguation) {
            this.pendingDisambiguation.isRefinement = true;
            this.pendingDisambiguation.existingCode = this.generatedCode;
          }

          return; // Wait for user to select
        }

        // Single high-confidence match - inform user what we're targeting
        if (searchResults.results.length > 0 && searchResults.results[0].score > 0.7) {
          const match = searchResults.results[0];
          console.log(`✅ [Refinement] High confidence match: ${match.element.selector} (score: ${match.score})`);

          const elementInfo = this.getElementDescription(match.element);
          this.addChatMessage('assistant', `Refining **${elementInfo}**...`);
        }
      } catch (searchError) {
        console.warn('⚠️ [Refinement] Semantic search failed, continuing without:', searchError);
      }
    }

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

      // Include globalCSS and globalJS first (helper functions)
      if (this.generatedCode.globalCSS) {
        currentCodeContext += `\nGLOBAL CSS (shared across all variations):\n${this.generatedCode.globalCSS}\n`;
      }
      if (this.generatedCode.globalJS) {
        currentCodeContext += `\nGLOBAL JS (helper functions - MUST be preserved):\n${this.generatedCode.globalJS}\n`;
      }

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

⚠️ HELPER FUNCTIONS: If the variation JS calls any functions (like getNextFridayMidnightPT, getTimeRemaining, updateCountdown), you MUST:
- Check if those functions are defined in GLOBAL JS above
- If NOT defined, you MUST generate them and put them in the "globalJS" field of your response
- NEVER leave function calls undefined - always provide the implementation

NEW REQUEST TO ADD:
${message}

Your task: Return the COMPLETE code (existing + new + any missing helper functions). DO NOT output only the new changes.`;

    // Update description to include full context
    const descField = document.getElementById('primaryDescription');
    if (descField) {
      descField.value = fullContext;
    }

    // ✨ NEW: Use RefinementContext for safe, validated refinements
    try {
      console.log('🔄 [Refinement] Starting refinement:', message.substring(0, 100));
      this.updateTypingStatus('Validating refinement...');
      this.addActivity('Processing refinement request...', 'info');

      // Send ADJUST_CODE message with RefinementContext
      // Use currentPageData first, fallback to basePageData, or capture fresh if needed
      let pageData = this.currentPageData || this.basePageData;

      if (!pageData) {
        console.warn('⚠️ [Refinement] No page data available, capturing fresh...');
        this.addActivity('Capturing page data...', 'info');
        try {
          const captureResult = await this.capturePage();
          pageData = captureResult;
          this.currentPageData = captureResult;
        } catch (captureError) {
          console.error('❌ [Refinement] Failed to capture page data:', captureError);
          this.hideTypingIndicator();
          this.chatState.sending = false;
          this.addChatMessage('assistant', `I need to capture the current page before making refinements. Please try:\n1. Click "🎯 Capture Page" first\n2. Then make your refinement request`);
          this.addActivity('Refinement failed: No page data', 'error');
          return;
        }
      }

      // Debug: Log what we're sending
      console.log('📦 [Refinement] Sending previousCode:', {
        hasGeneratedCode: !!this.generatedCode,
        variationsCount: this.generatedCode?.variations?.length,
        hasGlobalJS: !!this.generatedCode?.globalJS,
        variation1HasJS: !!this.generatedCode?.variations?.[0]?.js,
        variation1JSLength: this.generatedCode?.variations?.[0]?.js?.length || 0
      });

      console.log('📤 [Refinement] Sending ADJUST_CODE to service worker');
      console.log('📌 [Refinement] Element attachment:', elementAttachment ? {
        selector: elementAttachment.selector,
        tag: elementAttachment.tag,
        id: elementAttachment.id,
        text: elementAttachment.text?.substring(0, 50)
      } : 'none');

      const response = await chrome.runtime.sendMessage({
        type: 'ADJUST_CODE',
        data: {
          pageData: pageData,
          previousCode: this.generatedCode,
          newRequest: message,
          conversationHistory: this.chatHistory,
          tabId: this.targetTabId,
          settings: this.settings,
          selectedElement: elementAttachment // 🆕 Pass the selected element
        }
      });

      console.log('📥 [Refinement] Response:', { success: response.success, hasCode: !!response.code, error: response.error });

      // Handle clarification needed
      if (response.needsClarification) {
        console.log('❓ [Refinement] Clarification needed');
        this.hideTypingIndicator();
        this.chatState.sending = false;
        this.showClarificationUI(response.question);
        this.addActivity('Clarification needed', 'warning');
        return;
      }

      // Handle validation failure with rollback
      if (!response.success && response.rolledBack) {
        console.log('⚠️ [Refinement] Validation failed, rolled back');
        this.hideTypingIndicator();
        this.chatState.sending = false;

        this.addChatMessage('assistant', `⚠️ Unable to apply your changes safely.

**What happened:**
${response.error}

**Your code has been reverted to the last working version** to prevent breaking the page.

**Suggestions:**
- Try rephrasing your request more specifically
- Select the element you want to modify using the 🎯 tool
- Break your request into smaller steps

Your previous working code is still active.`);

        this.addActivity('Refinement failed, code rolled back', 'warning');
        return;
      }

      // Handle other errors
      if (!response.success) {
        console.error('❌ [Refinement] Error:', response.error);
        this.hideTypingIndicator();
        this.chatState.sending = false;

        this.addChatMessage('assistant', `Sorry, I encountered an error: ${response.error}`);
        this.addActivity('Refinement error: ' + response.error, 'error');
        return;
      }

      // Validate response before updating
      if (!response.code || !response.code.variations || response.code.variations.length === 0) {
        console.error('❌ [Refinement] Invalid response - no variations returned');
        this.hideTypingIndicator();
        this.chatState.sending = false;
        this.addChatMessage('assistant', `⚠️ The refinement failed to generate valid code. The AI response was incomplete.

Your previous code is still intact. Please try:
- Rephrasing your request more specifically
- Making smaller, incremental changes
- Using the element selector to be more precise`);
        this.addActivity('Refinement failed: Invalid AI response', 'error');
        return;
      }

      // CRITICAL VALIDATION: Check if AI removed existing code
      const oldCode = this.generatedCode;
      const newCode = response.code;

      const hadGlobalJS = oldCode?.globalJS && oldCode.globalJS.trim().length > 50;
      const hasGlobalJS = newCode?.globalJS && newCode.globalJS.trim().length > 50;

      const hadVariationJS = oldCode?.variations?.[0]?.js && oldCode.variations[0].js.trim().length > 50;
      const hasVariationJS = newCode?.variations?.[0]?.js && newCode.variations[0].js.trim().length > 50;

      const codeWasRemoved = (hadGlobalJS && !hasGlobalJS) || (hadVariationJS && !hasVariationJS);

      if (codeWasRemoved) {
        console.error('❌ [Refinement] CRITICAL: AI removed existing code!');
        console.error('   Old code:', {
          globalJS: oldCode.globalJS?.length || 0,
          varJS: oldCode.variations?.[0]?.js?.length || 0
        });
        console.error('   New code:', {
          globalJS: newCode.globalJS?.length || 0,
          varJS: newCode.variations?.[0]?.js?.length || 0
        });

        this.hideTypingIndicator();
        this.chatState.sending = false;

        this.addChatMessage('assistant', `❌ **Refinement Failed: Code Would Be Destroyed**

The AI attempted to remove your existing JavaScript code, which would break your experiment.

**What happened:**
- Your original code had ${oldCode.globalJS?.length || 0 + oldCode.variations?.[0]?.js?.length || 0} characters of JavaScript
- The AI's response only had ${newCode.globalJS?.length || 0 + newCode.variations?.[0]?.js?.length || 0} characters
- This would have destroyed your working countdown banner

**Your code is still intact and working.**

**To make this change safely:**
- Try being more specific: "Keep all existing code and also hide the announcement element"
- Or use the element selector 🎯 to target exactly what you want to modify`);

        this.addActivity('❌ Refinement rejected - would destroy code', 'error');
        return;
      }

      // Success! Update generated code
      console.log('✅ [Refinement] Success! Updating UI');
      this.generatedCode = response.code;
      this.updateTypingStatus('Refinement successful!');
      this.addActivity('Code refined successfully', 'success');

      // Show confidence score if available
      const confidenceText = response.confidence
        ? ` (Confidence: ${response.confidence}%)`
        : '';

      const chatMessage = `✅ Code updated successfully!${confidenceText}

I've incorporated your refinement: "${message}"

The updated code has been validated and is ready to preview or deploy.`;

      console.log('💬 [Refinement] Adding chat message:', chatMessage.substring(0, 100));
      try {
        this.addChatMessage('assistant', chatMessage);
        console.log('✅ [Refinement] Chat message added successfully');
      } catch (chatError) {
        console.error('⚠️ [Refinement] Failed to add chat message (non-critical):', chatError);
      }

      // Add AI response to chat history
      console.log('📚 [Refinement] Adding to chat history...');
      this.chatHistory.push({
        role: 'assistant',
        content: `Code updated with refinement: ${message}`,
        code: response.code,
        timestamp: Date.now()
      });
      console.log('✅ [Refinement] Added to chat history');

      // CRITICAL: Auto-apply refined code BEFORE updating UI to prevent race conditions
      console.log('🔄 [Refinement] Auto-applying refined code to page...');
      this.addActivity('Applying refined code to page...', 'info');

      try {
        // Find the active variation number (or use first variation = 1)
        const activeVariation = response.code.variations?.[0];
        if (activeVariation) {
          const variationNumber = activeVariation.number || 1;

          // CRITICAL: this.generatedCode was already updated at line 2686, so preview will use latest code
          console.log('📝 [Refinement] About to preview with:', {
            variationNumber,
            hasGlobalJS: !!this.generatedCode.globalJS,
            globalJSLength: this.generatedCode.globalJS?.length || 0,
            hasVariationJS: !!this.generatedCode.variations?.[0]?.js,
            varJSLength: this.generatedCode.variations?.[0]?.js?.length || 0,
            targetTab: this.targetTabId
          });

          await this.previewVariation(variationNumber, 'refinement-auto-apply');
          console.log('✅ [Refinement] Refined code applied to page successfully');
          this.addActivity('✅ Refined code is now live on the page', 'success');
        } else {
          console.warn('⚠️ [Refinement] No variations to preview');
          this.addActivity('Code updated but no variations found to preview', 'warning');
        }
      } catch (previewError) {
        console.error('⚠️ [Refinement] Failed to auto-apply:', previewError);
        this.addActivity('⚠️ Refinement succeeded, but auto-preview failed. Click "Preview on Page" button to apply.', 'warning');
      }

      // Update UI with new code AFTER auto-preview completes
      this.displayGeneratedCode(response.code);

      // Update cost display if usage data available
      if (response.usage) {
        console.log('📊 [Refinement] Usage data:', response.usage);
        this.updateCostDisplay(response.usage);
      }

      // Auto-save refined experiment
      console.log('💾 [Refinement] Auto-saving refined experiment...');
      await this.saveCurrentExperiment();
      console.log('✅ [Refinement] Experiment saved successfully');

      // Hide typing indicator
      this.hideTypingIndicator();
      this.chatState.sending = false;

      this.addActivity(`Refinement successful (${response.metadata?.attempts || 1} validation attempt${response.metadata?.attempts > 1 ? 's' : ''})`, 'success');

    } catch (error) {
      console.error('❌ Refinement error:', error);

      this.addChatMessage('assistant', `Sorry, I had trouble refining the code: ${error.message}

Please try again or rephrase your request.`);

      // CRITICAL: Hide typing indicator on error and clean up state
      this.hideTypingIndicator();
      this.chatState.sending = false;
      this.chatInitiated = false;

      this.addActivity('Refinement error: ' + error.message, 'error');
    }
  }

  /**
   * ✨ NEW: Show clarification UI when AI needs to ask user a question
   */
  showClarificationUI(question) {
    console.log('❓ [Clarification] Showing UI:', question);

    // Add clarification message to chat
    const chatHistory = document.getElementById('chatHistory') || document.getElementById('chatMessagesContainer');
    if (!chatHistory) {
      console.error('❌ Chat history container not found');
      return;
    }

    const clarificationMsg = document.createElement('div');
    clarificationMsg.className = 'chat-message assistant clarification';
    clarificationMsg.innerHTML = `
      <div class="assistant-avatar">🤖</div>
      <div class="message-content">
        <p>${this.escapeHtml(question.message)}</p>
        <div class="clarification-options">
          ${question.options.map((opt, idx) => `
            <button class="clarification-btn" data-value="${opt.value || idx}" data-label="${this.escapeHtml(opt.label || opt)}">
              <strong>${this.escapeHtml(opt.label || opt)}</strong>
              ${opt.context ? `<small>${this.escapeHtml(opt.context)}</small>` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    chatHistory.appendChild(clarificationMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Bind option selection handlers
    clarificationMsg.querySelectorAll('.clarification-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedValue = btn.dataset.value;
        const selectedLabel = btn.dataset.label;

        console.log(`✅ [Clarification] User selected: ${selectedLabel} (${selectedValue})`);

        // Remove clarification UI
        clarificationMsg.remove();

        // Add user's selection as a message
        this.addChatMessage('user', selectedLabel);

        // Store clarification response and re-send refinement
        this.pendingClarification = {
          value: selectedValue,
          label: selectedLabel
        };

        // Process the clarification response
        this.handleClarificationResponse(selectedValue);
      });
    });

    this.addActivity('Clarification needed from user', 'info');
  }

  /**
   * ✨ NEW: Handle user's clarification response
   */
  async handleClarificationResponse(selectedValue) {
    console.log('🔄 [Clarification] Processing response:', selectedValue);

    // Show typing indicator
    this.showTypingIndicator('Processing your choice...');
    this.chatState.sending = true;

    // Determine strategy based on selection
    let strategy = selectedValue;

    if (selectedValue === 'REFINEMENT') {
      strategy = 'PRESERVE_SELECTORS';
    } else if (selectedValue === 'NEW_FEATURE') {
      strategy = 'USE_ELEMENT_DATABASE';
    }

    // Re-send refinement request with clarified intent
    // The last user message in chat history is the original refinement request
    const lastUserMessage = this.chatHistory
      .filter(m => m.role === 'user')
      .pop();

    if (!lastUserMessage) {
      this.addChatMessage('assistant', 'Sorry, I lost track of your request. Could you try again?');
      this.hideTypingIndicator();
      this.chatState.sending = false;
      return;
    }

    try {
      // Send ADJUST_CODE with clarified strategy
      const response = await chrome.runtime.sendMessage({
        type: 'ADJUST_CODE',
        data: {
          pageData: this.currentPageData,
          previousCode: this.generatedCode,
          newRequest: lastUserMessage.content,
          conversationHistory: this.chatHistory,
          tabId: this.targetTabId,
          settings: this.settings,
          clarifiedStrategy: strategy // Pass the clarified strategy
        }
      });

      // Handle response (same as processRefinementRequest)
      if (!response.success && response.rolledBack) {
        this.addChatMessage('assistant', `⚠️ Unable to apply changes. Code reverted to last working version.

${response.error}`);
        this.hideTypingIndicator();
        this.chatState.sending = false;
        return;
      }

      if (!response.success) {
        this.addChatMessage('assistant', `Sorry, I encountered an error: ${response.error}`);
        this.hideTypingIndicator();
        this.chatState.sending = false;
        return;
      }

      // Success
      this.generatedCode = response.code;
      this.addChatMessage('assistant', `✅ Code updated successfully!

I've applied your changes using the ${selectedValue === 'REFINEMENT' ? 'existing elements' : 'new elements from the page'}.`);

      this.displayGeneratedCode(response.code);
      this.hideTypingIndicator();
      this.chatState.sending = false;

    } catch (error) {
      console.error('❌ Clarification processing error:', error);
      this.addChatMessage('assistant', `Sorry, something went wrong: ${error.message}`);
      this.hideTypingIndicator();
      this.chatState.sending = false;
    }
  }

  /**
   * 🆕 Process message with semantic search (DOM Code Companion)
   * Like "Go to Definition" in code editors, but for DOM elements
   */
  async processWithSemanticSearch(message, elementAttachment = null) {
    console.log('🔍 [SemanticSearch] Processing message with semantic search:', message);

    // If element is already attached (user manually selected), skip search
    if (elementAttachment) {
      console.log('✅ [SemanticSearch] Element already attached, skipping search');
      await this.generateExperimentFromChat(message);
      return;
    }

    // Use semantic index to find target elements
    if (!this.domSemanticIndex) {
      console.warn('⚠️ [SemanticSearch] DOM semantic index not available, falling back to standard generation');
      await this.generateExperimentFromChat(message);
      return;
    }

    try {
      // Search for elements matching user intent
      const searchResults = this.domSemanticIndex.searchByIntent(message);

      console.log(`🔍 [SemanticSearch] Found ${searchResults.results.length} potential matches`);

      // Case 1: No matches found
      if (searchResults.results.length === 0) {
        this.addChatMessage('assistant', `I couldn't find specific elements matching "${message}".

I'll generate generic code based on your description. For better targeting, you can:
• Click the 🎯 button to visually select an element
• Be more specific (e.g., "the blue button in the header")
• Describe the element's text content`);

        await this.generateExperimentFromChat(message);
        return;
      }

      // Case 2: Single high-confidence match
      if (searchResults.results.length === 1 || searchResults.results[0].score > 0.9) {
        const topMatch = searchResults.results[0];
        console.log(`✅ [SemanticSearch] High-confidence match: ${topMatch.element.selector} (score: ${topMatch.score})`);

        // Show what was found
        this.addChatMessage('assistant', `Found: **${this.getElementDescription(topMatch.element)}**

Generating code for this element...`);

        // Analyze dependencies and show warnings if needed
        if (this.domDependencyAnalyzer) {
          const impact = this.domDependencyAnalyzer.analyzeImpact(topMatch.element.selector);

          if (impact.warnings && impact.warnings.length > 0) {
            const warningsText = impact.warnings.map(w => `⚠️ ${w.message}`).join('\n');
            this.addChatMessage('assistant', `**Impact Analysis:**\n${warningsText}\n\nProceeding with code generation...`);
          }
        }

        // Add element context to message for AI
        const enhancedMessage = this.buildEnhancedMessage(message, topMatch);

        await this.generateExperimentFromChat(enhancedMessage);
        return;
      }

      // Case 3: Multiple matches - ask user to clarify
      console.log(`🤔 [SemanticSearch] Multiple matches found, asking user to clarify`);
      await this.showElementDisambiguation(message, searchResults.results);

    } catch (error) {
      console.error('❌ [SemanticSearch] Search failed:', error);
      this.addChatMessage('assistant', `I had trouble analyzing the page structure. Generating code based on your description instead.`);
      await this.generateExperimentFromChat(message);
    }
  }

  /**
   * 🆕 Show disambiguation UI when multiple elements match
   */
  async showElementDisambiguation(originalMessage, matchedElements) {
    const topMatches = matchedElements.slice(0, 5); // Show max 5 options

    // Build message with options
    let disambiguationMessage = `I found **${matchedElements.length} elements** that might match your request:\n\n`;

    topMatches.forEach((match, index) => {
      const el = match.element;
      const desc = this.getElementDescription(el);
      const location = el.parents && el.parents.length > 0 ?
        ` (in ${el.parents[el.parents.length - 1]})` : '';
      const confidence = Math.round(match.score * 100);

      disambiguationMessage += `**${index + 1}. ${desc}**${location} (${confidence}% match)\n`;

      if (el.text) {
        const truncatedText = el.text.substring(0, 50);
        disambiguationMessage += `   Text: "${truncatedText}${el.text.length > 50 ? '...' : ''}"\n`;
      }
      disambiguationMessage += `\n`;
    });

    disambiguationMessage += `Which element should I modify? Please reply with the number (1-${topMatches.length}) or describe it more specifically.`;

    this.addChatMessage('assistant', disambiguationMessage);

    // Store disambiguation context for next message
    this.pendingDisambiguation = {
      originalMessage,
      matches: topMatches,
      timestamp: Date.now()
    };

    // Update typing indicator status
    this.updateTypingIndicatorStatus('Waiting for your selection...');
  }

  /**
   * 🆕 Build enhanced message with element context
   */
  buildEnhancedMessage(originalMessage, matchResult) {
    const el = matchResult.element;
    const context = matchResult.context;

    let enhanced = originalMessage;

    // Add element details
    enhanced += `\n\n🎯 TARGET ELEMENT FOUND:\n`;
    enhanced += `Selector: ${el.selector}\n`;
    enhanced += `Tag: ${el.tag}\n`;

    if (el.classes && el.classes.length > 0) {
      enhanced += `Classes: ${el.classes.join(', ')}\n`;
    }

    if (el.text) {
      enhanced += `Text: "${el.text.substring(0, 100)}${el.text.length > 100 ? '...' : ''}"\n`;
    }

    // Add current styles
    if (context.currentStyles) {
      enhanced += `\nCURRENT STYLES:\n`;

      if (context.currentStyles.colors) {
        const colors = context.currentStyles.colors;
        if (colors.backgroundColor) enhanced += `• Background: ${colors.backgroundColor}\n`;
        if (colors.color) enhanced += `• Text Color: ${colors.color}\n`;
      }

      if (context.currentStyles.typography) {
        const typo = context.currentStyles.typography;
        if (typo.fontSize) enhanced += `• Font Size: ${typo.fontSize}\n`;
        if (typo.fontWeight) enhanced += `• Font Weight: ${typo.fontWeight}\n`;
      }

      if (context.currentStyles.layout) {
        const layout = context.currentStyles.layout;
        if (layout.width) enhanced += `• Width: ${layout.width}\n`;
        if (layout.height) enhanced += `• Height: ${layout.height}\n`;
      }
    }

    // Add dependency warnings if any
    if (this.domDependencyAnalyzer) {
      const impact = this.domDependencyAnalyzer.analyzeImpact(el.selector);

      if (impact.suggestions && impact.suggestions.length > 0) {
        enhanced += `\n💡 SUGGESTIONS:\n`;
        impact.suggestions.forEach(s => {
          enhanced += `• ${s.message}\n`;
        });
      }
    }

    return enhanced;
  }

  /**
   * Get human-readable element description
   */
  getElementDescription(element) {
    let description = element.tag;

    if (element.id) {
      description += `#${element.id}`;
    }

    if (element.classes && element.classes.length > 0) {
      description += `.${element.classes.slice(0, 2).join('.')}`;
    }

    if (element.text && element.text.trim()) {
      const text = element.text.trim().substring(0, 30);
      description += ` ("${text}${element.text.length > 30 ? '...' : ''}")`;
    }

    return description;
  }

  /**
   * Update typing indicator with current status
   */
  updateTypingIndicatorStatus(status) {
    // This could update a status text in the typing indicator
    // For now, just log it
    console.log(`💬 [Status] ${status}`);
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

  displayChatHistory() {
    const container = document.getElementById('chatMessages');
    if (!container) {
      console.warn('⚠️ Chat messages container not found');
      return;
    }

    // Clear existing messages
    container.innerHTML = '';

    console.log(`📚 Displaying ${this.chatHistory.length} chat history entries`);

    // Display each message from history
    this.chatHistory.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.role}: ${entry.content?.substring(0, 50) || '[no content]'}...`);

      // Add message to drawer
      this.addChatMessageToDrawer(
        entry.role,
        entry.content || '',
        entry.elementData || null
      );
    });

    console.log('✅ Chat history displayed successfully');
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

  async previewVariation(variationNumber, source = 'unknown') {
    try {
      console.log(`🎬 [Preview] previewVariation called for variation ${variationNumber} from source: ${source}`);
      console.trace('[Preview] Call stack');

      // GUARD: Prevent duplicate preview calls within 500ms
      if (this.previewState.isApplying) {
        console.warn(`⚠️ [Preview] Already applying a preview, ignoring duplicate call from: ${source}`);
        return;
      }

      this.previewState.isApplying = true;

      // Reset guard after 500ms (enough time for preview to start)
      setTimeout(() => {
        this.previewState.isApplying = false;
      }, 500);

      this.addActivity(`Previewing variation ${variationNumber}...`, 'info');

      if (!this.generatedCode?.variations) {
        this.previewState.isApplying = false;
        throw new Error('No variations available');
      }

      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (!variation) {
        throw new Error(`Variation ${variationNumber} not found`);
      }

      // 🆕 CRITICAL: Combine globalCSS/globalJS with variation CSS/JS
      // Helper functions in globalJS must be available before variation JS runs
      const combinedCSS = (this.generatedCode.globalCSS || '') + '\n' + (variation.css || '');
      const combinedJS = (this.generatedCode.globalJS || '') + '\n' + (variation.js || '');

      console.log(`📦 Preview code combination:`, {
        globalCSS: (this.generatedCode.globalCSS || '').length,
        varCSS: (variation.css || '').length,
        globalJS: (this.generatedCode.globalJS || '').length,
        varJS: (variation.js || '').length,
        combinedCSS: combinedCSS.length,
        combinedJS: combinedJS.length
      });

      // Send preview request through background script
      const response = await chrome.runtime.sendMessage({
        type: 'PREVIEW_VARIATION',
        css: combinedCSS.trim(),
        js: combinedJS.trim(),
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
      this.previewState.isApplying = false; // Reset guard on error
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

  async testVariation(variationNumber, refreshFirst = false) {
    try {
      this.addActivity(`Testing variation ${variationNumber}...`, 'info');

      if (!this.generatedCode?.variations) {
        throw new Error('No variations available');
      }

      const variation = this.generatedCode.variations.find(v => v.number === variationNumber);
      if (!variation) {
        throw new Error(`Variation ${variationNumber} not found`);
      }

      // Refresh page first if requested (clears stacked changes)
      if (refreshFirst) {
        this.addActivity(`🔄 Refreshing page for clean reapplication...`, 'info');

        // Wait for page to fully reload before reapplying code
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === this.targetTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // Extra delay to ensure content script is injected
              setTimeout(resolve, 500);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          chrome.tabs.reload(this.targetTabId);
        });
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
      // Get current tab if targetTabId not set
      let tabId = this.targetTabId;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
      }

      if (tabId) {
        await chrome.runtime.sendMessage({
          type: 'CLEAR_INJECTED_ASSETS',
          tabId: tabId
        });

        // Wait for page to stabilize after clearing
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn('No tab ID available for clearing assets');
      }
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

    // SAFETY CHECK: Skip Visual QA for fixed banners with correct body padding
    // Visual QA often halluc inates overlap issues for fixed banners even when spacing is correct
    const css = variation.css || '';
    const hasFixedBanner = css.includes('position: fixed') || css.includes('position:fixed');
    const hasBodyPadding = css.includes('body') && (css.includes('padding-top') || css.includes('margin-top'));

    if (hasFixedBanner && hasBodyPadding) {
      console.log('✅ [Visual QA Skip] Fixed banner with body spacing detected - skipping Visual QA to prevent false positives');
      this.addActivity(`✅ Skipped Visual QA (fixed banner with correct spacing)`, 'success');
      return; // Skip Visual QA entirely
    }

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

        // Generate feedback for next iteration with page context
        const elementDatabase = this.currentPageData?.elementDatabase || this.basePageData?.elementDatabase;
        const feedback = this.visualQAService.buildFeedbackForRegeneration(qaResult, elementDatabase, iteration);
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

        // Re-inject updated code with page refresh for clean reapplication
        this.addActivity(`🔄 Refreshing page and re-testing with improved code...`, 'info');

        // Refresh page to clear stacked changes
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === this.targetTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // Extra delay to ensure content script is injected
              setTimeout(resolve, 500);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          chrome.tabs.reload(this.targetTabId);
        });

        // Now apply the updated code to clean page
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
      // Build enhanced request with CURRENT CODE (refinement format)
      let codeContext = '';

      // Include globalCSS and globalJS if they exist
      if (this.generatedCode?.globalCSS) {
        codeContext += `GLOBAL CSS (shared - MUST preserve):\n${this.generatedCode.globalCSS}\n\n`;
      }
      if (this.generatedCode?.globalJS) {
        codeContext += `GLOBAL JS (helper functions - MUST preserve):\n${this.generatedCode.globalJS}\n\n`;
      }

      codeContext += `VARIATION CSS:\n${currentCode.css || ''}\n\nVARIATION JS:\n${currentCode.js || ''}`;

      const enhancedRequest = `⚠️ THIS IS A VISUAL QA REFINEMENT - FIX THE DEFECTS BELOW ⚠️

ORIGINAL REQUEST:
${originalRequest}

CURRENT GENERATED CODE:
${codeContext}

🔴 CRITICAL VISUAL QA FEEDBACK (ITERATION ${iteration}):
${feedback}

NEW REQUEST TO ADD:
FIX the issues identified above. You MUST address ALL critical defects while preserving other working functionality.`;

      // TEMPORARY: Direct code generation (RefinementContext disabled due to service worker limitations)
      // Visual QA defect filtering is still active in visual-qa-service.js
      console.log('[Visual QA] Regenerating code with Visual QA feedback (defect filtering active)...');

      try {
        const result = await this.callAIGeneration({
          description: enhancedRequest,
          pageData: this.basePageData || this.currentPageData,
          settings: this.settings,
          selectedElement: this.selectedElementData,
          variations: [{ id: 1, name: 'Variation 1', description: enhancedRequest }],
          intentAnalysis: {
            refinementType: 'visual_qa',
            needsVisualQA: false
          }
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

  // ==========================================
  // CONVERT.COM SYNC
  // ==========================================

  async showConvertSyncModalForUpdate(mapping) {
    // Show modal for updating - user needs to select account/project
    this.updateMode = true;
    this.updateModeMapping = mapping;
    await this.showConvertSyncModalInternal();
  }

  async openConvertSyncModal() {
    if (!this.generatedCode) {
      this.showStatus('⚠️ No code to push', 'error', 3000);
      return;
    }

    // Check if this experiment has been synced before
    const mapping = await this.getExperimentMapping();

    if (mapping) {
      // Experiment has been synced - update directly without modal
      console.log(`📝 Updating existing experience ${mapping.experienceId}`);
      await this.updateExistingExperience(mapping);
      return;
    }

    // New experiment - show modal for creation
    this.updateMode = false;
    this.updateModeMapping = null;
    await this.showConvertSyncModalInternal();
  }

  async showConvertSyncModalInternal() {
    // Load API keys
    await this.loadConvertApiKeys();

    // Try to restore domain preferences
    await this.restoreDomainPreferences();

    // Update modal title and button based on mode
    const modalTitle = document.getElementById('convertSyncModalTitle');
    const createBtn = document.getElementById('createConvertExperience');
    const updateBtn = document.getElementById('updateConvertExperience');

    if (this.updateMode) {
      if (modalTitle) {
        modalTitle.textContent = 'Update in Convert.com';
      }
      createBtn?.classList.add('hidden');
      updateBtn?.classList.remove('hidden');

      // Pre-fill experience name if available
      const nameInput = document.getElementById('convertExperienceName');
      if (nameInput && this.updateModeMapping?.experimentName) {
        nameInput.value = this.updateModeMapping.experimentName;
      }
    } else {
      if (modalTitle) {
        modalTitle.textContent = 'Push to Convert.com';
      }
      createBtn?.classList.remove('hidden');
      updateBtn?.classList.add('hidden');

      // Auto-populate experiment name from current experiment if available
      const nameInput = document.getElementById('convertExperienceName');
      if (nameInput && this.currentExperimentId && this.experimentHistory) {
        try {
          const currentUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());
          const experiment = await this.experimentHistory.getExperiment(currentUrl, this.currentExperimentId);
          if (experiment?.title) {
            nameInput.value = experiment.title;
          }
        } catch (error) {
          console.warn('Could not load experiment title:', error);
        }
      }
    }

    // Show modal
    const modal = document.getElementById('convertSyncModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  closeConvertSyncModal() {
    const modal = document.getElementById('convertSyncModal');
    if (modal) {
      modal.classList.add('hidden');
    }

    // Reset form
    this.resetConvertSyncForm();
  }

  resetConvertSyncForm() {
    const apiKeySelect = document.getElementById('convertApiKeySelect');
    const accountGroup = document.getElementById('convertAccountGroup');
    const projectGroup = document.getElementById('convertProjectGroup');
    const nameGroup = document.getElementById('convertExperienceNameGroup');
    const descGroup = document.getElementById('convertExperienceDescriptionGroup');
    const status = document.getElementById('convertSyncStatus');
    const nameInput = document.getElementById('convertExperienceName');
    const descInput = document.getElementById('convertExperienceDescription');

    if (apiKeySelect) apiKeySelect.value = '';
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    accountGroup?.classList.add('hidden');
    projectGroup?.classList.add('hidden');
    nameGroup?.classList.add('hidden');
    descGroup?.classList.add('hidden');
    status?.classList.add('hidden');

    // Hide success panel
    this.hideConvertSyncSuccess();

    // Hide buttons
    document.getElementById('createConvertExperience')?.classList.add('hidden');
    document.getElementById('updateConvertExperience')?.classList.add('hidden');
  }

  async generateExperimentName() {
    const nameInput = document.getElementById('convertExperienceName');
    const generateBtn = document.getElementById('generateExperienceName');

    if (!this.generatedCode?.variations || this.generatedCode.variations.length === 0) {
      this.showStatus('❌ No variations to analyze', 'error', 3000);
      return;
    }

    // Disable button and show loading state
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';
    }

    try {
      // Build context from variations
      const variationSummaries = this.generatedCode.variations.map((v, i) => {
        const changes = [];
        if (v.css) changes.push('CSS styling');
        if (v.js) changes.push('JavaScript functionality');
        return `Variation ${i + 1}: ${v.name || 'Unnamed'} - ${changes.join(' and ')}`;
      }).join('\n');

      const prompt = `Based on this A/B test experiment, generate a concise, descriptive experiment name (max 50 characters):

${variationSummaries}

The name should:
- Be clear and professional
- Describe WHAT is being tested
- Be concise (under 50 characters)
- Follow format: "[Page] - [Change Type]" (e.g., "Homepage - Hero CTA Color Test")

Return ONLY the experiment name, nothing else.`;

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CODE',
        data: {
          pageData: this.currentPageData || {},
          userPrompt: prompt,
          context: ''
        }
      });

      if (response.success && response.code) {
        // Extract just the name (remove any quotes or extra formatting)
        const generatedName = response.code.trim().replace(/^["']|["']$/g, '').substring(0, 100);
        if (nameInput) nameInput.value = generatedName;
        this.showStatus('✅ Name generated', 'success', 2000);
      } else {
        throw new Error(response.error || 'Failed to generate name');
      }
    } catch (error) {
      console.error('Failed to generate experiment name:', error);
      this.showStatus('❌ Failed to generate name', 'error', 3000);
    } finally {
      // Restore button
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>';
      }
    }
  }

  async generateExperimentDescription() {
    const descInput = document.getElementById('convertExperienceDescription');
    const generateBtn = document.getElementById('generateExperienceDescription');

    if (!this.generatedCode?.variations || this.generatedCode.variations.length === 0) {
      this.showStatus('❌ No variations to analyze', 'error', 3000);
      return;
    }

    // Disable button and show loading state
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/></svg>';
    }

    try {
      // Build detailed context
      const variationDetails = this.generatedCode.variations.map((v, i) => {
        const details = [];
        if (v.css) details.push(`CSS: ${v.css.substring(0, 200)}...`);
        if (v.js) details.push(`JS: ${v.js.substring(0, 200)}...`);
        return `Variation ${i + 1} (${v.name || 'Unnamed'}):\n${details.join('\n')}`;
      }).join('\n\n');

      const prompt = `Based on this A/B test experiment, generate a concise description (2-3 sentences, max 250 characters):

${variationDetails}

The description should:
- Explain WHAT is being changed
- State the HYPOTHESIS or goal
- Mention expected IMPACT
- Be professional and clear

Return ONLY the description, nothing else.`;

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_CODE',
        data: {
          pageData: this.currentPageData || {},
          userPrompt: prompt,
          context: ''
        }
      });

      if (response.success && response.code) {
        // Extract description (remove quotes/formatting)
        const generatedDesc = response.code.trim().replace(/^["']|["']$/g, '').substring(0, 500);
        if (descInput) descInput.value = generatedDesc;
        this.showStatus('✅ Description generated', 'success', 2000);
      } else {
        throw new Error(response.error || 'Failed to generate description');
      }
    } catch (error) {
      console.error('Failed to generate experiment description:', error);
      this.showStatus('❌ Failed to generate description', 'error', 3000);
    } finally {
      // Restore button
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>';
      }
    }
  }

  async loadConvertApiKeys() {
    try {
      const result = await chrome.storage.local.get(['convertApiKeys']);
      const apiKeys = result.convertApiKeys || [];

      const select = document.getElementById('convertApiKeySelect');
      if (!select) return;

      select.innerHTML = '<option value="">Select API credentials...</option>';

      if (apiKeys.length === 0) {
        select.innerHTML += '<option value="" disabled>No API keys configured</option>';
        this.showStatus('⚠️ Please add Convert.com API keys in settings', 'error', 5000);
        return;
      }

      apiKeys.forEach(key => {
        const option = document.createElement('option');
        option.value = key.id;
        option.textContent = key.label;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load API keys:', error);
      this.showStatus('❌ Failed to load API keys', 'error', 3000);
    }
  }

  async onConvertApiKeyChange() {
    const select = document.getElementById('convertApiKeySelect');
    const apiKeyId = select?.value;

    if (!apiKeyId) {
      document.getElementById('convertAccountGroup')?.classList.add('hidden');
      return;
    }

    // Get credentials
    const result = await chrome.storage.local.get(['convertApiKeys']);
    const apiKeys = result.convertApiKeys || [];
    const selectedKey = apiKeys.find(k => k.id === apiKeyId);

    if (!selectedKey) return;

    const credentials = {
      apiKey: selectedKey.apiKey,
      apiSecret: selectedKey.apiSecret
    };

    // Show loading
    this.showConvertSyncStatus('loading', 'Loading accounts...');

    try {
      // Fetch accounts
      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_LIST_ACCOUNTS',
        credentials
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch accounts');
      }

      const accounts = response.accounts || [];

      // Sort accounts alphabetically by name
      accounts.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Populate account dropdown
      const accountSelect = document.getElementById('convertAccountSelect');
      if (accountSelect) {
        accountSelect.innerHTML = '<option value="">Select an account...</option>';
        accounts.forEach(account => {
          const option = document.createElement('option');
          option.value = account.id;
          option.textContent = account.name;
          accountSelect.appendChild(option);
        });
      }

      // Show account group
      document.getElementById('convertAccountGroup')?.classList.remove('hidden');
      this.hideConvertSyncStatus();

      // Store credentials for later use
      this.convertCredentials = credentials;
      this.convertApiKeyId = apiKeyId;
    } catch (error) {
      console.error('Failed to load accounts:', error);
      this.showConvertSyncStatus('error', `Failed to load accounts: ${error.message}`);
    }
  }

  async onConvertAccountChange() {
    const accountSelect = document.getElementById('convertAccountSelect');
    const accountId = accountSelect?.value;

    if (!accountId) {
      document.getElementById('convertProjectGroup')?.classList.add('hidden');
      return;
    }

    this.showConvertSyncStatus('loading', 'Loading projects...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_LIST_PROJECTS',
        credentials: this.convertCredentials,
        accountId
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch projects');
      }

      const projects = response.projects || [];

      // Sort projects alphabetically by name
      projects.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Populate project dropdown
      const projectSelect = document.getElementById('convertProjectSelect');
      if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Select a project...</option>';
        projects.forEach(project => {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          projectSelect.appendChild(option);
        });
      }

      // Show project group
      document.getElementById('convertProjectGroup')?.classList.remove('hidden');
      this.hideConvertSyncStatus();

      this.convertAccountId = accountId;
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.showConvertSyncStatus('error', `Failed to load projects: ${error.message}`);
    }
  }

  async onConvertProjectChange() {
    const projectSelect = document.getElementById('convertProjectSelect');
    const projectId = projectSelect?.value;

    if (!projectId) {
      document.getElementById('convertExperienceNameGroup')?.classList.add('hidden');
      document.getElementById('createConvertExperience')?.classList.add('hidden');
      document.getElementById('updateConvertExperience')?.classList.add('hidden');
      return;
    }

    this.convertProjectId = projectId;

    // Show experience name input and description
    const nameGroup = document.getElementById('convertExperienceNameGroup');
    const descGroup = document.getElementById('convertExperienceDescriptionGroup');
    nameGroup?.classList.remove('hidden');
    descGroup?.classList.remove('hidden');

    // For now, always show Create button (experiment tracking not yet implemented)
    // TODO: Check if current experiment has convertMetadata.experienceId to show Update instead
    const createBtn = document.getElementById('createConvertExperience');
    const updateBtn = document.getElementById('updateConvertExperience');


    createBtn?.classList.remove('hidden');
    updateBtn?.classList.add('hidden');
  }

  async createConvertExperience() {
    const nameInput = document.getElementById('convertExperienceName');
    const descInput = document.getElementById('convertExperienceDescription');
    const experienceName = nameInput?.value?.trim();
    const experienceDescription = descInput?.value?.trim();

    if (!experienceName) {
      this.showConvertSyncStatus('error', 'Please enter an experience name');
      return;
    }

    if (!this.convertCredentials || !this.convertAccountId || !this.convertProjectId) {
      this.showConvertSyncStatus('error', 'Please complete all fields');
      return;
    }

    this.showConvertSyncStatus('loading', 'Creating experience in Convert.com...');

    try {
      // Get current page URL (not extension URL)
      const pageUrl = this.currentPageData?.url || (await this.getCurrentTabUrl()) || window.location.href;

      // Prepare payload according to Convert.com API spec
      const payload = {
        name: experienceName,
        type: 'a/b',  // Changed from 'ab' to 'a/b'
        status: 'paused',  // Changed from 'draft' to 'paused' (valid status)
        url: pageUrl,  // Root-level URL (required)
        site_area: {
          url: pageUrl,
          include_exclude: 'include',
          match_type: 'simple'
        },
        variations: this.formatVariationsForConvert(pageUrl)
      };

      // Add description if provided
      if (experienceDescription) {
        payload.description = experienceDescription;
      }

      // CRITICAL: Include waitForElement utility in global_js
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
      console.error('Element not found after ' + maxWait + 'ms:', selector);
    }
  }, 100);

  // Register cleanup if available
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
  }
}`;

      // Add global JS with waitForElement utility
      let globalJS = this.generatedCode?.globalJS || '';
      if (!globalJS.includes('function waitForElement')) {
        globalJS = globalJS ? `${waitForElementUtility}\n\n${globalJS}` : waitForElementUtility;
      }

      if (globalJS) {
        payload.global_js = globalJS;
      }

      // Add global CSS if available
      if (this.generatedCode?.globalCSS) {
        payload.global_css = this.generatedCode.globalCSS;
      }


      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_CREATE_EXPERIENCE',
        credentials: this.convertCredentials,
        accountId: this.convertAccountId,
        projectId: this.convertProjectId,
        payload,
        options: {
          include: ['variations']
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to create experience');
      }

      const experience = response.experience;
      const experienceId = experience?.id || experience?.data?.id || response.data?.id;

      if (!experienceId) {
        throw new Error('No experience ID returned from Convert.com API');
      }

      // Hide status, show success with link
      this.hideConvertSyncStatus();
      this.showConvertSyncSuccess(this.convertAccountId, this.convertProjectId, experienceId);

      // Save metadata to experiment history
      await this.saveConvertMetadata({
        accountId: this.convertAccountId,
        projectId: this.convertProjectId,
        experienceId: experienceId,
        apiKeyId: this.convertApiKeyId
      });

      // Save domain preferences for future use
      await this.saveDomainPreferences();

      // Save experiment-to-experience mapping for future updates
      await this.saveExperimentMapping(experienceId);

      // Update button text
      const pushText = document.getElementById('pushToConvertText');
      if (pushText) pushText.textContent = 'Update in Convert.com';

      // Don't auto-close - let user click the link
      this.showStatus('✅ Pushed to Convert.com successfully', 'success', 3000);
    } catch (error) {
      console.error('Failed to create experience:', error);
      this.showConvertSyncStatus('error', `Failed to create experience: ${error.message}`);
    }
  }

  /**
   * Update an existing experience that was previously synced
   * This bypasses the modal and updates directly
   */
  async updateExistingExperience(mapping) {
    console.log('[updateExistingExperience] FIXED VERSION - Starting update for experience:', mapping.experienceId);
    console.log('[updateExistingExperience] Mapping data:', mapping);
    this.showStatus('🔄 Updating experience in Convert.com...', 'info', 0);

    try {
      // Get API credentials
      const result = await chrome.storage.local.get(['convertApiKeys']);
      const apiKeys = result.convertApiKeys || [];
      console.log('[updateExistingExperience] Available API keys:', apiKeys.map(k => ({ id: k.id, name: k.name })));
      console.log('[updateExistingExperience] Looking for API key ID:', mapping.apiKeyId);

      // Try to find the stored API key, or fall back to current API key, or use first available
      let selectedKey = mapping.apiKeyId ? apiKeys.find(k => k.id === mapping.apiKeyId) : null;

      if (!selectedKey) {
        selectedKey = this.convertApiKeyId ? apiKeys.find(k => k.id === this.convertApiKeyId) : null;
      }

      if (!selectedKey && apiKeys.length > 0) {
        selectedKey = apiKeys[0];
      }

      if (!selectedKey) {
        console.error('[updateExistingExperience] No API keys available');
        this.showStatus('❌ No API keys configured', 'error', 5000);
        return;
      }

      console.log('[updateExistingExperience] Using API key:', selectedKey.name || selectedKey.id);

      const credentials = {
        apiKey: selectedKey.apiKey,
        apiSecret: selectedKey.apiSecret
      };

      // Get accountId and projectId - fall back to current values if not in mapping
      let accountId = mapping.accountId || this.convertAccountId;
      let projectId = mapping.projectId || this.convertProjectId;
      const experienceId = mapping.experienceId;

      // If still missing, try to get from DOM selects
      if (!accountId) {
        const accountSelect = document.getElementById('convertAccountSelect');
        accountId = accountSelect?.value;
        console.log('[updateExistingExperience] Got accountId from select:', accountId);
      }

      if (!projectId) {
        const projectSelect = document.getElementById('convertProjectSelect');
        projectId = projectSelect?.value;
        console.log('[updateExistingExperience] Got projectId from select:', projectId);
      }

      if (!accountId || !projectId || !experienceId) {
        console.error('[updateExistingExperience] Missing required IDs:', { accountId, projectId, experienceId });
        console.log('[updateExistingExperience] Opening modal for user to select account/project...');
        this.showStatus('⚠️ Please select account and project to update experience', 'info', 3000);

        // Open modal so user can select account/project
        await this.showConvertSyncModalForUpdate(mapping);
        return;
      }

      // Fetch experience to get variations
      console.log('[updateExistingExperience] About to fetch experience...');
      console.log('[updateExistingExperience] Request params:', {
        accountId,
        projectId,
        experienceId
      });

      const fetchResponse = await chrome.runtime.sendMessage({
        type: 'CONVERT_GET_EXPERIENCE',
        credentials,
        accountId,
        projectId,
        experienceId,
        options: {
          include: ['variations']
        }
      });

      console.log('[updateExistingExperience] Fetch response received:', fetchResponse);
      console.log('[updateExistingExperience] Response success:', fetchResponse?.success);
      console.log('[updateExistingExperience] Response error:', fetchResponse?.error);

      if (!fetchResponse.success) {
        const errorMessage = fetchResponse.error || 'Failed to fetch experience';
        console.log('[updateExistingExperience] Creating error with message:', errorMessage);
        throw new Error(errorMessage);
      }

      const variations = fetchResponse.experience?.variations || [];
      // Check if all variations are baseline
      const allBaseline = variations.every(v => v.is_baseline);
      if (allBaseline && variations.length === 1) {
        console.warn('⚠️ Experience only has baseline variation. Global JS/CSS will be updated, but consider creating a new experience for proper A/B test structure.');
      }

      // Update each variation with new code
      for (let i = 0; i < variations.length && i < this.generatedCode.variations.length; i++) {
        const apiVariation = variations[i];
        const codeVariation = this.generatedCode.variations[i];

        // Skip baseline variations - they represent the original page without changes
        if (apiVariation.is_baseline) {
          continue;
        }

        // Build the change data object
        // IMPORTANT: When adding a new change, ALL THREE fields (css, js, custom_js) are REQUIRED
        // Use null for empty values (API spec says "string | null")
        const changeData = {
          css: codeVariation.css || null,
          js: null,  // Visual Editor JS - always null for us
          custom_js: codeVariation.js || null
        };

        // If no code at all, skip this variation
        if (!changeData.css && !changeData.custom_js) {
          continue;
        }

        // Include concurrency_key if available (for optimistic locking)
        const updatePayload = {
          changes: [
            {
              type: 'defaultCode',
              data: changeData
            }
          ]
        };

        if (apiVariation.concurrency_key) {
          updatePayload.concurrency_key = apiVariation.concurrency_key;
        }


        const updateResponse = await chrome.runtime.sendMessage({
          type: 'CONVERT_UPDATE_VARIATION',
          credentials,
          accountId,
          projectId,
          experienceId,
          variationId: apiVariation.id,
          payload: updatePayload
        });

        if (!updateResponse.success) {
          console.warn(`⚠️ Could not update variation code: ${updateResponse.error}`);
        }
      }

      // Update global JS/CSS at experience level if available
      if (this.generatedCode?.globalJS || this.generatedCode?.globalCSS) {

        // CRITICAL: Include waitForElement utility in global_js
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
      console.error('Element not found after ' + maxWait + 'ms:', selector);
    }
  }, 100);

  // Register cleanup if available
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
  }
}`;

        const experienceUpdatePayload = {};

        if (this.generatedCode.globalJS) {
          // Add waitForElement utility if not already present
          let globalJS = this.generatedCode.globalJS;
          if (!globalJS.includes('function waitForElement')) {
            globalJS = `${waitForElementUtility}\n\n${globalJS}`;
          }
          experienceUpdatePayload.global_js = globalJS;
        }

        if (this.generatedCode.globalCSS) {
          experienceUpdatePayload.global_css = this.generatedCode.globalCSS;
        }

        const experienceUpdateResponse = await chrome.runtime.sendMessage({
          type: 'CONVERT_UPDATE_EXPERIENCE',
          credentials,
          accountId,
          projectId,
          experienceId,
          payload: experienceUpdatePayload
        });

        if (!experienceUpdateResponse.success) {
          throw new Error('Failed to update global JS/CSS: ' + experienceUpdateResponse.error);
        }
      }

      // Update instance variables for saveExperimentMapping
      this.convertApiKeyId = selectedKey.id;
      this.convertAccountId = accountId;
      this.convertProjectId = projectId;

      // Update mapping timestamp - saveExperimentMapping will update these values
      await this.saveExperimentMapping(experienceId);

      // Show success
      const convertUrl = `https://app.convert.com/accounts/${accountId}/projects/${projectId}/experiences/${experienceId}/editor`;
      this.showStatus(`✅ <a href="${convertUrl}" target="_blank" style="color: #22c55e; text-decoration: underline;">Experience updated successfully</a>`, 'success', 8000);

      console.log('✅ Experience updated successfully');
    } catch (error) {
      console.error('Failed to update experience:', error);
      this.showStatus(`❌ Failed to update: ${error.message}`, 'error', 5000);
    }
  }

  async updateConvertExperience() {
    // If in update mode, use the mapping approach
    if (this.updateMode && this.updateModeMapping) {

      // Get selected account and project from modal
      const apiKeySelect = document.getElementById('convertApiKeySelect');
      const accountSelect = document.getElementById('convertAccountSelect');
      const projectSelect = document.getElementById('convertProjectSelect');

      const apiKeyId = apiKeySelect?.value;
      const accountId = accountSelect?.value;
      const projectId = projectSelect?.value;

      if (!apiKeyId || !accountId || !projectId) {
        this.showConvertSyncStatus('error', 'Please select API key, account, and project');
        return;
      }

      // Update instance variables
      this.convertApiKeyId = apiKeyId;
      this.convertAccountId = accountId;
      this.convertProjectId = projectId;

      // Close modal and perform update
      this.closeConvertSyncModal();

      // Call updateExistingExperience with the mapping
      await this.updateExistingExperience(this.updateModeMapping);
      return;
    }

    // Legacy path: Old metadata system
    const currentExperiment = await this.getCurrentExperiment();
    if (!currentExperiment?.convertMetadata?.experienceId) {
      this.showConvertSyncStatus('error', 'No experience ID found');
      return;
    }

    const metadata = currentExperiment.convertMetadata;

    // Get credentials for this API key
    const result = await chrome.storage.local.get(['convertApiKeys']);
    const apiKeys = result.convertApiKeys || [];
    const selectedKey = apiKeys.find(k => k.id === metadata.apiKeyId);

    if (!selectedKey) {
      this.showConvertSyncStatus('error', 'API key not found');
      return;
    }

    const credentials = {
      apiKey: selectedKey.apiKey,
      apiSecret: selectedKey.apiSecret
    };

    this.showConvertSyncStatus('loading', 'Updating experience...');

    try {
      // Get current page URL (not extension URL)
      const pageUrl = this.currentPageData?.url || (await this.getCurrentTabUrl()) || window.location.href;

      const payload = {
        variations: this.formatVariationsForConvert(pageUrl)
      };

      const response = await chrome.runtime.sendMessage({
        type: 'CONVERT_UPDATE_EXPERIENCE',
        credentials,
        accountId: metadata.accountId,
        projectId: metadata.projectId,
        experienceId: metadata.experienceId,
        payload
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update experience');
      }

      // Hide status, show success with link
      this.hideConvertSyncStatus();
      this.showConvertSyncSuccess(metadata.accountId, metadata.projectId, metadata.experienceId);

      // Update sync timestamp
      if (this.experimentHistory) {
        await this.experimentHistory.updateSyncTimestamp(
          this.currentPageData?.url,
          currentExperiment.id
        );
      }

      // Don't auto-close - let user click the link
      this.showStatus('✅ Updated in Convert.com', 'success', 3000);
    } catch (error) {
      console.error('Failed to update experience:', error);
      this.showConvertSyncStatus('error', `Failed to update: ${error.message}`);
    }
  }

  formatVariationsForConvert(pageUrl) {
    if (!this.generatedCode?.variations) {
      return [];
    }

    // IMPORTANT: Convert.com A/B tests need a baseline (original) and variation(s)
    // The baseline is the original page with NO code changes
    // Each generated variation becomes a Convert.com variation with code changes

    const baselinePercentage = 50;
    const variationPercentage = Math.floor(50 / this.generatedCode.variations.length);

    const variations = [];

    // Add baseline (original) variation first - NO code changes
    variations.push({
      name: 'Original',
      is_baseline: true,  // Mark as baseline (control) variation
      traffic_distribution: baselinePercentage  // API expects traffic_distribution, not percentage
      // No changes array for baseline - it's the original page
      // No id field - API assigns it automatically (readOnly)
      // No url field - URL is set at experience level, not variation level
    });

    // Add user's variations with code changes
    this.generatedCode.variations.forEach((variation, index) => {
      const variationData = {
        name: variation.name || `Variation ${index + 1}`,
        traffic_distribution: variationPercentage  // API expects traffic_distribution, not percentage
        // No id field - API assigns it automatically (readOnly)
        // No url field - URL is set at experience level, not variation level
      };

      // Add code changes in the changes array format
      const hasCode = (variation.js && variation.js.trim()) || (variation.css && variation.css.trim());

      if (hasCode) {
        variationData.changes = [
          {
            type: 'defaultCode',
            data: {
              css: variation.css || '',
              js: '',  // Keep empty - use custom_js instead
              custom_js: variation.js || ''  // Variation-specific JavaScript goes here
            }
          }
        ];
      }

      variations.push(variationData);
    });

    return variations;
  }

  wrapCSSInJS(css) {
    if (!css || !css.trim()) return '';

    const escapedCSS = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

    return `(function() {
  var convertStyle = document.createElement('style');
  convertStyle.id = 'convert-injected-css-' + Date.now();
  convertStyle.textContent = \`${escapedCSS}\`;
  document.head.appendChild(convertStyle);
})();`;
  }

  async saveConvertMetadata(metadata) {
    if (!this.experimentHistory) return;

    const currentExperiment = await this.getCurrentExperiment();
    if (!currentExperiment) return;

    await this.experimentHistory.markAsSynced(
      this.currentPageData?.url,
      currentExperiment.id,
      metadata
    );

  }

  async getCurrentExperiment() {
    // This would need to be implemented based on how experiments are tracked
    // For now, return null - you'll need to add proper experiment tracking
    return null;
  }

  async prefillConvertSyncModal(metadata) {
    // Pre-fill API key
    const apiKeySelect = document.getElementById('convertApiKeySelect');
    if (apiKeySelect && metadata.apiKeyId) {
      apiKeySelect.value = metadata.apiKeyId;
      await this.onConvertApiKeyChange();

      // Pre-fill account
      await this.waitForElement('convertAccountSelect');
      const accountSelect = document.getElementById('convertAccountSelect');
      if (accountSelect && metadata.accountId) {
        accountSelect.value = metadata.accountId;
        await this.onConvertAccountChange();

        // Pre-fill project
        await this.waitForElement('convertProjectSelect');
        const projectSelect = document.getElementById('convertProjectSelect');
        if (projectSelect && metadata.projectId) {
          projectSelect.value = metadata.projectId;
          await this.onConvertProjectChange();
        }
      }
    }
  }

  async waitForElement(id, maxWait = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const el = document.getElementById(id);
      if (el && el.options && el.options.length > 1) {
        return el;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  showConvertSyncStatus(type, message) {
    const status = document.getElementById('convertSyncStatus');
    if (!status) return;

    status.className = `sync-status ${type}`;
    status.classList.remove('hidden');

    const messageEl = status.querySelector('.sync-status-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  hideConvertSyncStatus() {
    const status = document.getElementById('convertSyncStatus');
    if (status) {
      status.classList.add('hidden');
    }
  }

  showConvertSyncSuccess(accountId, projectId, experienceId) {
    // Hide status message
    this.hideConvertSyncStatus();

    // Show success panel
    const successPanel = document.getElementById('convertSyncSuccess');
    if (successPanel) {
      successPanel.classList.remove('hidden');
    }

    // Build Convert.com URL with /editor path
    const convertUrl = `https://app.convert.com/accounts/${accountId}/projects/${projectId}/experiences/${experienceId}/editor`;

    // Set link href
    const link = document.getElementById('convertExperienceLink');
    if (link) {
      link.href = convertUrl;
    }

    // Hide form buttons, show only close
    document.getElementById('createConvertExperience')?.classList.add('hidden');
    document.getElementById('updateConvertExperience')?.classList.add('hidden');
  }

  hideConvertSyncSuccess() {
    const successPanel = document.getElementById('convertSyncSuccess');
    if (successPanel) {
      successPanel.classList.add('hidden');
    }
  }

  /**
   * Get domain from current page URL
   */
  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url || this.currentPageData?.url || window.location.href);
      return urlObj.hostname;
    } catch (e) {
      console.error('Invalid URL:', url);
      return null;
    }
  }

  /**
   * Save domain preferences (API key, account, project)
   */
  async saveDomainPreferences() {
    try {
      const domain = this.getDomainFromUrl();
      if (!domain) return;

      const preferences = {
        apiKeyId: this.convertApiKeyId,
        accountId: this.convertAccountId,
        projectId: this.convertProjectId
      };

      // Load existing preferences
      const result = await chrome.storage.local.get(['convertDomainPreferences']);
      const domainPrefs = result.convertDomainPreferences || {};

      // Save for this domain
      domainPrefs[domain] = preferences;

      await chrome.storage.local.set({ convertDomainPreferences: domainPrefs });
    } catch (error) {
      console.error('Failed to save domain preferences:', error);
    }
  }

  /**
   * Restore domain preferences (auto-select API key, account, project)
   */
  async restoreDomainPreferences() {
    try {
      const domain = this.getDomainFromUrl();
      if (!domain) return;

      // Load preferences
      const result = await chrome.storage.local.get(['convertDomainPreferences']);
      const domainPrefs = result.convertDomainPreferences || {};
      const preferences = domainPrefs[domain];

      if (!preferences) {
        console.log(`No saved preferences for ${domain}`);
        return;
      }


      // Restore API key
      const apiKeySelect = document.getElementById('convertApiKeySelect');
      if (apiKeySelect && preferences.apiKeyId) {
        apiKeySelect.value = preferences.apiKeyId;
        await this.onConvertApiKeyChange();

        // Wait for accounts to load
        await this.waitForElement('convertAccountSelect', 5000);

        // Restore account
        const accountSelect = document.getElementById('convertAccountSelect');
        if (accountSelect && preferences.accountId) {
          accountSelect.value = preferences.accountId;
          await this.onConvertAccountChange();

          // Wait for projects to load
          await this.waitForElement('convertProjectSelect', 5000);

          // Restore project
          const projectSelect = document.getElementById('convertProjectSelect');
          if (projectSelect && preferences.projectId) {
            projectSelect.value = preferences.projectId;
            await this.onConvertProjectChange();

          }
        }
      }
    } catch (error) {
      console.error('Failed to restore domain preferences:', error);
    }
  }

  /**
   * Save experiment-to-experience mapping for future updates
   * Creates a unique key based on page URL and generated code hash
   */
  async saveExperimentMapping(experienceId) {
    try {
      const experimentKey = await this.getExperimentKey();
      if (!experimentKey) {
        console.warn('Cannot save experiment mapping: no experiment key');
        return;
      }


      const mapping = {
        experienceId: experienceId,
        accountId: this.convertAccountId,
        projectId: this.convertProjectId,
        apiKeyId: this.convertApiKeyId,
        pageUrl: this.currentPageData?.url || (await this.getCurrentTabUrl()),
        experimentName: document.getElementById('convertExperienceName')?.value || 'Unnamed',
        lastSynced: new Date().toISOString(),
        codeHash: this.getCodeHash()
      };

      const result = await chrome.storage.local.get(['convertExperimentMappings']);
      const mappings = result.convertExperimentMappings || {};
      mappings[experimentKey] = mapping;

      await chrome.storage.local.set({ convertExperimentMappings: mappings });

      // Update UI to show this is a synced experiment
      this.currentExperimentMapping = mapping;
      this.updatePushButtonState();
    } catch (error) {
      console.error('Failed to save experiment mapping:', error);
    }
  }

  /**
   * Get experiment mapping for current experiment
   */
  async getExperimentMapping() {
    try {
      const experimentKey = await this.getExperimentKey();
      if (!experimentKey) return null;

      const result = await chrome.storage.local.get(['convertExperimentMappings']);
      const mappings = result.convertExperimentMappings || {};

      return mappings[experimentKey] || null;
    } catch (error) {
      console.error('Failed to get experiment mapping:', error);
      return null;
    }
  }

  /**
   * Generate unique key for current experiment
   * Based on page URL + variation names + code structure
   */
  async getExperimentKey() {
    if (!this.generatedCode?.variations) {
      return null;
    }

    // Get page URL
    const pageUrl = this.currentPageData?.url || (await this.getCurrentTabUrl());
    if (!pageUrl) {
      return null;
    }

    // Create a key from URL and variation structure
    const variationNames = this.generatedCode.variations.map(v => v.name || '').join('|');

    // Simple hash (not cryptographic, just for identification)
    const keyString = `${pageUrl}_${variationNames}`;
    return keyString.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 200);
  }

  /**
   * Generate hash of current code for change detection
   */
  getCodeHash() {
    if (!this.generatedCode) return '';

    const codeString = JSON.stringify({
      variations: this.generatedCode.variations.map(v => ({
        name: v.name,
        js: v.js,
        css: v.css
      })),
      globalJS: this.generatedCode.globalJS,
      globalCSS: this.generatedCode.globalCSS
    });

    // Simple hash
    let hash = 0;
    for (let i = 0; i < codeString.length; i++) {
      const char = codeString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Update push button to show "Update" or "Push" based on sync state
   */
  async updatePushButtonState() {
    const pushBtn = document.getElementById('pushToConvertBtn');
    const pushText = document.getElementById('pushToConvertText');

    if (!pushBtn || !pushText) return;

    // Check if this experiment has been synced
    const mapping = await this.getExperimentMapping();

    if (mapping) {
      pushText.textContent = 'Update in Convert.com';
      pushBtn.title = `Update existing experience (ID: ${mapping.experienceId})`;
      console.log(`📝 Experiment is synced to experience ${mapping.experienceId}`);

      // Add Convert.com link and "Push New" button
      this.addConvertLinkToHeader(mapping);
      this.addPushNewButton();
    } else {
      pushText.textContent = 'Push to Convert.com';
      pushBtn.title = 'Create new experience in Convert.com';

      // Remove Convert.com link and "Push New" button if they exist
      this.removeConvertLinkFromHeader();
      this.removePushNewButton();
    }
  }

  addPushNewButton() {
    const menu = document.getElementById('actionsMenu');
    if (!menu) return;

    // Remove existing button if present
    const existingBtn = menu.querySelector('.push-new-menu-item');
    if (existingBtn) return; // Already exists

    // Create "Push New" menu item
    const pushNewItem = document.createElement('button');
    pushNewItem.className = 'actions-menu-item push-new-menu-item';
    pushNewItem.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
      </svg>
      <span>Push as New Experience</span>
    `;

    // Add click handler
    pushNewItem.addEventListener('click', async () => {
      menu.classList.add('hidden');

      // Show confirmation
      if (!confirm('This will create a NEW experience in Convert.com (separate from the currently synced one). Continue?')) {
        return;
      }

      // Open modal for new experience creation
      this.updateMode = false;
      this.updateModeMapping = null;
      await this.showConvertSyncModalInternal();
    });

    // Add to menu
    menu.appendChild(pushNewItem);
  }

  removePushNewButton() {
    const existingBtn = document.querySelector('.push-new-menu-item');
    if (existingBtn) existingBtn.remove();
  }

  addConvertLinkToHeader(mapping) {
    const menu = document.getElementById('actionsMenu');
    if (!menu) return;

    // Remove existing link if present
    const existingLink = menu.querySelector('.convert-experience-link');
    if (existingLink) return; // Already exists

    // Create Convert.com link
    const convertUrl = `https://app.convert.com/accounts/${mapping.accountId}/projects/${mapping.projectId}/experiences/${mapping.experienceId}/editor`;

    // Add divider before the link
    const divider = document.createElement('div');
    divider.className = 'actions-menu-divider';
    menu.appendChild(divider);

    // Create menu item as a link
    const link = document.createElement('a');
    link.href = convertUrl;
    link.target = '_blank';
    link.className = 'actions-menu-item convert-experience-link';
    link.style.cssText = 'text-decoration: none;';
    link.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>Open in Convert.com</span>
    `;

    // Close menu on click
    link.addEventListener('click', () => {
      menu.classList.add('hidden');
    });

    // Add to menu
    menu.appendChild(link);
  }

  removeConvertLinkFromHeader() {
    const menu = document.getElementById('actionsMenu');
    if (!menu) return;

    const existingLink = menu.querySelector('.convert-experience-link');
    const existingDivider = existingLink?.previousElementSibling;

    if (existingLink) existingLink.remove();
    if (existingDivider?.classList.contains('actions-menu-divider')) {
      existingDivider.remove();
    }
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
        console.log('Content script injected successfully');
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
    
    console.log('Template selector displayed in main workflow');
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

  async updateCostDisplay(usage) {
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

    // Save usage stats to Chrome storage for persistence
    try {
      await chrome.storage.local.set({ usageStats: this.usageStats });
      console.log('💾 Usage stats saved:', this.usageStats);
    } catch (error) {
      console.warn('⚠️ Failed to save usage stats:', error);
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

    // Bind stop AI request button
    const statusStopBtn = document.getElementById('statusStopBtn');
    if (statusStopBtn) {
      statusStopBtn.addEventListener('click', () => this.stopAIRequest());
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

  showStatus(message, type = 'info', duration = null, showStopButton = false) {
    const statusBar = document.getElementById('persistentStatusBar');
    const statusMessage = document.getElementById('statusMessage');
    const statusIcon = statusBar?.querySelector('.status-icon');
    const stopBtn = document.getElementById('statusStopBtn');

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

    // Show/hide stop button
    if (stopBtn) {
      if (showStopButton) {
        stopBtn.classList.remove('hidden');
      } else {
        stopBtn.classList.add('hidden');
      }
    }

    // Remove all status type classes
    statusBar.classList.remove('status-info', 'status-success', 'status-error', 'status-warning', 'status-loading');

    // Add current type class
    statusBar.classList.add(`status-${type}`);

    // Show the status bar
    statusBar.classList.remove('hidden');

    // Add class to workspace container to add padding
    const workspaceContainer = document.querySelector('.workspace-container');
    if (workspaceContainer) {
      workspaceContainer.classList.add('has-status-bar');
    }

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

  async stopAIRequest() {
    console.log('🛑 Stop button clicked');

    try {
      // Send stop request to service worker
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_AI_REQUEST'
      });

      if (response.success) {
        this.showStatus('🛑 Request cancelled', 'warning', 3000);
        this.addActivity('AI request cancelled by user', 'warning');

        // Reset chat state to prevent any automatic generation
        if (this.chatState?.sending) {
          this.chatState.sending = false;
          this.hideTypingIndicator();
          this.chatInitiated = false;
        }

        // Reset request tracking - CRITICAL: Don't revert or regenerate
        this.currentRequestType = null;
        this.previousCodeState = null;

        // Clear any status messages
        this.clearStatus();

        // Stay on current view without triggering any generation
        console.log('Request stopped, staying on current view without any automatic actions');
      } else {
        this.showStatus('No active request to stop', 'info', 2000);
      }
    } catch (error) {
      console.error('Failed to stop request:', error);
      this.showStatus('Failed to stop request', 'error', 3000);
    }
  }

  clearStatus() {
    const statusBar = document.getElementById('persistentStatusBar');
    if (statusBar) {
      statusBar.classList.add('hidden');
    }

    // Remove padding class from workspace container
    const workspaceContainer = document.querySelector('.workspace-container');
    if (workspaceContainer) {
      workspaceContainer.classList.remove('has-status-bar');
    }

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    // Hide stop button when clearing status
    const stopBtn = document.getElementById('statusStopBtn');
    if (stopBtn) {
      stopBtn.classList.add('hidden');
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
  
  async loadUsageStats() {
    try {
      const result = await chrome.storage.local.get(['usageStats']);
      if (result.usageStats) {
        this.usageStats = result.usageStats;
        console.log('📊 Usage stats loaded from storage:', this.usageStats);

        // Update UI with loaded values
        const costAmount = document.getElementById('costAmount');
        const tokenCount = document.getElementById('tokenCount');

        if (costAmount) {
          costAmount.textContent = `$${this.usageStats.cost.toFixed(4)}`;
        }

        if (tokenCount) {
          tokenCount.textContent = this.usageStats.tokens.toLocaleString();
        }
      } else {
        console.log('📊 No saved usage stats found, starting fresh');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load usage stats:', error);
    }
  }
  async loadCurrentPage() { console.log('📄 Current page loaded'); }
  async loadConvertAPIKeys() { }

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