/**
 * State-Driven Workspace V2
 * Unified interface that adapts based on workflow state
 * Maintains full compatibility with existing backend
 */
class WorkspaceV2 {
  constructor(legacyBuilder) {
    this.legacyBuilder = legacyBuilder; // Reference to existing ExperimentBuilder
    this.currentState = 'fresh';
    this.stateHistory = [];
    this.performanceMetrics = new Map();
    
    // State machine definitions
    this.states = {
      'fresh': new FreshState(this),
      'designing': new DesigningState(this), 
      'reviewing': new ReviewingState(this),
      'deploying': new DeployingState(this)
    };

    // Performance monitoring
    this.startTime = performance.now();
    this.bindPerformanceMonitoring();
    
    this.initialize();
  }

  async initialize() {
    console.log('🚀 Initializing Workspace V2...');
    
    if (!window.featureFlags?.isEnabled('workspace_v2')) {
      console.log('📱 V2 interface disabled, using legacy');
      return;
    }

    // Show V2 interface
    document.getElementById('appV1').style.display = 'none';
    document.getElementById('appV2').style.display = 'block';

    // Initialize components
    this.setupEventListeners();
    this.setupCommandPalette();
    this.initializeChat();
    this.bindLegacyIntegration();
    
    // Set initial state
    await this.transitionToState('fresh');
    
    // Report initialization performance
    const loadTime = performance.now() - this.startTime;
    window.featureFlags?.reportPerformance('workspace_v2_load_time', loadTime);
    
    console.log(`✅ Workspace V2 initialized in ${loadTime.toFixed(2)}ms`);
  }

  setupEventListeners() {
    // Command palette toggle
    document.getElementById('commandPaletteBtn')?.addEventListener('click', () => {
      this.toggleCommandPalette();
    });

    // Quick start action
    document.getElementById('quickStartBtn')?.addEventListener('click', () => {
      this.startConversation();
    });

    // Panel toggle
    document.getElementById('panelToggle')?.addEventListener('click', () => {
      this.toggleLivePanel();
    });

    // Code drawer toggle  
    document.getElementById('drawerToggle')?.addEventListener('click', () => {
      this.toggleCodeDrawer();
    });

    // Chat form
    document.getElementById('chatFormV2')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleChatSubmit();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Feature flag changes
    window.addEventListener('featureFlagChanged', (e) => {
      this.handleFeatureFlagChange(e.detail);
    });
  }

  setupCommandPalette() {
    if (!window.featureFlags?.isEnabled('command_palette')) return;

    this.commandPalette = new CommandPalette({
      commands: [
        { name: 'Capture Page', action: () => this.legacyBuilder.capturePage() },
        { name: 'Add Variation', action: () => this.legacyBuilder.addVariation() },
        { name: 'Generate Code', action: () => this.legacyBuilder.generateCode() },
        { name: 'Deploy to Convert', action: () => this.legacyBuilder.pushConvertExperience() },
        { name: 'Export Code', action: () => this.legacyBuilder.exportCode() },
        { name: 'Clear Results', action: () => this.legacyBuilder.clearResults() },
        { name: 'Switch to Legacy Interface', action: () => this.switchToLegacy() }
      ]
    });
  }

  initializeChat() {
    this.chatManager = new UnifiedChatManager({
      container: document.getElementById('chatHistoryV2'),
      input: document.getElementById('chatInputV2'),
      legacyBuilder: this.legacyBuilder,
      onStateChange: (newState) => this.transitionToState(newState)
    });
  }

  bindLegacyIntegration() {
    // Listen to legacy builder events and sync state
    if (this.legacyBuilder) {
      // Hook into existing methods to sync state
      const originalCapture = this.legacyBuilder.capturePage.bind(this.legacyBuilder);
      this.legacyBuilder.capturePage = async () => {
        const result = await originalCapture();
        if (result) {
          await this.transitionToState('designing');
        }
        return result;
      };

      const originalGenerate = this.legacyBuilder.generateExperiment.bind(this.legacyBuilder);
      this.legacyBuilder.generateExperiment = async () => {
        const result = await originalGenerate();
        if (result) {
          await this.transitionToState('reviewing');
        }
        return result;
      };

      // Sync status updates
      const originalStatusLog = this.legacyBuilder.addStatusLog.bind(this.legacyBuilder);
      this.legacyBuilder.addStatusLog = (message, type) => {
        originalStatusLog(message, type);
        this.addActivityItem(message, type);
      };
    }
  }

