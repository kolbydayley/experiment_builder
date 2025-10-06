// Background service worker for Chrome extension
console.log('🚀 Service Worker Loading - Convert.com Experiment Builder');

class ServiceWorker {
  constructor() {
    console.log('🔧 ServiceWorker constructor called');
    this.initializeExtension();
  }

  initializeExtension() {
    console.log('🔄 Initializing extension...');
    
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('✅ Convert.com Experiment Builder installed:', details);
      
      if (details.reason === 'install' || details.reason === 'update') {
        // Set default settings on first install/update
        this.setDefaultSettings();
        // Configure side panel to open on action click
        this.setupSidePanel();
      }
    });

    // Add multiple event listeners to debug what's happening
    console.log('🔧 Setting up event listeners...');
    
    // Test if action events work at all
    chrome.action.onClicked.addListener(async (tab) => {
      console.log('🖱️ ACTION CLICKED - Extension icon clicked, tab:', tab.url);
      console.log('📋 Tab ID:', tab.id, 'Window ID:', tab.windowId);
      
      // Additional debugging: try manual side panel opening as fallback
      try {
        console.log('🔄 Attempting manual side panel open as fallback...');
        console.log('🔍 Tab details:', { id: tab.id, windowId: tab.windowId, url: tab.url });
        
        // First, ensure the side panel is properly configured for this window/tab
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: 'test-sidepanel.html',
          enabled: true
        });
        console.log('✅ Side panel options set for tab');
        
        // Now try to open it
        await chrome.sidePanel.open({ windowId: tab.windowId });
        console.log('✅ Manual side panel open succeeded');
      } catch (error) {
        console.error('❌ Manual side panel open failed:', error.message);
        console.error('Full error:', error);
        
        // Try different approaches
        try {
          console.log('🔄 Trying alternative: open with tab ID...');
          await chrome.sidePanel.open({ tabId: tab.id });
          console.log('✅ Alternative approach succeeded');
        } catch (altError) {
          console.error('❌ Alternative approach failed:', altError.message);
          
          try {
            console.log('🔄 Trying global side panel open...');
            await chrome.sidePanel.open({});
            console.log('✅ Global approach succeeded');
          } catch (globalError) {
            console.error('❌ Global approach failed:', globalError.message);
            
            // Final check: verify side panel path exists
            console.log('🔍 Final diagnostics:');
            console.log('  - Current manifest side_panel path: test-sidepanel.html');
            console.log('  - Chrome APIs available:', {
              sidePanel: !!chrome.sidePanel,
              open: !!chrome.sidePanel?.open,
              setOptions: !!chrome.sidePanel?.setOptions
            });
          }
        }
      }
    });
    
    // Add additional event listeners for debugging
    
    // Test tab activation (this should fire when you switch tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      console.log('🔄 TAB ACTIVATED:', activeInfo.tabId);
    });
    
    // Test commands (keyboard shortcuts)
    if (chrome.commands && chrome.commands.onCommand) {
      chrome.commands.onCommand.addListener((command) => {
        console.log('⌨️ COMMAND TRIGGERED:', command);
      });
    }
    
    // Test storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('💾 STORAGE CHANGED:', changes, namespace);
    });
    
    console.log('✅ All event listeners registered');
    
    // Add a heartbeat to verify service worker stays alive
    setInterval(() => {
      console.log('💓 Service worker heartbeat - ' + new Date().toLocaleTimeString());
    }, 30000); // Every 30 seconds

    // Handle messages from content scripts and side panel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 MESSAGE RECEIVED:', message.type, 'from:', sender.tab?.url || 'extension');
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      preferCSS: true,
      includeDOMChecks: true,
      outputFormat: 'convert-format',
      authToken: null,
      generationHistory: []
    };

    await chrome.storage.local.set({ settings: defaultSettings });
  }

  async setupSidePanel() {
    try {
      console.log('🔧 Configuring side panel behavior...');
      
      // Check API availability
      console.log('🔍 Side Panel API Check:');
      console.log('  - chrome.sidePanel:', !!chrome.sidePanel);
      console.log('  - setPanelBehavior:', !!chrome.sidePanel?.setPanelBehavior);
      console.log('  - open:', !!chrome.sidePanel?.open);
      console.log('  - setOptions:', !!chrome.sidePanel?.setOptions);
      
      if (!chrome.sidePanel) {
        throw new Error('Side Panel API not available - Chrome version may be too old');
      }
      
      if (!chrome.sidePanel.setPanelBehavior) {
        console.warn('⚠️  setPanelBehavior not available, trying alternative approach...');
        
        // Alternative: Set side panel options directly
        await chrome.sidePanel.setOptions({
          path: 'test-sidepanel.html',
          enabled: true
        });
        console.log('✅ Side panel options set directly');
        return;
      }
      
      // Try multiple side panel configuration approaches
      
      // Approach 1: Set panel behavior
      try {
        await chrome.sidePanel.setPanelBehavior({
          openPanelOnActionClick: true
        });
        console.log('✅ setPanelBehavior configured');
      } catch (behaviorError) {
        console.error('❌ setPanelBehavior failed:', behaviorError.message);
      }
      
      // Approach 2: Set default options
      try {
        await chrome.sidePanel.setOptions({
          path: 'test-sidepanel.html',
          enabled: true
        });
        console.log('✅ setOptions configured globally');
      } catch (optionsError) {
        console.error('❌ setOptions failed:', optionsError.message);
      }
      
      // Approach 3: Try to open it immediately (this might fail but worth trying)
      try {
        console.log('🚪 Attempting immediate side panel open...');
        await chrome.sidePanel.open({});
        console.log('✅ Immediate side panel open succeeded!');
      } catch (immediateError) {
        console.log('ℹ️  Immediate open failed (expected):', immediateError.message);
      }
      
      console.log('✅ Side panel setup complete');
    } catch (error) {
      console.error('❌ Failed to configure side panel:', error);
      console.error('Error details:', error.message);
      
      // Fallback: try basic setup
      try {
        console.log('🔄 Attempting basic side panel setup...');
        await chrome.sidePanel.setOptions({
          path: 'test-sidepanel.html',
          enabled: true
        });
        console.log('✅ Basic side panel setup complete');
      } catch (fallbackError) {
        console.error('❌ Basic setup also failed:', fallbackError.message);
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'GET_TAB_INFO':
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          sendResponse({ success: true, tab });
          break;

        case 'TEST_CONNECTION':
          sendResponse({ success: true, message: 'Service worker connected' });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Initialize service worker
console.log('🚀 Initializing ServiceWorker...');
try {
  const serviceWorker = new ServiceWorker();
  console.log('✅ ServiceWorker initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize ServiceWorker:', error);
}