  async transitionToState(newState) {
    if (!this.states[newState]) {
      console.error(`Invalid state: ${newState}`);
      return;
    }

    const previousState = this.currentState;
    this.stateHistory.push(previousState);
    
    // Exit current state
    if (this.states[this.currentState]) {
      await this.states[this.currentState].exit();
    }

    // Update state
    this.currentState = newState;
    
    // Enter new state
    await this.states[newState].enter();
    
    console.log(`🔄 State transition: ${previousState} → ${newState}`);
    
    // Update UI to reflect new state
    this.updateWorkAreaForState(newState);
    this.updateNavigationState(newState);
  }

  updateWorkAreaForState(state) {
    const workArea = document.getElementById('workArea');
    if (!workArea) return;

    // Hide all states
    workArea.querySelectorAll('.work-state').forEach(el => {
      el.classList.add('hidden');
    });

    // Show current state
    const currentStateEl = workArea.querySelector(`[data-state="${state}"]`);
    if (currentStateEl) {
      currentStateEl.classList.remove('hidden');
    }

    // Update work area class for styling
    workArea.className = `work-area state-${state}`;
  }

  updateNavigationState(state) {
    // Update any navigation indicators, progress bars, etc.
    const progress = this.getProgressForState(state);
    this.updateProgressIndicator(progress);
  }

  getProgressForState(state) {
    const stateProgress = {
      'fresh': 0,
      'designing': 25,
      'reviewing': 75,
      'deploying': 100
    };
    return stateProgress[state] || 0;
  }

  updateProgressIndicator(progress) {
    // Could add a progress bar or other visual indicator
    document.documentElement.style.setProperty('--workflow-progress', `${progress}%`);
  }

  handleChatSubmit() {
    const input = document.getElementById('chatInputV2');
    const message = input?.value.trim();
    
    if (!message) return;

    // Clear input
    input.value = '';
    
    // Handle through unified chat manager
    this.chatManager.processMessage(message);
  }

  startConversation() {
    const chatInput = document.getElementById('chatInputV2');
    if (chatInput) {
      chatInput.focus();
      chatInput.placeholder = "What would you like to change on this page?";
    }
    
    // Scroll to chat if needed
    document.getElementById('livePanel')?.scrollIntoView({ behavior: 'smooth' });
  }

  toggleCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    if (!overlay) return;

    if (overlay.classList.contains('hidden')) {
      overlay.classList.remove('hidden');
      document.getElementById('paletteSearch')?.focus();
    } else {
      overlay.classList.add('hidden');
    }
  }

  toggleLivePanel() {
    const panel = document.getElementById('livePanel');
    if (!panel) return;

    panel.classList.toggle('collapsed');
    
    // Update toggle button
    const toggle = document.getElementById('panelToggle');
    if (toggle) {
      toggle.textContent = panel.classList.contains('collapsed') ? '→' : '←';
    }
  }

  toggleCodeDrawer() {
    const drawer = document.getElementById('codeDrawer');
    if (!drawer) return;

    drawer.classList.toggle('expanded');
    
    // Update toggle button
    const toggle = document.getElementById('drawerToggle');
    if (toggle) {
      toggle.textContent = drawer.classList.contains('expanded') ? '↓' : '↑';
    }
  }

  addActivityItem(message, type = 'info') {
    const container = document.getElementById('streamContentV2');
    if (!container) return;

    const item = document.createElement('div');
    item.className = `activity-item ${type}`;
    
    const icons = {
      'info': 'ℹ️',
      'success': '✅', 
      'error': '❌',
      'warning': '⚠️'
    };
    
    item.innerHTML = `
      <span class="activity-icon">${icons[type] || icons.info}</span>
      <span class="activity-text">${this.escapeHtml(message)}</span>
      <span class="activity-time">${this.formatTime(new Date())}</span>
    `;
    
    container.appendChild(item);
    
    // Keep only last 20 items
    while (container.children.length > 20) {
      container.removeChild(container.firstChild);
    }
    
    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  handleKeyboardShortcuts(e) {
    // Command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.toggleCommandPalette();
    }
    
    // Quick escape
    if (e.key === 'Escape') {
      // Close any open overlays
      document.getElementById('commandPaletteOverlay')?.classList.add('hidden');
    }
    
    // Enter in chat
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chatInputV2') {
      e.preventDefault();
      this.handleChatSubmit();
    }
  }

  handleFeatureFlagChange({ flagName, enabled }) {
    console.log(`🚩 Feature flag changed: ${flagName} = ${enabled}`);
    
    switch (flagName) {
      case 'workspace_v2':
        if (!enabled) {
          this.switchToLegacy();
        }
        break;
      case 'command_palette':
        if (enabled) {
          this.setupCommandPalette();
        }
        break;
    }
  }

  switchToLegacy() {
    console.log('🔄 Switching to legacy interface...');
    
    // Hide V2, show V1
    document.getElementById('appV2').style.display = 'none';
    document.getElementById('appV1').style.display = 'block';
    
    // Disable V2 flag
    window.featureFlags?.disable('workspace_v2');
  }

  bindPerformanceMonitoring() {
    if (!window.featureFlags?.isEnabled('performance_monitoring')) return;

    // Monitor memory usage
    setInterval(() => {
      if (performance.memory) {
        window.featureFlags.reportPerformance('memory_used', performance.memory.usedJSHeapSize);
      }
    }, 30000); // Every 30 seconds

    // Monitor user interactions
    ['click', 'keydown', 'scroll'].forEach(event => {
      document.addEventListener(event, () => {
        this.performanceMetrics.set('last_interaction', Date.now());
      });
    });
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// State classes for clean separation
class FreshState {
  constructor(workspace) {
    this.workspace = workspace;
  }
  
  async enter() {
    console.log('🌟 Entering fresh state');
    // Show welcome interface
  }
  
  async exit() {
    console.log('👋 Exiting fresh state');
  }
}

class DesigningState {
  constructor(workspace) {
    this.workspace = workspace;
  }
  
  async enter() {
    console.log('🎨 Entering designing state');
    // Show variation builder
  }
  
  async exit() {
    console.log('👋 Exiting designing state');
  }
}

class ReviewingState {
  constructor(workspace) {
    this.workspace = workspace;
  }
  
  async enter() {
    console.log('👀 Entering reviewing state');
    // Show preview interface
  }
  
  async exit() {
    console.log('👋 Exiting reviewing state');
  }
}

class DeployingState {
  constructor(workspace) {
    this.workspace = workspace;
  }
  
  async enter() {
    console.log('🚀 Entering deploying state');
    // Show Convert.com integration
  }
  
  async exit() {
    console.log('👋 Exiting deploying state');
  }
}

// Unified Chat Manager
class UnifiedChatManager {
  constructor(options) {
    this.container = options.container;
    this.input = options.input;
    this.legacyBuilder = options.legacyBuilder;
    this.onStateChange = options.onStateChange;
    this.conversationHistory = [];
  }

  async processMessage(message) {
    // Add user message to UI
    this.addMessage('user', message);
    
    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: message });
    
    // Show typing indicator
    this.showTypingIndicator();
    
    try {
      // Use existing legacy chat processing
      await this.legacyBuilder.processChatRequest(message);
      
      this.hideTypingIndicator();
    } catch (error) {
      this.hideTypingIndicator();
      this.addMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
      console.error('Chat processing error:', error);
    }
  }

  addMessage(role, content) {
    if (!this.container) return;

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
    
    this.container.appendChild(messageEl);
    this.container.scrollTop = this.container.scrollHeight;
  }

  showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
      <div class="assistant-avatar">🤖</div>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    
    this.container.appendChild(indicator);
    this.container.scrollTop = this.container.scrollHeight;
  }

  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  formatMessage(content) {
    // Basic markdown-like formatting
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
}

// Command Palette Implementation
class CommandPalette {
  constructor(options) {
    this.commands = options.commands || [];
    this.overlay = document.getElementById('commandPaletteOverlay');
    this.search = document.getElementById('paletteSearch');
    this.results = document.getElementById('paletteResults');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.search) {
      this.search.addEventListener('input', (e) => {
        this.filterCommands(e.target.value);
      });

      this.search.addEventListener('keydown', (e) => {
        this.handleKeyNavigation(e);
      });
    }
  }

  filterCommands(query) {
    if (!this.results) return;

    const filtered = this.commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query.toLowerCase())
    );

    this.results.innerHTML = filtered.map((cmd, index) => `
      <div class="palette-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
        <span class="command-name">${cmd.name}</span>
      </div>
    `).join('');

    // Bind click events
    this.results.querySelectorAll('.palette-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.executeCommand(filtered[index]);
      });
    });
  }

  handleKeyNavigation(e) {
    const items = this.results?.querySelectorAll('.palette-item') || [];
    const selected = this.results?.querySelector('.selected');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Navigate down
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Navigate up
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedIndex = selected ? parseInt(selected.dataset.index) : 0;
      const commands = this.getFilteredCommands();
      if (commands[selectedIndex]) {
        this.executeCommand(commands[selectedIndex]);
      }
    }
  }

  executeCommand(command) {
    if (command && command.action) {
      command.action();
      this.close();
    }
  }

  getFilteredCommands() {
    const query = this.search?.value || '';
    return this.commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  close() {
    if (this.overlay) {
      this.overlay.classList.add('hidden');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkspaceV2);
} else {
  initWorkspaceV2();
}

function initWorkspaceV2() {
  // Wait for legacy builder to be ready
  if (window.experimentBuilder) {
    window.workspaceV2 = new WorkspaceV2(window.experimentBuilder);
  } else {
    // Retry after a short delay
    setTimeout(initWorkspaceV2, 100);
  }
}