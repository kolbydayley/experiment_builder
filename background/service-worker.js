// Background service worker for Chrome extension - FIXED VERSION
console.log('🚀 Service Worker Loading - Convert.com Experiment Builder (Fixed)');

class ServiceWorker {
  constructor() {
    console.log('🔧 ServiceWorker constructor called');
    this.initializeExtension();
    this.maxLogEntries = 200;
    this.recentLogs = [];
    this.CAPTURE_TIMEOUT = 15000; // 15 second timeout for captures

    // Simple cache for element databases (reduces repetitive processing)
    this.elementDatabaseCache = new Map();
    this.CACHE_TTL = 60000; // 1 minute cache
  }

  createOperationLogger(context = 'Operation') {
    const entries = [];
    const append = (level, message, extra) => {
      const timestamp = new Date().toISOString();
      const suffix = extra ? ` | ${extra}` : '';
      const formatted = `[${timestamp}] [${context}] ${message}${suffix}`;
      this.storeLogEntry(formatted, level === 'error');
      entries.push(formatted);
      if (level === 'error') {
        console.error(formatted);
      } else {
        console.log(formatted);
      }
    };
    return {
      log: (message, extra) => append('log', message, extra),
      error: (message, extra) => append('error', message, extra),
      entries: () => entries.slice()
    };
  }

  storeLogEntry(entry, isError = false) {
    const record = isError ? `ERROR: ${entry}` : entry;
    this.recentLogs.push(record);
    if (this.recentLogs.length > this.maxLogEntries) {
      this.recentLogs = this.recentLogs.slice(-this.maxLogEntries);
    }
  }

  takeRecentLogs() {
    return this.recentLogs.slice(-this.maxLogEntries);
  }

  async initializeExtension() {
    console.log('🔄 Initializing extension...');

    // CRITICAL FIX: Force migrate settings IMMEDIATELY on load
    await this.forceSettingsMigration();

    chrome.runtime.onInstalled.addListener((details) => {
      console.log('✅ Convert.com Experiment Builder installed:', details);

      if (details.reason === 'install' || details.reason === 'update') {
        this.setDefaultSettings();
        this.setupSidePanel();
      }
    });

    console.log('🔧 Setting up side panel behavior...');
    
    chrome.action.onClicked.addListener(async (tab) => {
      console.log('🖱️ Extension icon clicked, tab:', tab.url);
      
      try {
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: 'sidepanel/sidepanel.html',
          enabled: true
        });
        console.log('✅ Side panel enabled for active tab');

        await chrome.sidePanel.open({
          windowId: tab.windowId
        });
        console.log('✅ Side panel opened successfully');
      } catch (error) {
        console.error('❌ Failed to open side panel:', error);
        
        try {
          await chrome.sidePanel.setPanelBehavior({
            openPanelOnActionClick: true
          });
          console.log('↻ Set panel to open on action click');
        } catch (fallbackError) {
          console.error('❌ Fallback also failed:', fallbackError);
        }
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle message asynchronously and return true to keep channel open
      this.handleMessage(message, sender, sendResponse);
      return true; // ALWAYS return true for async handlers
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.notifyPageChange(tabId, tab);
      }
    });
  }

  async forceSettingsMigration() {
    // Immediate fix for invalid models - runs on EVERY service worker startup
    const result = await chrome.storage.local.get(['settings']);
    const invalidModels = [
      'gpt-4o-mini',
      'claude-sonnet-4-20250514',  // Old, no longer valid
      'claude-3-5-sonnet-20240620', // Never valid
      'claude-3-5-sonnet-20241022'  // Never valid
    ];

    if (result.settings && (invalidModels.includes(result.settings.model) || result.settings.provider === 'openai')) {
      console.log('⚡ FORCE MIGRATING SETTINGS NOW... Current model:', result.settings.model);
      result.settings.provider = 'anthropic';
      result.settings.model = 'claude-3-7-sonnet-20250219'; // Valid Claude 3.7 Sonnet (Recommended)
      await chrome.storage.local.set({ settings: result.settings });
      console.log('✅ Settings force-migrated and saved to storage:', { provider: result.settings.provider, model: result.settings.model });
    } else if (result.settings) {
      console.log('ℹ️ Settings already correct:', { provider: result.settings.provider, model: result.settings.model });
    }
  }

  async setDefaultSettings() {
    const defaultSettings = {
      preferCSS: true,
      includeDOMChecks: true,
      outputFormat: 'convert-format',

      // AI Provider settings
      provider: 'anthropic',  // 'openai' or 'anthropic' - Changed to Anthropic as default
      authToken: '',          // OpenAI API key
      anthropicApiKey: '',    // Anthropic API key (primary)
      model: 'claude-3-7-sonnet-20250219', // Claude 3.7 Sonnet as default (valid model)

      // Fallback configuration
      enableFallback: true,
      fallbackProviders: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'openai', model: 'gpt-4o-mini' }
      ],

      generationHistory: []
    };

    const result = await chrome.storage.local.get(['settings']);
    const existingSettings = result.settings || {};

    // FORCE UPDATE: If model is invalid, update to Claude 3.7 Sonnet
    const invalidModels = [
      'gpt-4o-mini',
      'claude-sonnet-4-20250514',  // Old, no longer valid
      'claude-3-5-sonnet-20240620', // Never valid
      'claude-3-5-sonnet-20241022'  // Never valid
    ];
    let needsMigration = false;
    if (invalidModels.includes(existingSettings.model) || existingSettings.provider === 'openai') {
      console.log('🔄 Migrating settings to valid Anthropic model... From:', existingSettings.model);
      existingSettings.provider = 'anthropic';
      existingSettings.model = 'claude-3-7-sonnet-20250219';
      needsMigration = true;
    }

    const mergedSettings = {
      ...defaultSettings,
      ...existingSettings,
      generationHistory: existingSettings.generationHistory || []
    };

    await chrome.storage.local.set({ settings: mergedSettings });

    if (needsMigration) {
      console.log('✅ Settings migrated and saved:', { provider: mergedSettings.provider, model: mergedSettings.model });
    }
  }

  async setupSidePanel() {
    try {
      console.log('🔧 Configuring side panel behavior...');
      
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
      });
      console.log('✅ Side panel configured to open on action click');

      await chrome.sidePanel.setOptions({
        path: 'sidepanel/sidepanel.html',
        enabled: true
      });
      console.log('✅ Side panel options registered globally');
    } catch (error) {
      console.error('❌ Failed to configure side panel:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    // Wrap entire handler in try/catch to ensure sendResponse is always called
    try {
      switch (message.type) {
        case 'CAPTURE_PAGE': {
          const pageData = await this.capturePage(message.tabId);
          sendResponse({ success: true, data: pageData });
          break;
        }

        case 'GENERATE_CODE': {
          // Use tabId from message data (passed by sidepanel) or fall back to sender tab
          const tabId = message.data?.tabId || sender?.tab?.id;
          console.log('🎯 Generate code for tabId:', tabId);
          const generated = await this.generateCode(message.data, tabId);
          sendResponse({ success: true, code: generated.code, usage: generated.usage, logs: generated.logs, testResults: generated.testResults });
          break;
        }

        case 'ADJUST_CODE':
          const adjustedCode = await this.adjustCode(message.data, sender?.tab?.id);
          sendResponse({ success: true, code: adjustedCode.code, usage: adjustedCode.usage, logs: adjustedCode.logs });
          break;

        case 'GET_AUTH_TOKEN':
          const token = await this.getAuthToken();
          sendResponse({ success: true, token });
          break;

        case 'SAVE_GENERATION':
          await this.saveGeneration(message.data);
          sendResponse({ success: true });
          break;

        case 'TEST_API_KEY':
          const testResult = await this.testApiKey(message.token);
          sendResponse(testResult);
          break;

        case 'ADJUST_CODE':
          const adjusted = await this.adjustCode(message.data);
          sendResponse({ success: true, code: adjusted.code, usage: adjusted.usage, logs: adjusted.logs });
          break;

        case 'GET_HISTORY':
          const history = await this.getHistory();
          sendResponse({ success: true, history });
          break;

        case 'APPLY_VARIATION':
          const applyResult = await this.applyVariationCode(message);
          sendResponse(applyResult);
          break;

        case 'CREATE_CONVERT_EXPERIMENT':
          const experiment = await this.createConvertExperiment(message.data);
          sendResponse({ success: true, data: experiment });
          break;
        
        case 'GET_CONVERT_API_KEYS':
          const keys = await this.getConvertAPIKeys();
          sendResponse({ success: true, keys });
          break;

        case 'CONVERT_LIST_ACCOUNTS':
          try {
            const accounts = await this.fetchConvertAccounts(message.credentials);
            sendResponse({ success: true, accounts });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_LIST_PROJECTS':
          try {
            const projects = await this.fetchConvertProjects(
              message.credentials,
              message.accountId,
              message.options || {}
            );
            sendResponse({ success: true, projects });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_LIST_EXPERIENCES':
          try {
            const experiences = await this.fetchConvertExperiences(message.credentials, {
              accountId: message.accountId,
              projectId: message.projectId,
              options: message.options || {}
            });
            sendResponse({ success: true, experiences });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_GET_EXPERIENCE':
          try {
            const experience = await this.fetchConvertExperience(message.credentials, {
              accountId: message.accountId,
              projectId: message.projectId,
              experienceId: message.experienceId,
              options: message.options || {}
            });
            sendResponse({ success: true, experience });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_CREATE_EXPERIENCE':
          try {
            const createdExperience = await this.createConvertExperienceV2(message.credentials, {
              accountId: message.accountId,
              projectId: message.projectId,
              payload: message.payload
            });
            sendResponse({ success: true, experience: createdExperience });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_UPDATE_VARIATION':
          try {
            const updatedVariation = await this.updateConvertVariation(message.credentials, {
              accountId: message.accountId,
              projectId: message.projectId,
              experienceId: message.experienceId,
              variationId: message.variationId,
              payload: message.payload
            });
            sendResponse({ success: true, variation: updatedVariation });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'CONVERT_UPDATE_EXPERIENCE':
          try {
            const updatedExperience = await this.updateConvertExperience(message.credentials, {
              accountId: message.accountId,
              projectId: message.projectId,
              experienceId: message.experienceId,
              payload: message.payload
            });
            sendResponse({ success: true, experience: updatedExperience });
          } catch (error) {
            sendResponse({ success: false, error: error.message, status: error.status, data: error.data });
          }
          break;

        case 'START_ELEMENT_SELECTION':
          try {
            const result = await this.startElementSelection(message.tabId);
            sendResponse({ success: true, data: result.data });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'CAPTURE_ELEMENT_SCREENSHOT':
          try {
            const screenshot = await this.captureElementScreenshot(message, sender.tab.id);
            sendResponse({ success: true, screenshot });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'CAPTURE_PAGE_WITH_ELEMENT':
          try {
            const logger = this.createOperationLogger('CapturePageWithElement');
            logger.log('Starting element-focused page capture', `selector=${message.selectedElementSelector}`);

            // First, capture page normally to get screenshot
            const pageData = await this.capturePageInternal(message.tabId, logger);

            // Then re-capture with selected element selector for hierarchical context
            logger.log('Re-capturing with element focus');
            const response = await chrome.tabs.sendMessage(message.tabId, {
              type: 'CAPTURE_PAGE_DATA',
              selectedElementSelector: message.selectedElementSelector
            });

            if (response.success) {
              // Merge screenshot from initial capture with hierarchical context
              response.data.screenshot = pageData.screenshot;
              logger.log('Element-focused capture complete',
                `mode=${response.data.context?.mode}, tokens=${response.data.context?.metadata?.estimatedTokens}`);
              sendResponse({ success: true, data: response.data });
            } else {
              logger.error('Failed to capture with element focus', response.error);
              sendResponse({ success: false, error: response.error });
            }
          } catch (error) {
            console.error('CAPTURE_PAGE_WITH_ELEMENT error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'ELEMENT_SELECTED':
          // Forward element selection data from content script to sidepanel
          try {
            console.log('🎯 Forwarding ELEMENT_SELECTED to sidepanel:', message.data);
            
            // Store the data and let sidepanel poll for it, or use a different approach
            // For now, we'll try to broadcast the message to all extension contexts
            setTimeout(() => {
              try {
                chrome.runtime.sendMessage({
                  type: 'ELEMENT_SELECTED',
                  data: message.data
                }).catch(err => {
                  console.log('📨 Message sent (expected error for broadcast):', err.message);
                });
              } catch (err) {
                console.log('📨 Unable to broadcast message:', err.message);
              }
            }, 10);
            
            sendResponse({ success: true });
          } catch (error) {
            console.error('Failed to forward ELEMENT_SELECTED:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'ELEMENT_SELECTION_CANCELLED':
          // Forward cancellation from content script to sidepanel
          try {
            console.log('🎯 Forwarding ELEMENT_SELECTION_CANCELLED to sidepanel');
            
            setTimeout(() => {
              try {
                chrome.runtime.sendMessage({
                  type: 'ELEMENT_SELECTION_CANCELLED'
                }).catch(err => {
                  console.log('📨 Cancellation message sent (expected error for broadcast):', err.message);
                });
              } catch (err) {
                console.log('📨 Unable to broadcast cancellation message:', err.message);
              }
            }, 10);
            
            sendResponse({ success: true });
          } catch (error) {
            console.error('Failed to forward ELEMENT_SELECTION_CANCELLED:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'PREVIEW_VARIATION':
          try {
            // Use passed tabId or fallback to querying for active tab
            let tabId = message.tabId;
            if (!tabId) {
              const tabs = await chrome.tabs.query({active: true, currentWindow: true});
              if (!tabs[0]) {
                throw new Error('No active tab found');
              }
              tabId = tabs[0].id;
            }

            await chrome.tabs.sendMessage(tabId, {
              action: 'previewCode',
              css: message.css,
              js: message.js,
              variationNumber: message.variationNumber
            });

            sendResponse({ success: true });
          } catch (error) {
            console.error('Preview variation error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'TEST_VARIATION':
          try {
            // Use passed tabId or fallback to querying for active tab
            let tabId = message.tabId;
            if (!tabId) {
              const tabs = await chrome.tabs.query({active: true, currentWindow: true});
              if (!tabs[0]) {
                throw new Error('No active tab found');
              }
              tabId = tabs[0].id;
            }

            await chrome.tabs.sendMessage(tabId, {
              action: 'testCode',
              css: message.css,
              js: message.js,
              variationNumber: message.variationNumber
            });

            sendResponse({ success: true });
          } catch (error) {
            console.error('Test variation error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'CLEAR_PREVIEW':
          try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
              throw new Error('No active tab found');
            }

            await chrome.tabs.sendMessage(tabs[0].id, {
              action: 'clearPreview'
            });

            sendResponse({ success: true });
          } catch (error) {
            console.error('Clear preview error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'VALIDATE_SYNTAX':
          try {
            const validation = this.validateCodeSyntax(message.css, message.js);
            sendResponse({ success: true, validation });
          } catch (error) {
            console.error('Syntax validation error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'CHECK_PAGE_ERRORS':
          try {
            // Use passed tabId or fallback to querying for active tab
            let tabId = message.tabId;
            if (!tabId) {
              const tabs = await chrome.tabs.query({active: true, currentWindow: true});
              if (!tabs[0]) {
                throw new Error('No active tab found');
              }
              tabId = tabs[0].id;
            }

            const response = await chrome.tabs.sendMessage(tabId, {
              action: 'checkErrors',
              variationNumber: message.variationNumber
            });

            sendResponse({ success: true, hasErrors: response.hasErrors, errors: response.errors });
          } catch (error) {
            console.error('Page error check failed:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'CAPTURE_AFTER_INJECTION':
          try {
            // Use passed tabId or fallback to querying for active tab
            let tabId = message.tabId;
            if (!tabId) {
              const tabs = await chrome.tabs.query({active: true, currentWindow: true});
              if (!tabs[0]) {
                throw new Error('No active tab found');
              }
              tabId = tabs[0].id;
            }

            // Get the window ID for the tab to capture the correct window
            const tab = await chrome.tabs.get(tabId);
            const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            sendResponse({ success: true, screenshot });
          } catch (error) {
            console.error('After-injection capture failed:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'VISUAL_QA_VALIDATION':
          try {
            console.log('🎨 Starting visual QA validation...');
            const validationResult = await this.performVisualQAValidation(message.data);
            sendResponse({ success: true, validation: validationResult });
          } catch (error) {
            console.error('Visual QA validation failed:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      const recentLogs = this.takeRecentLogs();
      sendResponse({ success: false, error: error.message, logs: recentLogs });
    }
  }

  // FIXED: Simplified capture with better timeout handling
  async capturePage(tabId) {
    const logger = this.createOperationLogger('CapturePage');
    
    try {
      logger.log('Starting page capture', `tabId=${tabId}`);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Page capture timed out after 15 seconds')), this.CAPTURE_TIMEOUT);
      });
      
      // Race capture against timeout
      const pageData = await Promise.race([
        this.capturePageInternal(tabId, logger),
        timeoutPromise
      ]);
      
      logger.log('Page capture completed successfully');
      return pageData;
      
    } catch (error) {
      logger.error('Page capture failed', error.message);
      throw error;
    }
  }

  async capturePageInternal(tabId, logger) {
    // Step 1: Validate tab
    const tab = await chrome.tabs.get(tabId);
    if (!this.isCapturePermitted(tab.url)) {
      throw new Error('This type of page cannot be captured. Try a standard http(s) page in another tab.');
    }
    logger.log('Tab validated', `url=${tab.url}`);

    // Step 2: Ensure content script is loaded
    logger.log('Ensuring content script is loaded');
    await this.ensureContentScriptLoaded(tabId);
    
    // Step 3: Reset scroll position (with timeout)
    logger.log('Resetting scroll position');
    try {
      await Promise.race([
        chrome.scripting.executeScript({
          target: { tabId },
          function: () => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
        }),
        this.wait(500)
      ]);
    } catch (scrollError) {
      logger.log('Scroll reset skipped', scrollError.message);
    }
    
    await this.wait(100);
    
    // Step 4: Capture screenshot (SIMPLIFIED - no zoom adjustment)
    logger.log('Capturing screenshot');
    let screenshot = null;
    try {
      screenshot = await Promise.race([
        chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        }),
        this.wait(5000).then(() => { throw new Error('Screenshot timeout'); })
      ]);
      logger.log('Screenshot captured successfully');
    } catch (screenshotError) {
      logger.log('Screenshot capture failed, continuing without it', screenshotError.message);
      screenshot = null;
    }

    // Step 5: Get element database from content script (with timeout)
    logger.log('Requesting element database from content script');
    let elementDatabase = null;

    try {
      // Pass selectedElementSelector if this is an element-focused capture
      const message = {
        type: 'CAPTURE_PAGE_DATA',
        selectedElementSelector: null // Will be set by element selection flow
      };

      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, message),
        this.wait(8000).then(() => ({ success: false, error: 'Content script response timeout' }))
      ]);

      if (response?.success && response.data?.elementDatabase) {
        elementDatabase = response.data.elementDatabase;
        const contextMode = response.data?.context?.mode || 'unknown';
        logger.log('Element database received', `mode=${contextMode}, elements=${elementDatabase.elements?.length || 0}`);
      } else {
        throw new Error(response?.error || 'No element database in response');
      }
    } catch (dbError) {
      logger.error('Failed to get element database', dbError.message);
      throw new Error(`Unable to build element database: ${dbError.message}. Try reloading the page and capturing again.`);
    }

    // Step 6: Validate element database
    if (!elementDatabase || !elementDatabase.elements || elementDatabase.elements.length === 0) {
      throw new Error('Element database is empty. The page may not have loaded properly. Try reloading the page.');
    }

    logger.log('Page capture completed', `elements=${elementDatabase.elements.length}`);

    return {
      url: tab.url,
      title: tab.title,
      screenshot,
      elementDatabase,
      timestamp: Date.now()
    };
  }

  // NEW: Ensure content script is loaded before trying to use it
  async ensureContentScriptLoaded(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      console.log('✅ Content scripts already loaded');
      return true;
    } catch (error) {
      // Content script not loaded, inject all required scripts
      console.log('📦 Content scripts not found, injecting all dependencies...');
      try {
        // Inject scripts in the correct order (dependencies first)
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'utils/selector-validator.js',
            'utils/code-tester.js',
            'utils/context-builder.js',
            'content-scripts/page-capture.js',
            'content-scripts/element-selector.js'
          ]
        });
        // Give scripts time to initialize
        await this.wait(500);

        // Verify scripts loaded by pinging again
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          console.log('✅ All content scripts injected and verified');
          return true;
        } catch (pingError) {
          throw new Error('Content scripts injected but failed to respond');
        }
      } catch (injectError) {
        console.error('❌ Failed to inject content scripts:', injectError);
        throw new Error('Unable to inject content scripts. The page may have restrictions or require a reload.');
      }
    }
  }

  async startElementSelection(tabId) {
    try {
      // Validate tab
      const tab = await chrome.tabs.get(tabId);
      if (!this.isCapturePermitted(tab.url)) {
        throw new Error('Element selection is not permitted on this type of page. Try a standard http(s) page.');
      }

      // Check if element selector is already loaded
      console.log('Checking if element selector is already loaded...');
      let selectorReady = false;
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING_ELEMENT_SELECTOR' });
        selectorReady = true;
        console.log('Element selector already loaded');
      } catch (error) {
        console.log('Element selector not loaded, injecting...');
      }

      // Inject the element selector content script if not already loaded
      if (!selectorReady) {
        console.log('Injecting element selector content script...');
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/element-selector.js']
        });

        // Give it a moment to initialize
        await this.wait(200);
      }
      
      // Activate element selection mode and wait for element to be selected
      console.log('Activating element selection mode...');
      const result = await chrome.tabs.sendMessage(tabId, { type: 'START_ELEMENT_SELECTION' });
      
      console.log('Element selection completed:', result);
      return result;
    } catch (error) {
      console.error('Failed to start element selection:', error);
      throw new Error(`Unable to start element selection: ${error.message}`);
    }
  }

  async captureElementScreenshot(data, tabId) {
    try {
      console.log('Capturing element screenshot for data:', data);
      
      // Get the tab to find the window
      const tab = await chrome.tabs.get(tabId);
      
      // Capture the full page screenshot
      const fullScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
      });
      
      // Send the full screenshot to the content script for cropping
      const croppedScreenshot = await chrome.tabs.sendMessage(tabId, {
        type: 'CROP_SCREENSHOT',
        screenshot: fullScreenshot,
        rect: data.rect,
        viewport: data.viewport
      });
      
      console.log('Element screenshot captured and cropped successfully');
      return croppedScreenshot;
    } catch (error) {
      console.error('Failed to capture element screenshot:', error);
      return null;
    }
  }

  async generateCode(data, tabId = null) {
    const { pageData, description, designFiles, variations, settings, selectedElement } = data;
    const logger = this.createOperationLogger('GenerateCode');
    
    // Log Visual QA context
    if (selectedElement) {
      logger.log('Element-focused generation', `selector=${selectedElement.selector}, hasScreenshot=${!!selectedElement.screenshot}`);
    }
    if (designFiles?.length) {
      logger.log('Design file context', `files=${designFiles.length}`);
    }
    
    try {
      console.log('🎯 Service worker generateCode received data:', {
        hasPageData: !!pageData,
        pageDataKeys: pageData ? Object.keys(pageData) : 'no pageData',
        pageDataUrl: pageData?.url,
        pageDataTitle: pageData?.title
      });
      
      const authToken = await this.getAuthToken();
      if (!authToken) {
        throw new Error('OpenAI API key missing. Add one in the side panel settings.');
      }

      logger.log('Using Element Database', `elements=${pageData.elementDatabase?.elements?.length || 0}`);

      if (!pageData.elementDatabase || !pageData.elementDatabase.elements) {
        throw new Error('Element database not found in page data. Please recapture the page.');
      }

      // Log selected element info
      if (selectedElement) {
        console.log('🎯 SELECTED ELEMENT INFO:');
        console.log(`  Selector: ${selectedElement.selector}`);
        console.log(`  Tag: ${selectedElement.tag}`);
        console.log(`  Text: "${selectedElement.textContent?.substring(0, 50)}"`);
        logger.log('User selected element', `selector=${selectedElement.selector}`);
      } else {
        console.log('⚠️ NO ELEMENT SELECTED - AI will choose from all elements');
      }

      logger.log('Generating code with Element Database');
      const prompt = this.buildCodeGenerationPrompt(
        pageData,
        description,
        designFiles,
        variations,
        settings,
        selectedElement
      );
      
      // Log final prompt statistics
      console.log('📊 Final Prompt Analysis:');
      console.log(`  📏 Total Length: ${prompt.length} characters`);
      console.log(`  🔢 Estimated Tokens: ${Math.ceil(prompt.length / 4)} (rough estimate)`);
      console.log(`  🎯 Token Limit Check: ${Math.ceil(prompt.length / 4) > 250000 ? '⚠️ MAY EXCEED LIMIT' : '✅ WITHIN LIMITS'}`);

      // Log first 10 selectors being sent to AI
      const selectorList = prompt.match(/\*\*YOU MUST ONLY USE THESE SELECTORS[\s\S]*?(?=\*\*IF YOU USE)/)?.[0];
      if (selectorList) {
        const selectors = selectorList.match(/"([^"]+)"/g);
        console.log('🎯 First 10 selectors sent to AI:', selectors?.slice(0, 10));
      }

      const messages = [{
        role: 'system',
        content: `You are an expert at generating clean, production-ready JavaScript and CSS code for A/B tests using only vanilla JavaScript.

CRITICAL CONSTRAINT: You will be given a list of valid CSS selectors. You MUST use ONLY these exact selectors in your code. Do NOT create, modify, or invent any selectors. If you use a selector not in the provided list, the code will fail completely.

When you see "YOU MUST ONLY USE THESE SELECTORS" in the user's message, that list is the ONLY source of valid selectors. Copy them character-by-character.`
      }];

      // Temporarily disable screenshots to reduce token usage
      // Use element database instead of vision for better token efficiency
      messages.push({
        role: 'user',
        content: prompt
      });
      logger.log('Using text-only mode', 'optimized for token efficiency');
      
      // Get stored settings to use correct defaults
      const storedSettings = await chrome.storage.local.get(['settings']);

      // DEBUG: Log what's in storage
      console.log('📦 Storage settings:', {
        provider: storedSettings.settings?.provider,
        model: storedSettings.settings?.model
      });
      console.log('📥 Passed settings:', {
        provider: settings?.provider,
        model: settings?.model
      });

      const mergedSettings = { ...storedSettings.settings, ...settings };
      console.log('🔀 Merged settings:', {
        provider: mergedSettings?.provider,
        model: mergedSettings?.model
      });

      // Use unified AI call that routes to correct provider
      const aiSettings = {
        provider: mergedSettings?.provider || 'anthropic', // Default to Anthropic
        authToken: mergedSettings?.authToken || authToken,
        anthropicApiKey: mergedSettings?.anthropicApiKey,
        model: mergedSettings?.model || 'claude-3-7-sonnet-20250219' // Default to Claude 3.7 Sonnet
      };

      console.log('🎯 Final AI Settings:', { provider: aiSettings.provider, model: aiSettings.model, hasAnthropicKey: !!aiSettings.anthropicApiKey, hasOpenAIKey: !!aiSettings.authToken });

      const aiResponse = await this.callAI(messages, aiSettings);
      logger.log('Code generated', `provider=${aiSettings.provider}, tokens=${aiResponse.usage?.promptTokens || 0}`);

      let parsedCode = this.parseGeneratedCode(aiResponse.content);
      logger.log('Code parsed', `variations=${parsedCode.variations.length}`);

      // ✨ VALIDATION: Check if selectors exist in database
      const validationWarnings = this.validateSelectorsAgainstDatabase(parsedCode, pageData.elementDatabase);
      if (validationWarnings.length > 0) {
        logger.log('Selector validation warnings', `${validationWarnings.length} selectors not found in database`);
        validationWarnings.forEach(warning => logger.log('Invalid selector', warning));

        // ✨ AUTO-FIX: Replace generic selectors with specific ones from database
        logger.log('Auto-fixing generic selectors', 'Replacing with database selectors...');
        parsedCode = this.fixGenericSelectors(parsedCode, pageData.elementDatabase, tabId);
        logger.log('Auto-fix complete', 'Generic selectors replaced');
      }

      // ✨ NEW: Automatic code testing and application pipeline (only if tabId available)
      let testResults = null;
      if (tabId) {
        logger.log('Testing generated code', 'Running automatic validation...');
        testResults = await this.testGeneratedCode(parsedCode, tabId);
        logger.log('Testing complete', `status=${testResults.overallStatus}, errors=${testResults.totalErrors}, warnings=${testResults.totalWarnings}`);

        // Apply the first variation to the page (preview mode)
        if (parsedCode.variations && parsedCode.variations.length > 0) {
          logger.log('Applying code to page', 'Injecting variation 1 for preview...');
          try {
            const variation = parsedCode.variations[0];
            await this.applyVariationCode({
              tabId: tabId,
              css: variation.css || '',
              js: variation.js || '',
              key: `variation-${variation.number || 1}`
            });
            logger.log('Code applied successfully', 'Variation 1 is now live on page');
          } catch (error) {
            logger.error('Failed to apply code', error.message);
          }
        }
      } else {
        logger.log('Testing skipped', 'No tabId available');
      }

      return {
        code: parsedCode,
        testResults: testResults,
        usage: this.normalizeUsage(aiResponse),
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Code generation failed', error?.message);
      throw error;
    }
  }

  /**
   * Test generated code automatically
   * Runs test suite in content script context
   */
  async testGeneratedCode(parsedCode, tabId) {
    const allResults = {
      overallStatus: 'pass',
      totalErrors: 0,
      totalWarnings: 0,
      variationResults: []
    };

    try {
      // Test each variation
      for (const variation of parsedCode.variations) {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'TEST_CODE',
          variation: variation
        });

        if (response.success) {
          allResults.variationResults.push(response.testResult);

          if (response.testResult.overallStatus === 'fail') {
            allResults.overallStatus = 'fail';
            allResults.totalErrors += response.testResult.errors.length;
          }

          allResults.totalWarnings += response.testResult.warnings.length;
        }
      }

    } catch (error) {
      console.error('Code testing failed:', error);
      allResults.overallStatus = 'error';
      allResults.error = error.message;
    }

    return allResults;
  }

  /**
   * Fix generic selectors by replacing them with specific ones from database
   */
  fixGenericSelectors(parsedCode, elementDatabase, tabId) {
    if (!elementDatabase?.elements) return parsedCode;

    // Build map of generic to specific selectors
    const selectorMap = new Map();

    // Find all generic selectors (those that match multiple elements)
    elementDatabase.elements.forEach(el => {
      const selector = el.selector;

      // If selector contains nth-child or has an ID, it's likely specific
      if (selector.includes(':nth-child') || selector.includes('#')) {
        // Check if there's a simpler class-based selector that matches this element
        const tag = el.tag;
        const classes = el.classes;

        if (classes && classes.length > 0) {
          // Try class combinations
          const classSelector = `${tag}.${classes.join('.')}`;

          // Map the generic selector to the specific one
          selectorMap.set(classSelector, selector);

          // Also try with fewer classes
          if (classes.length > 1) {
            selectorMap.set(`${tag}.${classes[0]}`, selector);
            selectorMap.set(`${tag}.${classes.slice(0, 2).join('.')}`, selector);
          }
        }
      }
    });

    console.log('🔧 Selector replacement map:', Array.from(selectorMap.entries()).slice(0, 5));

    // Replace selectors in the code
    const replaceInCode = (code) => {
      if (!code) return code;

      let fixedCode = code;
      selectorMap.forEach((specificSelector, genericSelector) => {
        // Replace in CSS
        const cssPattern = new RegExp(genericSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s{:,])', 'g');
        fixedCode = fixedCode.replace(cssPattern, specificSelector);

        // Replace in waitForElement calls
        const jsPattern = new RegExp(`(['"\`])${genericSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g');
        fixedCode = fixedCode.replace(jsPattern, `$1${specificSelector}$1`);
      });

      return fixedCode;
    };

    // Apply fixes to all variations
    parsedCode.variations?.forEach(variation => {
      if (variation.css) {
        variation.css = replaceInCode(variation.css);
      }
      if (variation.js) {
        variation.js = replaceInCode(variation.js);
      }
    });

    if (parsedCode.globalCSS) {
      parsedCode.globalCSS = replaceInCode(parsedCode.globalCSS);
    }
    if (parsedCode.globalJS) {
      parsedCode.globalJS = replaceInCode(parsedCode.globalJS);
    }

    return parsedCode;
  }

  /**
   * Validate that generated selectors exist in the element database
   */
  validateSelectorsAgainstDatabase(parsedCode, elementDatabase) {
    const warnings = [];
    const validSelectors = new Set();

    // Build set of valid selectors from database
    if (elementDatabase && elementDatabase.elements) {
      elementDatabase.elements.forEach(el => {
        validSelectors.add(el.selector);
        if (el.alternativeSelectors) {
          el.alternativeSelectors.forEach(alt => validSelectors.add(alt));
        }
      });
    }

    // Extract selectors from generated code
    const extractSelectorsFromCode = (code) => {
      if (!code) return [];
      const selectors = [];

      // Extract from CSS (selector before {)
      const cssMatches = code.matchAll(/([^{}]+)\s*\{/g);
      for (const match of cssMatches) {
        const selector = match[1].trim().split(',').map(s => s.trim());
        selectors.push(...selector);
      }

      // Extract from waitForElement calls
      const jsMatches = code.matchAll(/waitForElement\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const match of jsMatches) {
        selectors.push(match[1]);
      }

      return selectors;
    };

    // Check each variation
    parsedCode.variations?.forEach((variation, idx) => {
      const cssSelectors = extractSelectorsFromCode(variation.css);
      const jsSelectors = extractSelectorsFromCode(variation.js);

      [...cssSelectors, ...jsSelectors].forEach(selector => {
        // Remove pseudo-classes/elements for comparison
        const cleanSelector = selector.replace(/:hover|:active|:focus|::before|::after/g, '').trim();
        if (cleanSelector && !validSelectors.has(cleanSelector)) {
          warnings.push(`Variation ${idx + 1}: "${cleanSelector}" not found in element database`);
        }
      });
    });

    return warnings;
  }

  /**
   * Compact element data to reduce token usage
   * Removes verbose fields while keeping essential information
   */
  compactElementData(element) {
    return {
      selector: element.selector,
      tag: element.tag,
      text: element.text ? element.text.substring(0, 80) : '', // Truncate long text
      level: element.level,
      visual: element.visual ? {
        bg: element.visual.backgroundColor,
        color: element.visual.color,
        w: element.visual.position?.width || element.visual.dimensions?.width,
        h: element.visual.position?.height || element.visual.dimensions?.height
      } : null,
      classes: element.classes || element.className?.split(' ').slice(0, 3),
      id: element.id || element.attributes?.id,
      section: element.context?.section || element.section
    };
  }

  buildCodeGenerationPrompt(pageData, description, designFiles, variations, settings, selectedElement = null) {
    // Check if we have hierarchical context (new system) or legacy element database
    const hasHierarchicalContext = pageData.context && pageData.context.mode;

    let topElements, metadata, contextMode;

    if (hasHierarchicalContext) {
      // NEW SYSTEM: Use hierarchical context
      contextMode = pageData.context.mode;
      metadata = pageData.context.metadata;

      // Combine all context levels, removing screenshots and optimizing for size
      topElements = [
        ...pageData.context.primary,
        ...pageData.context.proximity,
        ...pageData.context.structure
      ].map(element => this.compactElementData(element));

      console.log('🆕 Using hierarchical context system');
      console.log(`  📊 Mode: ${contextMode}`);
      console.log(`  🎯 Primary: ${pageData.context.primary.length}`);
      console.log(`  🔗 Proximity: ${pageData.context.proximity.length}`);
      console.log(`  🏗️ Structure: ${pageData.context.structure.length}`);
      console.log(`  💰 Estimated Tokens: ${metadata.estimatedTokens}`);
    } else {
      // LEGACY SYSTEM: Use element database with optimization
      contextMode = 'legacy';
      topElements = pageData.elementDatabase.elements
        .slice(0, 35) // Reduced from 50 to 35 for faster processing
        .map(element => this.compactElementData(element));
      metadata = pageData.elementDatabase.metadata;
      console.log('🔄 Using legacy element database');
    }

    // Filter elements to selected scope if user selected an element
    if (selectedElement && selectedElement.selector) {
      const originalCount = topElements.length;
      const selectedSelector = selectedElement.selector;

      // Keep only elements that are descendants of the selected element
      // Check if selector starts with selected selector or contains it as parent
      topElements = topElements.filter(el => {
        // Don't filter out the selected element itself
        if (el.selector === selectedSelector) return true;

        // Check if this element's selector indicates it's a child
        // For example: "#hero > button" is child of "#hero"
        // Or "div.hero button" is child of "div.hero"
        return el.selector && el.selector.includes(selectedSelector);
      });

      console.log(`🔍 Filtered elements to selected scope: ${originalCount} → ${topElements.length} elements`);
      console.log(`  📍 Scope: ${selectedSelector}`);

      // If filtering removed everything, keep original list (safety fallback)
      if (topElements.length === 0) {
        console.warn('⚠️ Filtering removed all elements - using full list');
        topElements = pageData.elementDatabase?.elements
          ?.slice(0, 35)
          .map(element => this.compactElementData(element)) || [];
      }
    }

    // Add token usage logging
    const elementsJSON = JSON.stringify(topElements, null, 2);
    metadata = metadata || pageData.elementDatabase?.metadata || {};
    
    // Log token usage by component
    console.log('🔍 Token Usage Analysis:');
    console.log(`  📊 Elements JSON: ${elementsJSON.length} chars`);
    console.log(`  📄 Description: ${description?.length || 0} chars`);
    console.log(`  🎯 Variations: ${JSON.stringify(variations).length} chars`);
    console.log(`  🖼️ Has Screenshot: ${!!pageData.screenshot}`);
    console.log(`  📋 Total Elements: ${topElements.length}`);
    
    // Log individual element sizes
    topElements.forEach((element, index) => {
      const elementSize = JSON.stringify(element).length;
      if (elementSize > 1000) { // Log large elements
        console.log(`  ⚠️ Large Element ${index}: ${elementSize} chars (${element.tag}#${element.id || 'no-id'}.${element.classes?.join('.') || 'no-class'})`);
      }
    });
    
    // Log specific large data within elements
    topElements.forEach((element, index) => {
      if (element.html && element.html.length > 500) {
        console.log(`  📝 Large HTML ${index}: ${element.html.length} chars`);
      }
      if (element.screenshot && element.screenshot.length > 1000) {
        console.log(`  📸 Element Screenshot ${index}: ${element.screenshot.length} chars`);
      }
      if (element.innerHTML && element.innerHTML.length > 500) {
        console.log(`  🏗️ Large innerHTML ${index}: ${element.innerHTML.length} chars`);
      }
    });

    // Build context-aware instructions
    const contextInstructions = hasHierarchicalContext && contextMode === 'element-focused'
      ? `
**CONTEXT MODE: ELEMENT-FOCUSED**
The user selected a specific element to modify. The database is organized hierarchically:
- PRIMARY (level: "primary"): The selected element with FULL detail - FOCUS YOUR CHANGES HERE
- PROXIMITY (level: "proximity"): Nearby elements for visual context and harmony
- STRUCTURE (level: "structure"): Page landmarks for understanding overall layout

When generating code, focus primarily on PRIMARY elements while considering proximity for consistency.
${metadata.focusPath ? `\n**SELECTED ELEMENT PATH:** ${metadata.focusPath}` : ''}
`
      : `
**CONTEXT MODE: FULL-PAGE**
The database contains the most important interactive elements across the entire page.
Elements are ranked by importance (position, size, interactivity).
`;

    // Build streamlined prompt (30% shorter while maintaining quality)
    const coreRules = `**CRITICAL RULES:**
1. ⚠️ MUST use EXACT selectors from database - DO NOT make up selectors
2. ❌ WRONG: 'button.btn.btn--primary' (made up selector)
3. ✅ CORRECT: Use actual selectors from elements list below
4. Match by: text content, tag type, position on page
5. Vanilla JS only - no jQuery
6. IMPLEMENT ALL requested changes (text AND color if both mentioned)
7. Prevent duplicates: if(element.dataset.varApplied) return;
8. **FOR COLOR CHANGES: Use CSS section with !important flags (most reliable)**
9. Text changes: element.textContent='new text' (use JS)
10. CSS overrides inline styles - prefer CSS for visual changes

**SELECTOR REQUIREMENT - READ CAREFULLY:**
Every element in the database has a "selector" field - you MUST copy this exact selector.
If you generate ANY selector not found in the database, the code will FAIL.`;

    // Build selected element context for Visual QA
    let selectedElementContext = '';
    let selectedElementHeader = '';
    if (selectedElement) {
      selectedElementHeader = `

🎯🎯🎯 USER SELECTED A CONTEXT AREA 🎯🎯🎯

**SELECTED AREA (SEARCH SCOPE):**
Selector: ${selectedElement.selector}
Text Preview: "${(selectedElement.textContent || '').substring(0, 60)}..."
Tag: ${selectedElement.tag}

**CRITICAL - HOW TO USE THE SELECTED AREA:**
The user clicked on this area to NARROW THE FOCUS of your changes.
This is the CONTEXT/SCOPE - NOT necessarily what you should modify.

**EXAMPLES:**
- User selects hero section, says "change button color" → Find BUTTON inside hero section
- User selects nav bar, says "update link text" → Find LINK inside nav bar
- User selects entire page (body/div), says "make heading blue" → Find HEADING anywhere

**ONLY modify the selected ${selectedElement.tag} itself if:**
- User says "change the background"
- User says "modify this section"
- User says "style the container"

Otherwise, find child elements WITHIN "${selectedElement.selector}" that match the description.

`;

      selectedElementContext = `

**🎯 SELECTED AREA (CONTEXT SCOPE):**
- Container: ${selectedElement.selector}
- Type: ${selectedElement.tag}
- Contains: "${(selectedElement.textContent || '').substring(0, 100)}"
${selectedElement.screenshot ? '- 📸 Screenshot: Available for visual reference' : ''}

**SEARCH STRATEGY:**
1. Parse the user's request to identify target elements (button, heading, link, etc.)
2. Find those elements WITHIN the selected area (${selectedElement.selector})
3. Apply changes to the matched elements, NOT to the container itself
`;
    }

    // If user selected an element, put it first in the selector list
    let orderedElements = [...topElements];
    if (selectedElement && selectedElement.selector) {
      // Remove selected element from list if it exists
      orderedElements = orderedElements.filter(el => el.selector !== selectedElement.selector);
      // Add it to the beginning
      orderedElements.unshift({
        selector: selectedElement.selector,
        tag: selectedElement.tag,
        text: selectedElement.textContent || '',
        level: 'primary'
      });
    }

    // Use selected element in example if available
    const exampleSelector = selectedElement?.selector || orderedElements[0]?.selector || 'button.cta';

    const exampleCode = `// BEST PRACTICE: Use CSS for color/size changes, JS for text/behavior
// CSS (most reliable for visual changes):
${exampleSelector} {
  background-color: red !important;
  color: white !important;
  font-size: 18px !important;
}

// JavaScript (for text and behavior):
waitForElement('${exampleSelector}', (el) => {
  if(el.dataset.varApplied) return;
  el.textContent = 'New Text';
  el.dataset.varApplied = '1';
});

// ❌ NEVER do this (made up selector):
waitForElement('button.btn.btn--primary', ...)

// ✅ ALWAYS copy selector from database:
waitForElement('${exampleSelector}', ...)`;

    return `⚠️⚠️⚠️ CRITICAL - READ THIS FIRST ⚠️⚠️⚠️
${selectedElementHeader}
**YOU MUST ONLY USE THESE SELECTORS - NO OTHERS:**
${orderedElements.map((el, i) => `${i + 1}. "${el.selector}"${i === 0 && selectedElement ? ' ⭐ USER-SELECTED ELEMENT' : ''}`).join('\n')}

**IF YOU USE ANY SELECTOR NOT IN THE LIST ABOVE, THE CODE WILL FAIL.**

Generate A/B test code using this ELEMENT DATABASE.

**REQUEST:** ${description}
${selectedElementContext}
${contextInstructions}
**PAGE:** ${metadata.url}

**ELEMENTS WITH TEXT CONTENT (for matching):**
${topElements.slice(0, 15).map((el, i) => `${i + 1}. "${el.selector}" - ${el.tag} ${el.text ? `"${el.text.substring(0, 50)}"` : '(no text)'}`).join('\n')}

**ELEMENTS DATABASE (${topElements.length} elements):**
${elementsJSON}

**FIELD MEANINGS:**
- selector: ⚠️ USE THIS EXACT STRING - copy-paste, don't modify
- tag: Element type (button, a, div, etc.)
- text: What element displays (first 80 chars) - use to match user request
- level: primary=main target, proximity=nearby, structure=landmarks
- visual.bg/color: Current colors
- section: Page area (hero, nav, footer, etc.)

${coreRules}

**VARIATIONS (${variations.length}):**
${variations.map((v, i) => `${i + 1}. ${v.name}: ${v.description || 'See above'}`).join('\n')}

**NAME EACH VARIATION** (2-5 words describing changes):
✓ "Green CTA Buttons" ✓ "Trust Badge Addition" ✓ "Larger Headlines"
✗ "Variation 1" ✗ "Test" ✗ "Unnamed"

**IMPORTANT - waitForElement HELPER:**
DO NOT include the waitForElement function definition in your code.
It is automatically provided by the system.
Just use: waitForElement(selector, callback)

**CODE PATTERN:**
${exampleCode}

**OUTPUT FORMAT - STRICT JSON:**
You MUST respond with valid JSON only. No markdown, no code blocks, just raw JSON.

{
  "variations": [
    {
      "number": 1,
      "name": "Descriptive Name (2-5 words)",
      "css": "CSS code or empty string",
      "js": "JavaScript code using waitForElement (DO NOT define it)"
    }
  ],
  "globalCSS": "Shared CSS or empty string",
  "globalJS": "Shared JavaScript or empty string"
}

**EXAMPLE JSON OUTPUT:**
{
  "variations": [
    {
      "number": 1,
      "name": "Green CTA Button",
      "css": "#mainCTA {\\n  background-color: #28a745 !important;\\n  color: white !important;\\n  font-size: 18px !important;\\n}",
      "js": "waitForElement('#mainCTA', (el) => {\\n  if(el.dataset.varApplied) return;\\n  el.textContent = 'Get Started Today';\\n  el.dataset.varApplied = '1';\\n});"
    }
  ],
  "globalCSS": "",
  "globalJS": ""
}

NOTE: Do NOT include "function waitForElement(...)" definition - just call it directly.
BEST PRACTICE: Use CSS section for colors/sizes (with !important), JS section for text/behavior.

**CHECKLIST BEFORE SUBMITTING:**
□ ⚠️ VERIFIED every selector exists in the ELEMENTS list above
□ ❌ NO made-up selectors like 'button.btn.btn--primary'
□ ✅ ONLY used exact selectors from database (copy-paste)
□ ❌ Did NOT include waitForElement function definition
□ ✅ Just CALLED waitForElement with selector and callback
□ Implemented ALL requested changes
□ Added duplication prevention (dataset.varApplied)
□ Descriptive variation names
□ Output is VALID JSON ONLY (no markdown)

**FINAL REMINDER:**
Look at the ELEMENTS list above and find the selector that matches what the user wants to change.
Copy that EXACT selector - do not modify it or create a new one.

Generate JSON now.`;
  }

  /**
   * Unified AI call - routes to appropriate provider
   */
  async callAI(messages, settings) {
    const provider = settings?.provider || 'anthropic';
    const model = settings?.model || 'claude-3-7-sonnet-20250219';

    console.log('🤖 AI Provider:', { provider, model, hasAnthropicKey: !!settings.anthropicApiKey, hasOpenAIKey: !!settings.authToken });

    if (provider === 'anthropic') {
      return this.callClaude(messages, settings.anthropicApiKey, model);
    } else {
      return this.callChatGPT(messages, settings.authToken, model);
    }
  }

  /**
   * Call Anthropic Claude API with prompt caching
   */
  async callClaude(messages, apiKey, model = 'claude-3-7-sonnet-20250219') {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Anthropic API key is missing. Please add it in settings.');
    }

    // Enhanced API key validation
    if (!apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid Anthropic API key format. Keys should start with "sk-ant-"');
    }

    if (apiKey.length < 40) {
      throw new Error('Anthropic API key appears too short. Please check your key in settings.');
    }

    console.log('🔮 Calling Anthropic Claude:', { 
      model, 
      messageCount: messages.length,
      apiKeyPrefix: apiKey.substring(0, 12) + '...',
      apiKeyLength: apiKey.length
    });

    // Extract system message and user messages
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    // Build Anthropic-format messages
    const claudeMessages = userMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    // Determine if this is Claude 4.5 (supports extended thinking)
    const isClaude45 = model.includes('claude-4') || model.includes('sonnet-4');

    const requestBody = {
      model: model,
      max_tokens: 4000,
      messages: claudeMessages
    };

    // Add system message with prompt caching for 90% savings
    if (systemMessage) {
      requestBody.system = [{
        type: "text",
        text: systemMessage,
        cache_control: { type: "ephemeral" } // Enable caching for repeated prompts
      }];
    }

    // Claude 4.5 specific: Enable extended thinking if available
    if (isClaude45) {
      requestBody.thinking = {
        type: "enabled",
        budget_tokens: 2048 // Minimum 1024, using 2048 for better reasoning
      };
    }

    let response;
    try {
      console.log('🌐 Making API request to Anthropic...', {
        url: 'https://api.anthropic.com/v1/messages',
        model: model,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0
      });

      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 API Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

    } catch (fetchError) {
      console.error('🚨 Network Error Details:', {
        message: fetchError.message,
        name: fetchError.name,
        stack: fetchError.stack
      });

      // Provide specific error messages for common issues
      if (fetchError.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to connect to Anthropic API. Please check:\n' +
                       '1. Your internet connection\n' +
                       '2. Extension permissions (reload extension if needed)\n' +
                       '3. API key is valid in settings\n' +
                       '4. No firewall blocking api.anthropic.com');
      }
      
      throw new Error(`Network error: ${fetchError.message}`);
    }

    if (!response.ok) {
      let errorDetail = `Claude API error: ${response.status}`;
      try {
        const errorBody = await response.json();
        console.error('❌ Claude API Error Response:', errorBody);

        if (errorBody?.error?.message) {
          errorDetail = errorBody.error.message;
        }

        if (errorBody?.error?.type === 'invalid_request_error') {
          errorDetail = `${errorDetail}. Check model name: "${model}"`;
        }
      } catch (parseError) {
        // Ignore parse errors
      }

      if (response.status === 404) {
        errorDetail = `Model "${model}" not found by Anthropic API. Try "claude-3-7-sonnet-20250219" (3.7 Sonnet) or "claude-sonnet-4-5-20250929" (4.5 Sonnet). Check settings.`;
      } else if (response.status === 429) {
        errorDetail = 'Anthropic rate limit hit. Wait a moment or switch to another provider.';
      } else if (response.status === 401) {
        errorDetail = 'Invalid Anthropic API key. Check your settings.';
      }

      throw new Error(errorDetail);
    }

    const result = await response.json();

    console.log('📥 Claude API Response:', {
      id: result.id,
      model: result.model,
      stopReason: result.stop_reason,
      usage: result.usage
    });

    // Extract content from Claude response
    const content = result.content
      ?.filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') || '';

    if (!content || content.trim().length === 0) {
      console.error('❌ Claude returned empty content!');
      console.error('Full API response:', JSON.stringify(result, null, 2));
      throw new Error(`Claude API returned empty response. stop_reason: ${result.stop_reason}`);
    }

    // Log cache performance for monitoring
    if (result.usage?.cache_creation_input_tokens || result.usage?.cache_read_input_tokens) {
      console.log('💾 Prompt Cache Performance:', {
        cacheCreation: result.usage.cache_creation_input_tokens || 0,
        cacheRead: result.usage.cache_read_input_tokens || 0,
        savings: result.usage.cache_read_input_tokens
          ? `${Math.round((result.usage.cache_read_input_tokens / (result.usage.input_tokens || 1)) * 100)}%`
          : '0%'
      });
    }

    return {
      content,
      usage: {
        promptTokens: result.usage?.input_tokens || 0,
        completionTokens: result.usage?.output_tokens || 0,
        totalTokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
        cacheCreationTokens: result.usage?.cache_creation_input_tokens || 0,
        cacheReadTokens: result.usage?.cache_read_input_tokens || 0
      },
      model: result.model
    };
  }

  async callChatGPT(messages, authToken, model = 'gpt-4o-mini') {
    const resolvedModel = typeof model === 'string' && model.trim() ? model.trim() : 'gpt-4o-mini';
    console.log('Calling OpenAI Chat Completions.', { model: resolvedModel, messageCount: messages.length });
    
    // Use model-specific parameters for GPT-5 vs GPT-4 models
    const isGPT5Model = resolvedModel.startsWith('gpt-5');
    const requestBody = {
      model: resolvedModel,
      messages: messages
    };

    if (isGPT5Model) {
      // GPT-5 models use reasoning tokens + completion tokens
      // Need higher limit since reasoning tokens don't count toward output
      requestBody.max_completion_tokens = 4000; // Keep original - reasoning uses tokens
      // GPT-5 models only support default temperature (1)
    } else {
      requestBody.max_tokens = 2500; // Reduced from 4000 for faster generation
      requestBody.temperature = 0.5; // Reduced from 0.7 for more consistent output
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorDetail = `ChatGPT API error: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error?.message) {
          errorDetail = `${errorBody.error.message} (HTTP ${response.status})`;
        }
      } catch (parseError) {
        // Ignore parse errors
      }

      if (response.status === 429 && !/rate limit|quota|billing/i.test(errorDetail)) {
        errorDetail = 'OpenAI rate limit hit. Wait a moment or reduce request frequency.';
      }

      throw new Error(errorDetail);
    }

    const result = await response.json();

    console.log('📥 OpenAI API Response:', {
      hasChoices: !!result?.choices,
      choicesLength: result?.choices?.length || 0,
      firstChoiceHasMessage: !!result?.choices?.[0]?.message,
      contentLength: result?.choices?.[0]?.message?.content?.length || 0,
      finishReason: result?.choices?.[0]?.finish_reason,
      usage: result?.usage
    });

    const content = result?.choices?.[0]?.message?.content || '';

    if (!content || content.trim().length === 0) {
      console.error('❌ OpenAI returned empty content!');
      console.error('Full API response:', JSON.stringify(result, null, 2));

      const finishReason = result?.choices?.[0]?.finish_reason;
      const reasoningTokens = result?.usage?.completion_tokens_details?.reasoning_tokens || 0;

      // Special handling for GPT-5 models that use reasoning tokens
      if (finishReason === 'length' && reasoningTokens > 0) {
        throw new Error(`GPT-5 model used all ${reasoningTokens} tokens for reasoning but produced no output. This is a known issue with GPT-5 models on complex prompts. Try: (1) Using gpt-4o or gpt-4o-mini instead, (2) Simplifying the request, or (3) Increasing max_completion_tokens.`);
      }

      throw new Error(`OpenAI API returned empty response. finish_reason: ${finishReason}. This may indicate: (1) Content filter triggered, (2) Model refused request, (3) API quota exceeded, or (4) Hit token limit.`);
    }

    return {
      content,
      usage: result?.usage || null,
      model: resolvedModel
    };
  }

  parseGeneratedCode(response) {
    console.log('🔍 Parsing AI response:', {
      responseLength: response?.length || 0,
      firstChars: response?.substring(0, 200) || 'empty',
      hasVariation: response?.includes('VARIATION') || false,
      hasGlobal: response?.includes('GLOBAL') || false,
      looksLikeJSON: response?.trim().startsWith('{') || false
    });

    const sections = {
      variations: [],
      globalCSS: '',
      globalJS: ''
    };

    if (!response || typeof response !== 'string') {
      console.error('❌ Invalid response:', { type: typeof response, value: response });
      return sections;
    }

    if (response.trim().length === 0) {
      console.error('❌ Empty response from AI - no code generated');
      console.error('This usually means:');
      console.error('  1. API returned no content (check API quota/errors)');
      console.error('  2. Model refused to generate (prompt issue)');
      console.error('  3. Response was filtered/blocked');
      return sections;
    }

    // ✨ NEW: Try parsing as JSON first (structured output)
    let cleanedResponse = response.trim();

    // Remove markdown code blocks if present
    if (cleanedResponse.startsWith('```json') || cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse
        .replace(/^```(?:json)?\s*\n/i, '')
        .replace(/\n```\s*$/i, '');
      console.log('🧹 Removed markdown code block wrapper');
    }

    // Try JSON parsing
    if (cleanedResponse.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanedResponse);

        if (parsed.variations && Array.isArray(parsed.variations)) {
          console.log('✅ Successfully parsed JSON response');
          
          // Debug: Log the actual generated code
          parsed.variations.forEach((v, index) => {
            console.log(`🔍 Generated Code Debug - Variation ${index + 1}:`);
            console.log(`  Name: ${v.name}`);
            console.log(`  CSS: ${v.css ? v.css.substring(0, 200) + '...' : 'None'}`);
            console.log(`  JS: ${v.js ? v.js.substring(0, 200) + '...' : 'None'}`);
          });
          
          return {
            variations: parsed.variations.map(v => ({
              number: v.number || 1,
              name: v.name || 'Unnamed',
              css: v.css || '',
              js: v.js || ''
            })),
            globalCSS: parsed.globalCSS || '',
            globalJS: parsed.globalJS || ''
          };
        }
      } catch (jsonError) {
        console.warn('⚠️ JSON parsing failed, falling back to text parsing:', jsonError.message);
      }
    }

    // Fall back to legacy text parsing
    if (response.trim().startsWith('```')) {
      cleanedResponse = response
        .replace(/^```(?:javascript|js|css)?\s*\n/i, '')
        .replace(/\n```\s*$/i, '');
      console.log('🧹 Removed wrapping code block');
    }

    const lines = cleanedResponse.split('\n');
    let currentSection = null;
    let currentContent = '';
    let variationHeadersFound = 0;

    for (const line of lines) {
      // More flexible matching: detect variation headers even without // prefix
      const isVariationHeader = (
        (line.includes('VARIATION') && line.includes('//')) ||
        (line.trim().startsWith('VARIATION') && (line.includes('CSS') || line.includes('JAVASCRIPT') || line.includes('JS') || line.includes('-')))
      );

      if (isVariationHeader) {
        variationHeadersFound++;
        if (currentSection) {
          this.addToSection(sections, currentSection, currentContent.trim());
        }
        currentSection = this.parseSection(line);
        currentContent = '';
      } else if (line.includes('GLOBAL EXPERIENCE')) {
        if (currentSection) {
          this.addToSection(sections, currentSection, currentContent.trim());
        }
        currentSection = this.parseSection(line);
        currentContent = '';
      } else {
        currentContent += line + '\n';
      }
    }

    if (currentSection) {
      this.addToSection(sections, currentSection, currentContent.trim());
    }

    console.log('📊 Parse results:', {
      variationHeadersFound,
      variationsParsed: sections.variations.length,
      variations: sections.variations.map(v => ({ number: v.number, name: v.name, hasCSS: !!v.css, hasJS: !!v.js })),
      hasGlobalCSS: !!sections.globalCSS,
      hasGlobalJS: !!sections.globalJS
    });

    // If no variations found, log the full response for debugging
    if (sections.variations.length === 0) {
      console.error('❌ No variations parsed! Full AI response:', response);
    }

    return sections;
  }

  parseSection(line) {
    if (line.includes('GLOBAL EXPERIENCE CSS') || line.includes('GLOBAL CSS')) {
      return { type: 'globalCSS' };
    } else if (line.includes('GLOBAL EXPERIENCE JS') || line.includes('GLOBAL JS') || line.includes('GLOBAL JAVASCRIPT')) {
      return { type: 'globalJS' };
    } else if (line.includes('VARIATION')) {
      const isCSS = line.includes('CSS');
      const isJS = line.includes('JAVASCRIPT') || line.includes(' JS');

      // Try multiple patterns to extract variation info
      let number = 1;
      let name = 'Unnamed';

      // Pattern 1: VARIATION 1 - Name (with optional // prefix)
      let match = line.match(/(?:\/\/)?\s*VARIATION\s+(\d+)\s*-\s*(.+?)(?:\s*(?:CSS|JAVASCRIPT|JS|\/\/|$))/i);
      if (match) {
        number = parseInt(match[1]);
        name = match[2].trim();
      } else {
        // Pattern 2: VARIATION 1: Name
        match = line.match(/(?:\/\/)?\s*VARIATION\s+(\d+)\s*:\s*(.+?)(?:\s*(?:CSS|JAVASCRIPT|JS|\/\/|$))/i);
        if (match) {
          number = parseInt(match[1]);
          name = match[2].trim();
        } else {
          // Pattern 3: VARIATION 1 Name (no delimiter)
          match = line.match(/(?:\/\/)?\s*VARIATION\s+(\d+)\s+([A-Z].+?)(?:\s*(?:CSS|JAVASCRIPT|JS|\/\/|$))/i);
          if (match) {
            number = parseInt(match[1]);
            name = match[2].trim();
          } else {
            // Pattern 4: Just extract number
            match = line.match(/VARIATION\s+(\d+)/i);
            if (match) {
              number = parseInt(match[1]);
              name = `Enhanced Version ${number}`;
            }
          }
        }
      }

      // Clean up the name - remove common suffixes and markers
      name = name
        .replace(/\s*(?:\/\/|VARIATION|CSS|JAVASCRIPT|JS)\s*$/i, '')
        .replace(/^(?:\/\/|-)\s*/, '')
        .trim();

      if (!name || name === 'VARIATION' || name.length < 2) {
        name = `Enhanced Version ${number}`;
      }

      // Debug logging
      console.log(`🏷️ Parsed variation: Line="${line.trim()}" → Number=${number}, Name="${name}", Type=${isCSS ? 'CSS' : isJS ? 'JS' : 'unknown'}`);

      return {
        type: 'variation',
        number: number,
        name: name,
        codeType: isCSS ? 'css' : 'js'
      };
    }
    return null;
  }

  addToSection(sections, sectionInfo, content) {
    if (!sectionInfo || !content) return;

    let cleanedContent = content.trim();
    cleanedContent = cleanedContent.replace(/^```(?:css|javascript|js)?\s*\n?/gi, '');
    cleanedContent = cleanedContent.replace(/\n?```\s*$/g, '');
    cleanedContent = cleanedContent.replace(/```$/g, '');
    cleanedContent = cleanedContent.trim();

    if (sectionInfo.type === 'globalCSS') {
      sections.globalCSS = cleanedContent;
    } else if (sectionInfo.type === 'globalJS') {
      sections.globalJS = cleanedContent;
    } else if (sectionInfo.type === 'variation') {
      let variation = sections.variations.find(v => v.number === sectionInfo.number);
      if (!variation) {
        variation = {
          number: sectionInfo.number,
          name: sectionInfo.name,
          css: '',
          js: ''
        };
        sections.variations.push(variation);
      }
      
      if (sectionInfo.codeType === 'css') {
        variation.css = cleanedContent;
      } else {
        variation.js = cleanedContent;
      }
    }
  }

  async getAuthToken() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      const token = result.settings?.authToken;
      return token && token.trim() ? token.trim() : null;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }

  async testApiKey(providedToken) {
    try {
      const token = (providedToken && providedToken.trim()) || await this.getAuthToken();
      if (!token) {
        return { success: false, error: 'No API key provided' };
      }

      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = response.status === 401 ? 'Invalid API key' : `OpenAI error: ${response.status}`;
        return { success: false, error: errorText };
      }

      return { success: true };
    } catch (error) {
      console.error('API key test failed:', error);
      return { success: false, error: error.message || 'API key test failed' };
    }
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isCapturePermitted(url = '') {
    if (!url) return false;
    const blockedSchemes = ['chrome://', 'edge://', 'devtools://', 'about:', 'chrome-extension://'];
    if (blockedSchemes.some(prefix => url.startsWith(prefix))) {
      return false;
    }
    return true;
  }

  normalizeUsage(aiResponse = {}) {
    const usage = aiResponse.usage || {};
    // Handle both snake_case (OpenAI) and camelCase (already normalized from callClaude)
    const promptTokens = usage.promptTokens || usage.prompt_tokens || usage.inputTokens || usage.input_tokens || 0;
    const completionTokens = usage.completionTokens || usage.completion_tokens || usage.outputTokens || usage.output_tokens || 0;
    const totalTokens = usage.totalTokens || usage.total_tokens || promptTokens + completionTokens;

    // Include cache information for Claude models (both snake_case and camelCase)
    const cacheCreationTokens = usage.cacheCreationTokens || usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cacheReadTokens || usage.cache_read_input_tokens || 0;

    return {
      model: aiResponse.model || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens,
      // Claude-specific fields
      cacheCreationTokens,
      cacheReadTokens
    };
  }

  async adjustCode(data, tabId = null) {
    const logger = this.createOperationLogger('AdjustCode');
    try {
      // Support both old format (generationData) and new format (direct params)
      const {
        generationData,
        pageData,
        previousCode,
        newRequest,
        feedback,
        testSummary,
        conversationHistory,
        variations,
        settings,
        extraContext
      } = data || {};

      // Determine which format we're using
      const isNewFormat = pageData && newRequest;
      const actualPageData = isNewFormat ? pageData : generationData?.pageData;
      const actualDescription = isNewFormat ? newRequest : (feedback || generationData?.description);
      const actualVariations = isNewFormat ? variations : generationData?.variations;
      const actualSettings = isNewFormat ? settings : generationData?.settings;

      if (!actualPageData) {
        throw new Error('Missing page data for adjustment request.');
      }

      const authToken = await this.getAuthToken();
      if (!authToken) {
        throw new Error('OpenAI API key missing. Add one in the side panel settings.');
      }

      // Build base prompt using ORIGINAL page data (not modified page)
      const basePrompt = this.buildCodeGenerationPrompt(
        actualPageData,
        actualDescription,
        isNewFormat ? [] : generationData?.designFiles,
        actualVariations,
        actualSettings
      );
      logger.log('Base prompt prepared', `length=${basePrompt.length}`);

      let adjustmentContext = '';

      // NEW: Handle conversation history for follow-ups
      if (isNewFormat && conversationHistory && conversationHistory.length > 0) {
        adjustmentContext += '\n**CONVERSATION HISTORY:**\n';
        conversationHistory.forEach((entry, index) => {
          adjustmentContext += `${index + 1}. User: "${entry.request}"\n`;
          adjustmentContext += `   → Generated: ${entry.code?.variations?.length || 0} variation(s)\n`;
        });
        adjustmentContext += '\n';
        logger.log('Including conversation history', `entries=${conversationHistory.length}`);
      }

      if (previousCode) {
        // Format previous code to clearly show what's already implemented
        const formattedPreviousCode = this.formatPreviousCodeContext(previousCode);
        adjustmentContext += `\n**PREVIOUS IMPLEMENTATION OUTPUT (ALREADY APPLIED TO PAGE):**\n\`\`\`javascript\n${formattedPreviousCode}\n\`\`\``;
        logger.log('Including previous code in adjustment', `length=${formattedPreviousCode.length}`);
      }
      if (testSummary) {
        adjustmentContext += `\nLATEST TEST RESULTS:\n${this.formatTestSummary(testSummary)}`;
        logger.log('Including test summary');
      }

      if (Array.isArray(conversationHistory) && conversationHistory.length) {
        let trimmedHistory = conversationHistory.filter(msg => msg && msg.content);
        if (trimmedHistory.length && feedback) {
          const lastEntry = trimmedHistory[trimmedHistory.length - 1];
          if (lastEntry.role === 'user' && lastEntry.content.trim() === feedback.trim()) {
            trimmedHistory = trimmedHistory.slice(0, -1);
          }
        }

        if (trimmedHistory.length) {
          const historyText = trimmedHistory
            .map((entry, index) => `${index + 1}. ${entry.role === 'assistant' ? 'AI' : 'User'}: ${entry.content}`)
            .join('\n');

          adjustmentContext += `\nRECENT CONVERSATION HISTORY (most recent last):\n${historyText}`;
          logger.log('Including conversation history', `messages=${trimmedHistory.length}`);
        }
      }

      // Handle both 'feedback' and 'newRequest' parameters
      const userRequest = feedback || newRequest;

      if (userRequest) {
        // Check if this is Visual QA feedback and format it differently
        const isVisualQA = userRequest.includes('**VISUAL QA FEEDBACK') || userRequest.includes('**Required Fix**');

        if (isVisualQA) {
          adjustmentContext += `\n**VISUAL QUALITY ASSURANCE FEEDBACK:**\n${userRequest}\n\n**CRITICAL - VISUAL QA IMPLEMENTATION REQUIREMENTS:**\n- You MUST implement EVERY fix mentioned in the Visual QA feedback\n- Use the EXACT CSS properties and values suggested in "Required Fix" sections\n- Visual QA has identified specific problems that MUST be resolved\n- This is automated quality control - treat feedback as mandatory requirements\n- Test your changes against the specific issues mentioned (contrast, positioning, etc.)`;
          logger.log('Including Visual QA feedback with mandatory implementation instructions');
        } else if (isNewFormat) {
          adjustmentContext += `\n**NEW USER REQUEST (Follow-up):**\n"${userRequest}"\n\n**CRITICAL CONTEXT:**\nThis is a follow-up request. The page data comes from the ORIGINAL capture (before any modifications).\nThe PREVIOUS IMPLEMENTATION shows code already applied.\nYour task: Preserve ALL previous changes AND add the new request.`;
          logger.log('Including follow-up request');
        } else {
          adjustmentContext += `\nUSER FEEDBACK:\n${userRequest}`;
          logger.log('Including user feedback');
        }
      }

      if (extraContext) {
        adjustmentContext += `\nADDITIONAL CONTEXT:\n${extraContext}`;
        logger.log('Including extra context');
      }

      // Build context-aware adjustment instructions
      const adjustmentInstructions = previousCode
        ? `
**CRITICAL - CUMULATIVE CHANGES:**
The code shown in PREVIOUS IMPLEMENTATION OUTPUT is ALREADY APPLIED to the page.
Your task is to ADD the new changes requested in USER FEEDBACK while PRESERVING all existing changes.

**RULES FOR ITERATIVE CHANGES:**
1. DO NOT remove or replace code from PREVIOUS IMPLEMENTATION
2. ADD new changes alongside existing ones
3. If modifying same element, MERGE changes (keep old + add new)
4. Use different selectors for new elements vs existing ones
5. Keep ALL waitForElement calls from previous code
6. Add duplication checks for ALL new elements/changes

**EXAMPLE - CORRECT APPROACH:**
Previous: Changed button color to red
New request: Add lock icon to same button
✅ CORRECT: Keep color change + add icon
✗ WRONG: Only add icon, losing color change

**YOUR TASK:**
Analyze PREVIOUS IMPLEMENTATION OUTPUT to understand what's already done.
Then add the changes from USER FEEDBACK without breaking existing code.
Output the COMPLETE code (previous changes + new changes combined).`
        : `
**INITIAL GENERATION:**
Generate code based on the USER FEEDBACK.
This is the first iteration, so no previous changes to preserve.`;

      const finalPrompt = `${basePrompt}
${adjustmentContext}
${adjustmentInstructions}

**OUTPUT REQUIREMENTS:**
Return the COMPLETE code including:
- All changes from PREVIOUS IMPLEMENTATION (if any)
- New changes from USER FEEDBACK
- Proper duplication prevention for all changes
- Same output structure (VARIATION 1 - Name, VARIATION CSS, VARIATION JAVASCRIPT, etc.)

Generate the complete, merged code now.`;

      const systemMessage = previousCode
        ? 'You are an expert A/B testing developer who iteratively refines code. When previous code exists, you PRESERVE all existing changes and ADD new ones. You NEVER remove or replace working code from previous iterations. CRITICAL: When Visual QA feedback is provided, you MUST implement every fix mentioned - this is automated quality control that identifies real visual problems.'
        : 'You are an expert A/B testing developer who generates clean, production-ready code using only vanilla JavaScript. CRITICAL: When Visual QA feedback is provided, you MUST implement every fix mentioned - this is automated quality control that identifies real visual problems.';

      const messages = [{
        role: 'system',
        content: systemMessage
      }];

      // Temporarily disable screenshots to reduce token usage
      messages.push({
        role: 'user',
        content: finalPrompt
      });
      logger.log('Using text-only mode for adjustment', 'optimized for token efficiency');

      // Use unified AI call
      const aiSettings = {
        provider: generationData.settings?.provider || 'openai',
        authToken: authToken,
        anthropicApiKey: generationData.settings?.anthropicApiKey,
        model: generationData.settings?.model || 'gpt-4o-mini'
      };

      const aiResponse = await this.callAI(messages, aiSettings);
      logger.log('AI adjustment response received', `provider=${aiSettings.provider}, promptTokens=${aiResponse.usage?.promptTokens || 0} completionTokens=${aiResponse.usage?.completionTokens || 0}`);

      return {
        code: this.parseGeneratedCode(aiResponse.content),
        usage: this.normalizeUsage(aiResponse),
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Code adjustment failed', error?.message);
      throw error;
    }
  }

  /**
   * Format previous code to clearly show what's already implemented
   * Adds annotations to help AI understand existing changes
   */
  formatPreviousCodeContext(previousCode) {
    if (!previousCode || typeof previousCode !== 'string') {
      return '';
    }

    // Parse the previous code to extract key changes
    const lines = previousCode.split('\n');
    const annotated = [];

    lines.forEach(line => {
      // Detect variation headers and annotate them
      if (line.includes('VARIATION') && line.includes('//')) {
        const match = line.match(/VARIATION\s+(\d+)\s*-\s*(.+?)(?:\s*\/\/|$)/i);
        if (match) {
          const variationName = match[2].trim();
          annotated.push(`\n// ===== ${variationName} (EXISTING - PRESERVE ALL CHANGES) =====`);
        }
        annotated.push(line);
      } else {
        annotated.push(line);
      }
    });

    return annotated.join('\n');
  }

  formatTestSummary(testSummary) {
    if (!testSummary) return 'No test summary provided.';

    const lines = [];
    if (testSummary.variationName) {
      const numberPart = typeof testSummary.variationNumber !== 'undefined' ? ` (#${testSummary.variationNumber})` : '';
      lines.push(`Variation: ${testSummary.variationName}${numberPart}`);
    }
    if (testSummary.timestamp) {
      lines.push(`Timestamp: ${new Date(testSummary.timestamp).toISOString()}`);
    }
    if (Array.isArray(testSummary.errors) && testSummary.errors.length) {
      lines.push('Errors encountered:');
      testSummary.errors.forEach((err, index) => {
        lines.push(`${index + 1}. ${err}`);
      });
    } else {
      lines.push('No specific runtime errors were captured, but adjustments are requested.');
    }

    return lines.join('\n');
  }

  async saveGeneration(data) {
    try {
      const entry = this.createHistoryEntry(data);
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};

      if (!Array.isArray(settings.generationHistory)) {
        settings.generationHistory = [];
      }

      settings.generationHistory.unshift(entry);
      const HISTORY_LIMIT = 10;
      if (settings.generationHistory.length > HISTORY_LIMIT) {
        settings.generationHistory = settings.generationHistory.slice(0, HISTORY_LIMIT);
      }

      await this.persistHistory(settings);
    } catch (error) {
      console.error('Failed to save generation:', error);
      throw error;
    }
  }

  async persistHistory(settings) {
    try {
      await chrome.storage.local.set({ settings });
    } catch (error) {
      const message = error?.message || '';
      if (!message.includes('QUOTA_BYTES')) {
        throw error;
      }

      console.warn('Storage quota exceeded while saving history; trimming entries.');
      const trimmed = (settings.generationHistory || [])
        .slice(0, 5)
        .map(entry => this.minifyHistoryEntry(entry));
      settings.generationHistory = trimmed;

      try {
        await chrome.storage.local.set({ settings });
      } catch (secondaryError) {
        console.error('Unable to persist trimmed history:', secondaryError);
        throw new Error('Unable to save history because storage quota was exceeded. Clear history in the extension settings and try again.');
      }
    }
  }

  createHistoryEntry(data = {}) {
    console.log('🎯 Creating history entry with data:', {
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : 'no data',
      hasPageData: !!(data?.pageData),
      pageDataKeys: data?.pageData ? Object.keys(data.pageData) : 'no pageData',
      url: data?.url,
      pageDataUrl: data?.pageData?.url
    });
    
    const timestamp = Date.now();
    const variations = Array.isArray(data.variations) ? data.variations : [];
    const generatedCode = data.generatedCode || {};

    const entry = {
      id: timestamp.toString(),
      timestamp,
      url: data.url || data.pageData?.url || '',
      title: data.title || data.pageData?.title || '',
      description: data.description || '',
      variations: variations.map(variation => ({
        id: variation.id,
        name: variation.name,
        description: variation.description || ''
      }))
    };

    if (generatedCode && typeof generatedCode === 'object') {
      entry.generatedCode = {
        variations: Array.isArray(generatedCode.variations)
          ? generatedCode.variations.map(variation => ({
              number: variation.number,
              name: variation.name,
              css: this.trimText(variation.css),
              js: this.trimText(variation.js)
            }))
          : [],
        globalCSS: this.trimText(generatedCode.globalCSS),
        globalJS: this.trimText(generatedCode.globalJS)
      };
    }

    return entry;
  }

  minifyHistoryEntry(entry = {}) {
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      url: entry.url,
      title: entry.title,
      description: entry.description,
      variations: Array.isArray(entry.variations)
        ? entry.variations.map(variation => ({
            id: variation.id,
            name: variation.name
          }))
        : []
    };
  }

  trimText(value, limit = 2000) {
    if (!value) return '';
    const text = String(value);
    if (text.length <= limit) {
      return text;
    }
    return `${text.substring(0, limit)}\n/* truncated */`;
  }

  async getHistory() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      return result.settings?.generationHistory || [];
    } catch (error) {
      console.error('Failed to get history:', error);
      return [];
    }
  }

  async applyVariationCode(message) {
    const { css, js, key, tabId } = message;
    const logger = this.createOperationLogger(`ApplyVariation:${key || 'unknown'}`);
    logger.log('Received apply variation request', JSON.stringify({
      hasCSS: !!css,
      cssLength: css ? css.length : 0,
      hasJS: !!js,
      jsLength: js ? js.length : 0,
      tabId
    }));

    if (!tabId) {
      logger.error('Missing tabId in apply variation request');
      return {
        success: false,
        error: 'No tab ID provided for variation application',
        logs: logger.entries()
      };
    }

    try {
      let cssResult = { success: true };
      if (css && css.trim()) {
        const cleanedCSS = css
          .replace(/^\s*\/\/.*$/gm, '') // Only remove lines that start with //
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
          .replace(/\n\s*\n/g, '\n') // Remove excessive whitespace
          .trim();
          
        try {
          // First check if content script is loaded
          logger.log('Testing content script availability');
          const pingResult = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          logger.log('Content script ping result', JSON.stringify(pingResult));

          if (!pingResult || !pingResult.success) {
            logger.error('Content script not responding to PING');
            return {
              success: false,
              error: 'Content script not loaded or not responding',
              cssApplied: false,
              jsApplied: false,
              logs: logger.entries()
            };
          }
          
          logger.log('Sending CSS to content script', `length=${cleanedCSS.length}`);

          // Add timeout wrapper to detect if message never gets a response
          const messagePromise = chrome.tabs.sendMessage(tabId, {
            type: 'APPLY_VARIATION',
            css: cleanedCSS,
            js: null,
            key
          });

          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
              logger.error('Content script message timeout', 'No response after 5 seconds');
              resolve({ success: false, error: 'Content script timeout - no response received', timeout: true });
            }, 5000);
          });

          cssResult = await Promise.race([messagePromise, timeoutPromise]);
          logger.log('Content script response for CSS', JSON.stringify(cssResult));
          logger.log('CSS result analysis',
            `type=${typeof cssResult}, ` +
            `hasSuccess=${cssResult && 'success' in cssResult}, ` +
            `successValue=${cssResult?.success}, ` +
            `keys=${cssResult ? Object.keys(cssResult).join(',') : 'null'}`
          );
          
          if (cssResult?.debugLogs) {
            logger.log('Content script debug logs', cssResult.debugLogs.join(' | '));
          }
          
          if (!cssResult || cssResult.success !== true) {
            const cssError = cssResult?.error || 'Content script failed to apply CSS';
            logger.error('CSS application reported failure',
              `cssResult=${cssResult ? 'exists' : 'null'}, ` +
              `success=${cssResult?.success}, ` +
              `error=${cssError}`
            );
            return {
              success: false,
              error: cssError,
              cssApplied: false,
              jsApplied: false,
              logs: logger.entries()
            };
          }
        } catch (error) {
          logger.error('Error while sending CSS to content script', error.message);
          return {
            success: false,
            error: `Failed to apply CSS: ${error.message}`,
            cssApplied: false,
            jsApplied: false,
            logs: logger.entries()
          };
        }
      } else {
        logger.log('No CSS provided in variation payload');
      }

      let jsResult = { success: true };
      if (js && js.trim()) {
        let cleanedJS = js.trim();
        
        // Remove markdown code blocks
        cleanedJS = cleanedJS.replace(/^```(?:javascript|js)?\s*\n?/gi, '');
        cleanedJS = cleanedJS.replace(/\n?```\s*$/g, '');
        cleanedJS = cleanedJS.replace(/```$/g, '');
        
        // More careful comment removal - only remove comments that are clearly comments
        // Don't remove // that are part of URLs or other code
        cleanedJS = cleanedJS.replace(/^\s*\/\/.*$/gm, ''); // Only remove lines that start with //
        cleanedJS = cleanedJS.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments
        
        // Clean up excessive whitespace
        cleanedJS = cleanedJS.replace(/\n\s*\n/g, '\n');
        cleanedJS = cleanedJS.trim();
          
        logger.log('Preparing to execute JS', `length=${cleanedJS.length}`);
        logger.log('First 200 chars of cleaned JS', cleanedJS.substring(0, 200));

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code) => {
              try {
                if (!window.waitForElement) {
                  window.waitForElement = function(selector, callback, maxWait = 10000) {
                    console.log(`%c[CONVERT-AI] Looking for: ${selector}`, 'color: blue; font-weight: bold');
                    
                    try {
                      document.querySelector(selector);
                    } catch (e) {
                      console.error(`%c[CONVERT-AI] INVALID SELECTOR: ${selector}`, 'color: red; font-weight: bold', e);
                      return false;
                    }
                    
                    const element = document.querySelector(selector);
                    if (element) {
                      console.log(`%c[CONVERT-AI] ✓ Found immediately: ${selector}`, 'color: green; font-weight: bold', {
                        tagName: element.tagName,
                        classes: element.className,
                        id: element.id,
                        text: element.textContent?.substring(0, 50),
                        visible: element.offsetParent !== null,
                        element: element
                      });
                      try {
                        const oldText = element.textContent;
                        const oldComputedBg = window.getComputedStyle(element).backgroundColor;
                        const oldInlineBg = element.style.backgroundColor;

                        callback(element);

                        // Small delay to let styles apply
                        setTimeout(() => {
                          const newText = element.textContent;
                          const newComputedBg = window.getComputedStyle(element).backgroundColor;
                          const newInlineBg = element.style.backgroundColor;

                          const textChanged = oldText !== newText;
                          const computedBgChanged = oldComputedBg !== newComputedBg;
                          const inlineStyleAdded = newInlineBg && newInlineBg !== oldInlineBg;

                          console.log(`%c[CONVERT-AI] ✓ Callback executed for: ${selector}`, 'color: green', {
                            textChanged,
                            oldText: oldText?.substring(0, 30),
                            newText: newText?.substring(0, 30),
                            inlineStyleAdded,
                            oldInlineBg,
                            newInlineBg,
                            computedBgChanged,
                            oldComputedBg,
                            newComputedBg
                          });

                          // Warn if inline style was added but computed style didn't change
                          if (inlineStyleAdded && !computedBgChanged) {
                            console.warn(`%c[CONVERT-AI] ⚠️ Style override failed for: ${selector}`, 'color: orange; font-weight: bold',
                              'Inline style was set but computed style didn\'t change. Site CSS may be overriding with !important or higher specificity.');
                          }
                        }, 50);
                      } catch (e) {
                        console.error(`%c[CONVERT-AI] ✗ Callback failed: ${selector}`, 'color: red; font-weight: bold', e);
                      }
                      return true;
                    } else {
                      console.log(`%c[CONVERT-AI] Waiting for: ${selector}`, 'color: orange', `(up to ${maxWait}ms)`);
                      const startTime = Date.now();
                      const checkInterval = setInterval(() => {
                        const element = document.querySelector(selector);
                        if (element) {
                          clearInterval(checkInterval);
                          console.log(`%c[CONVERT-AI] ✓ Found after waiting: ${selector}`, 'color: green');
                          try {
                            callback(element);
                            console.log(`%c[CONVERT-AI] ✓ Delayed callback executed: ${selector}`, 'color: green');
                          } catch (e) {
                            console.error(`%c[CONVERT-AI] ✗ Delayed callback failed: ${selector}`, 'color: red', e);
                          }
                        } else if (Date.now() - startTime > maxWait) {
                          clearInterval(checkInterval);
                          console.warn(`%c[CONVERT-AI] ✗ TIMEOUT: ${selector} not found after ${maxWait}ms`, 'color: red; font-weight: bold');
                        }
                      }, 100);
                      return false;
                    }
                  };
                }

                let cleanCode = code.trim();
                // Remove markdown code blocks safely
                cleanCode = cleanCode.replace(/^```[a-zA-Z]*\s*\n?/gi, '');
                cleanCode = cleanCode.replace(/\n?```\s*$/g, '');
                cleanCode = cleanCode.replace(/```$/g, '');
                cleanCode = cleanCode.replace(/^```/g, '');
                cleanCode = cleanCode.trim();

                if (!cleanCode) {
                  console.error('%c[CONVERT-AI] Empty code after cleaning!', 'color: red; font-weight: bold');
                  return { success: false, error: 'Empty code after cleaning' };
                }

                console.log('%c[CONVERT-AI] Executing JavaScript:', 'color: purple; font-weight: bold');
                console.log(cleanCode);
                console.log('%c[CONVERT-AI] ---', 'color: purple');
                
                // Check for common syntax issues before execution
                try {
                  // Try to parse as a function to catch syntax errors early
                  new Function(cleanCode);
                } catch (syntaxError) {
                  console.error('%c[CONVERT-AI] SYNTAX ERROR detected before execution:', 'color: red; font-weight: bold', syntaxError);
                  return { 
                    success: false, 
                    error: `Invalid or unexpected token: ${syntaxError.message}`,
                    syntaxError: true,
                    code: cleanCode.substring(0, 300) // First 300 chars for debugging
                  };
                }
                
                // Add debugging wrapper to track execution success
                const debugCode = `
                  console.log('%c[DEBUG] Starting variation execution', 'color: green; font-weight: bold');
                  try {
                    ${cleanCode}
                    console.log('%c[DEBUG] Variation execution completed successfully', 'color: green; font-weight: bold');
                  } catch (error) {
                    console.error('%c[DEBUG] Variation execution failed:', 'color: red; font-weight: bold', error);
                    throw error;
                  }
                `;
                
                const result = (0, eval)(debugCode);
                console.log('[JavaScript Execution] Execution completed, result:', result);
                
                return { success: true, result };
              } catch (error) {
                return {
                  success: false,
                  error: error.message,
                  stack: error.stack
                };
              }
            },
            args: [cleanedJS]
          });

          if (results && results[0]) {
            jsResult = results[0].result;
          }

          if (!jsResult?.success) {
            const errorMessage = jsResult?.error || 'JavaScript execution failed';
            logger.error('JavaScript execution reported failure', errorMessage);
            
            // Add debugging info for syntax errors
            if (jsResult?.syntaxError) {
              logger.error('Syntax error in generated JavaScript code', jsResult?.code || 'No code available');
            }
            
            return {
              success: false,
              error: errorMessage,
              stack: jsResult?.stack,
              syntaxError: jsResult?.syntaxError,
              cssApplied: !!cssResult?.success,
              jsApplied: false,
              logs: logger.entries()
            };
          }

          logger.log('JavaScript executed successfully');
        } catch (error) {
          logger.error('JavaScript execution threw', error?.message || error);
          return {
            success: false,
            error: `JavaScript execution error: ${error.message}`,
            cssApplied: !!cssResult?.success,
            jsApplied: false,
            logs: logger.entries()
          };
        }
      } else {
        logger.log('No JavaScript provided in variation payload');
      }

      logger.log('Variation assets applied', JSON.stringify({
        cssApplied: !!cssResult?.success && !!css && css.trim(),
        jsApplied: !!js && js.trim()
      }));

      return {
        success: true,
        cssApplied: !!cssResult?.success && !!css && css.trim(),
        jsApplied: !!js && js.trim(),
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Variation application threw', error?.message || error);
      return {
        success: false,
        error: error.message || 'Failed to apply variation',
        logs: logger.entries()
      };
    }
  }

  notifyPageChange(tabId, tab) {
    chrome.runtime.sendMessage({
      type: 'PAGE_CHANGED',
      tabId,
      url: tab.url,
      title: tab.title
    }).catch(() => {});
  }

  // ============================================
  // Convert.com API v2 Helpers
  // ============================================

  sanitizeConvertId(id) {
    if (typeof id === 'number') {
      return id;
    }
    if (typeof id === 'string' && id.trim() !== '') {
      const parsed = Number(id);
      return Number.isNaN(parsed) ? id.trim() : parsed;
    }
    return id;
  }

  buildConvertURL(path = '', query = {}) {
    // Convert v2 endpoints are served from /api/v2 according to the public OpenAPI spec
    const baseUrl = 'https://api.convert.com/api/v2';
    const trimmedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${trimmedPath}`);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      if (Array.isArray(value)) {
        const arrayKey = key.endsWith('[]') ? key : `${key}[]`;
        value.forEach((item) => {
          if (item !== undefined && item !== null) {
            url.searchParams.append(arrayKey, String(item));
          }
        });
      } else {
        url.searchParams.append(key, String(value));
      }
    });

    return url;
  }

  async convertApiRequest(credentials = {}, options = {}) {
    const { apiKey, apiSecret } = credentials || {};
    if (!apiKey || !apiSecret) {
      throw new Error('Convert.com API key and secret are required');
    }

    const {
      path,
      method = 'GET',
      query,
      body,
      expectedStatus,
      operation: operationLabel
    } = options;

    if (!path) {
      throw new Error('Missing Convert API path');
    }

    const url = this.buildConvertURL(path, query);
    const operation = operationLabel || path || 'General';
    const logger = this.createOperationLogger(`ConvertAPI:${operation}`);
    logger.log('Preparing request', `method=${method} path=${url.pathname}`);

    const hasBody = body !== undefined && body !== null;
    let payload = '';

    if (hasBody) {
      try {
        payload = JSON.stringify(body);
        logger.log('Serialized payload', `length=${payload.length}`);
      } catch (error) {
        logger.error('Payload serialization failed', error.message);
        throw new Error('Failed to serialize Convert API request body');
      }
    }

    const authOrder = ['bearer', 'hmac'];
    let lastAuthError = null;

    for (const authMethod of authOrder) {
      const headers = new Headers();
      headers.set('Accept', 'application/json');
      if (hasBody) {
        headers.set('Content-Type', 'application/json');
      }

      try {
        logger.log('Attempting request', `auth=${authMethod}`);
        const authHeaders = await this.buildConvertAuthHeaders(credentials, {
          url,
          payload,
          method: authMethod
        });

        if (!authHeaders) {
          logger.log('Auth headers unavailable for method', authMethod);
          continue;
        }

        Object.entries(authHeaders).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            headers.set(key, value);
          }
        });

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: hasBody ? payload : undefined
        });

        const text = await response.text();
        logger.log('Response received', `auth=${authMethod} status=${response.status}`);
        let data = null;

        if (text) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            logger.log('Response JSON parse failed', parseError.message);
            data = null;
          }
        }

        const successStatuses = Array.isArray(expectedStatus)
          ? expectedStatus
          : expectedStatus
            ? [expectedStatus]
            : [200, 201, 202, 204];

        if (response.status === 401 && authMethod === 'bearer') {
          const message = this.extractConvertErrorMessage(response, data, text);
          lastAuthError = new Error(message);
          logger.log('Bearer auth unauthorized', message);
          continue;
        }

        if (!successStatuses.includes(response.status)) {
          const message = this.extractConvertErrorMessage(response, data, text);
          logger.error('Convert API request failed', `status=${response.status} message=${message}`);
          const error = new Error(message);
          error.status = response.status;
          error.data = data;
          throw error;
        }

        logger.log('Convert API request succeeded', `status=${response.status}`);
        return data;
      } catch (error) {
        if (error?.status === 401 && authMethod === 'bearer') {
          lastAuthError = error;
          logger.log('Retrying with HMAC after bearer 401');
          continue;
        }
        logger.error('Convert API exception', error?.message || String(error));
        throw error;
      }
    }

    if (lastAuthError) {
      logger.error('Authorization failed for all auth strategies', lastAuthError.message);
      throw lastAuthError;
    }

    logger.error('Authorization failed for Convert.com request.', `method=${method} path=${url.pathname}`);
    throw new Error('Authorization failed for Convert.com request.');
  }


  async buildConvertAuthHeaders(credentials, context) {
    const { apiKey, apiSecret } = credentials || {};
    const { url, payload = '', method } = context || {};

    if (!apiKey || !apiSecret) {
      return null;
    }

    if (method === 'bearer') {
      return {
        Authorization: `Bearer ${apiKey}:${apiSecret}`
      };
    }

    if (method === 'hmac') {
      const expires = Math.floor(Date.now() / 1000) + 60;
      const requestPath = `${url.pathname}${url.search}`;
      const signString = `${apiKey}\n${expires}\n${requestPath}\n${payload || ''}`;

      const encoder = new TextEncoder();
      const secretBytes = encoder.encode(apiSecret);
      let cryptoKey;

      try {
        cryptoKey = await crypto.subtle.importKey(
          'raw',
          secretBytes,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
      } catch (error) {
        console.error('Convert API: Failed to import HMAC key', error);
        throw new Error('Failed to prepare Convert API signature');
      }

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signString));
      const signatureHex = Array.from(new Uint8Array(signatureBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

      return {
        Authorization: `Convert-HMAC-SHA256 Signature=${signatureHex}`,
        'Convert-Application-ID': String(apiKey),
        Expire: String(expires)
      };
    }

    return null;
  }

  extractConvertErrorMessage(response, data, fallbackText) {
    if (data) {
      if (typeof data === 'string') {
        return data;
      }
      if (data.message) {
        return data.message;
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const first = data.errors[0];
        if (typeof first === 'string') {
          return first;
        }
        if (first.message) {
          return first.message;
        }
      }
    }

    if (fallbackText) {
      return fallbackText;
    }

    return `Convert API error: ${response.status} ${response.statusText}`;
  }

  async fetchConvertAccounts(credentials) {
    const result = await this.convertApiRequest(credentials, {
      path: '/accounts',
      method: 'GET'
    });

    if (!result) {
      return [];
    }

    const accounts = Array.isArray(result?.data) ? result.data : result;
    return accounts.map((account) => ({
      id: this.sanitizeConvertId(account?.id),
      name: account?.name || 'Unnamed Account',
      status: account?.status || 'unknown',
      access_role: account?.access_role?.name || account?.access_role || null,
      raw: account
    }));
  }

  async fetchConvertProjects(credentials, accountId, options = {}) {
    const account = this.sanitizeConvertId(accountId);
    if (!account) {
      throw new Error('Account ID is required to list projects');
    }

    const body = {
      page: options.page || 1,
      results_per_page: Math.min(options.resultsPerPage || 50, 50),
      status: options.status,
      include: options.include,
      expand: options.expand
    };

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects`,
      method: 'POST',
      body,
      operation: `/accounts/${account}/projects`
    });

    const projects = Array.isArray(result?.data) ? result.data : [];
    return projects.map((project) => ({
      id: this.sanitizeConvertId(project?.id),
      name: project?.name || 'Untitled Project',
      status: project?.status || project?.project_status || 'unknown',
      type: project?.project_type || project?.type || 'web',
      domain: project?.domains?.[0]?.url || null,
      raw: project
    }));
  }

  async fetchConvertExperiences(credentials, { accountId, projectId, options = {} }) {
    const account = this.sanitizeConvertId(accountId);
    const project = this.sanitizeConvertId(projectId);

    if (!account || !project) {
      throw new Error('Account and project IDs are required to list experiences');
    }

    const body = {
      page: options.page || 1,
      results_per_page: Math.min(options.resultsPerPage || 50, 50),
      include: options.include,
      expand: options.expand,
      status: options.status,
      type: options.type
    };

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects/${project}/experiences`,
      method: 'POST',
      body,
      operation: `/accounts/${account}/projects/${project}/experiences`
    });

    const experiences = Array.isArray(result?.data) ? result.data : [];
    return experiences.map((experience) => ({
      id: this.sanitizeConvertId(experience?.id),
      name: experience?.name || 'Untitled Experience',
      status: experience?.status || 'unknown',
      type: experience?.type || 'a/b',
      key: experience?.key || null,
      updated_at: experience?.updated_at || experience?.updatedAt || null,
      raw: experience
    }));
  }

  async fetchConvertExperience(credentials, { accountId, projectId, experienceId, options = {} }) {
    const account = this.sanitizeConvertId(accountId);
    const project = this.sanitizeConvertId(projectId);
    const experience = this.sanitizeConvertId(experienceId);

    if (!account || !project || !experience) {
      throw new Error('Account, project, and experience IDs are required');
    }

    const includeParam = options.include;
    const expandParam = options.expand;

    const include = Array.isArray(includeParam)
      ? includeParam
      : typeof includeParam === 'string'
        ? includeParam.split(',').map((item) => item.trim()).filter(Boolean)
        : [];

    const expand = Array.isArray(expandParam)
      ? expandParam
      : typeof expandParam === 'string'
        ? expandParam.split(',').map((item) => item.trim()).filter(Boolean)
        : null;

    if (!expand || expand.length === 0) {
      expand = ['variations', 'variations.changes'];
    }

    const query = {};
    if (Array.isArray(include) && include.length) {
      query.include = include;
    }
    if (Array.isArray(expand) && expand.length) {
      query.expand = expand;
    }

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects/${project}/experiences/${experience}`,
      method: 'GET',
      query,
      operation: `/accounts/${account}/projects/${project}/experiences/${experience}`
    });

    return result;
  }

  async createConvertExperienceV2(credentials, { accountId, projectId, payload }) {
    const account = this.sanitizeConvertId(accountId);
    const project = this.sanitizeConvertId(projectId);

    if (!account || !project) {
      throw new Error('Account and project IDs are required to create an experience');
    }

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects/${project}/experiences/add`,
      method: 'POST',
      body: payload,
      expectedStatus: 201
    });

    return result;
  }

  async updateConvertVariation(credentials, { accountId, projectId, experienceId, variationId, payload }) {
    const account = this.sanitizeConvertId(accountId);
    const project = this.sanitizeConvertId(projectId);
    const experience = this.sanitizeConvertId(experienceId);
    const variation = this.sanitizeConvertId(variationId);

    if (!account || !project || !experience || !variation) {
      throw new Error('Account, project, experience, and variation IDs are required to update variation');
    }

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects/${project}/experiences/${experience}/variations/${variation}/update`,
      method: 'PUT',
      body: payload,
      expectedStatus: [200, 204]
    });

    return result;
  }

  async updateConvertExperience(credentials, { accountId, projectId, experienceId, payload }) {
    const account = this.sanitizeConvertId(accountId);
    const project = this.sanitizeConvertId(projectId);
    const experience = this.sanitizeConvertId(experienceId);

    if (!account || !project || !experience) {
      throw new Error('Account, project, and experience IDs are required to update an experience');
    }

    const result = await this.convertApiRequest(credentials, {
      path: `/accounts/${account}/projects/${project}/experiences/${experience}/update`,
      method: 'POST',
      body: payload,
      expectedStatus: [200]
    });

    return result;
  }

  async getConvertAPIKeys() {
    try {
      const result = await chrome.storage.local.get(['convertApiKeys']);
      return result.convertApiKeys || [];
    } catch (error) {
      console.error('Failed to get Convert API keys:', error);
      return [];
    }
  }

  async createConvertExperiment(experimentData) {
    const { apiKey, apiSecret, projectId, name, description, variations, url } = experimentData;
    
    if (!apiKey || !apiSecret) {
      throw new Error('Convert.com API key and secret are required');
    }

    const logger = this.createOperationLogger('CreateExperiment');
    logger.log('Creating experiment in Convert.com', `name=${name}`);

    try {
      const formattedVariations = variations.map((variation, index) => ({
        name: variation.name || `Variation ${index + 1}`,
        weight: Math.floor(100 / (variations.length + 1)),
        code: this.wrapCSSInJS(variation.css, variation.js)
      }));
      
      const credentials = btoa(`${apiKey}:${apiSecret}`);
      
      const response = await fetch('https://api.convert.com/v1/experiments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify({
          name,
          description: description || '',
          project_id: projectId,
          url_targeting: {
            include_url: url
          },
          variations: formattedVariations,
          status: 'draft'
        })
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          throw new Error(`Convert.com API error: ${response.status} ${response.statusText}`);
        }
        throw new Error(`Convert.com API error: ${errorData.message || response.status}`);
      }

      const result = await response.json();
      logger.log('Experiment created successfully', `id=${result.id}`);

      return {
        success: true,
        experimentId: result.id,
        experimentUrl: `https://app.convert.com/experiments/${result.id}`,
        data: result,
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Failed to create experiment', error.message);
      throw error;
    }
  }

  wrapCSSInJS(css, js) {
    let code = '';
    
    if (css && css.trim()) {
      const escapedCSS = css.replace(/`/g, '\\`').replace(/\$/g, '\\$');
      code += `
(function() {
  const style = document.createElement('style');
  style.setAttribute('data-convert-variation', 'true');
  style.textContent = \`${escapedCSS}\`;
  document.head.appendChild(style);
})();
`;
    }
    
    if (js && js.trim()) {
      code += '\n\n' + js;
    }
    
    return code;
  }

  async performVisualQAValidation(data) {
    console.log('🎨 Performing visual QA validation with AI...');

    const {
      beforeScreenshot,
      afterScreenshot,
      userRequest,
      chatHistory,
      variation,
      elementDatabase
    } = data;

    if (!beforeScreenshot || !afterScreenshot) {
      console.warn('⚠️ Missing screenshots for visual QA - skipping AI validation');
      return {
        passed: true,
        message: 'Visual QA skipped (missing screenshots)',
        skipped: true
      };
    }

    try {
      // Load settings to get API key
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};

      if (!settings.apiKey) {
        console.warn('⚠️ No API key - skipping visual QA');
        return {
          passed: true,
          message: 'Visual QA skipped (no API key)',
          skipped: true
        };
      }

      // Build Visual QA prompt
      const visualQAPrompt = this.buildVisualQAPrompt(userRequest, chatHistory, variation, elementDatabase);

      // Call AI with screenshots
      const provider = settings.provider || 'anthropic';
      let validationResult;

      if (provider === 'anthropic') {
        validationResult = await this.callAnthropicVisualQA(settings.apiKey, settings.model, visualQAPrompt, beforeScreenshot, afterScreenshot);
      } else {
        validationResult = await this.callOpenAIVisualQA(settings.apiKey, settings.model, visualQAPrompt, beforeScreenshot, afterScreenshot);
      }

      console.log('✅ Visual QA validation complete:', validationResult);
      return validationResult;

    } catch (error) {
      console.error('❌ Visual QA validation failed:', error);
      return {
        passed: false,
        message: `Visual QA error: ${error.message}`,
        error: true
      };
    }
  }

  buildVisualQAPrompt(userRequest, chatHistory, variation, elementDatabase) {
    const chatContext = chatHistory && chatHistory.length > 0
      ? `\n\n## Conversation History:\n${chatHistory.map(msg => `**${msg.role}**: ${msg.content}`).join('\n')}`
      : '';

    const elementContext = elementDatabase && elementDatabase.elements
      ? `\n\n## Page Elements:\n${elementDatabase.elements.slice(0, 10).map(el => `- ${el.tag}${el.selector ? ` (${el.selector})` : ''}: "${el.text?.substring(0, 50) || ''}"`).join('\n')}`
      : '';

    return `You are a visual QA expert validating A/B test code changes.

## User's Request:
${userRequest}
${chatContext}

## Generated Code:
**Variation**: ${variation.name}

**CSS**:
\`\`\`css
${variation.css || '/* No CSS */'}
\`\`\`

**JavaScript**:
\`\`\`javascript
${variation.js || '// No JavaScript'}
\`\`\`
${elementContext}

## Your Task:
Compare the BEFORE and AFTER screenshots. Validate:

1. **Did the changes actually happen?** - Check if the visual changes match what the code should do
2. **Are they correct?** - Do they match the user's request?
3. **Any visual bugs?** - Layout breaks, overlapping elements, hidden content, wrong colors, etc.

**IMPORTANT**:
- Be strict about correctness - if the user asked for "green button" but it's blue, that's FAILED
- Check if text changes actually applied
- Verify color changes are visible
- Look for layout shifts or broken designs

Respond in JSON format:
\`\`\`json
{
  "passed": true/false,
  "changesDetected": true/false,
  "correctnessScore": 0-100,
  "issues": ["issue 1", "issue 2"],
  "message": "Brief summary of validation results",
  "recommendations": ["recommendation 1"]
}
\`\`\``;
  }

  async callAnthropicVisualQA(apiKey, model, prompt, beforeScreenshot, afterScreenshot) {
    const apiModel = model || 'claude-3-7-sonnet-20250219';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: apiModel,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: beforeScreenshot.replace(/^data:image\/png;base64,/, '')
              }
            },
            {
              type: 'text',
              text: '**BEFORE Screenshot** (original page)'
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: afterScreenshot.replace(/^data:image\/png;base64,/, '')
              }
            },
            {
              type: 'text',
              text: '**AFTER Screenshot** (with changes applied)'
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const aiResponse = result.content[0].text;

    // Parse JSON from AI response
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Fallback if AI didn't return JSON
    return {
      passed: true,
      message: aiResponse,
      rawResponse: aiResponse
    };
  }

  async callOpenAIVisualQA(apiKey, model, prompt, beforeScreenshot, afterScreenshot) {
    const apiModel = model || 'gpt-4o';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: beforeScreenshot
              }
            },
            {
              type: 'text',
              text: '**BEFORE Screenshot** (original page)'
            },
            {
              type: 'image_url',
              image_url: {
                url: afterScreenshot
              }
            },
            {
              type: 'text',
              text: '**AFTER Screenshot** (with changes applied)'
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const aiResponse = result.choices[0].message.content;

    // Parse JSON from AI response
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Fallback if AI didn't return JSON
    return {
      passed: true,
      message: aiResponse,
      rawResponse: aiResponse
    };
  }

  validateCodeSyntax(css, js) {
    const criticalIssues = [];
    const warnings = [];

    // CSS Syntax Validation
    if (css) {
      const cssResult = this.validateCSSSyntax(css);
      criticalIssues.push(...cssResult.critical);
      warnings.push(...cssResult.warnings);
    }

    // JavaScript Syntax Validation
    if (js) {
      const jsResult = this.validateJSSyntax(js);
      criticalIssues.push(...jsResult.critical);
      warnings.push(...jsResult.warnings);
    }

    return {
      isValid: criticalIssues.length === 0,
      issues: criticalIssues,
      warnings: warnings
    };
  }

  validateCSSSyntax(css) {
    const critical = [];
    const warnings = [];
    
    try {
      // Check for unmatched braces (critical)
      const openBraces = (css.match(/\{/g) || []).length;
      const closeBraces = (css.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        critical.push(`CSS: Unmatched braces (${openBraces} open, ${closeBraces} close)`);
      }
      
      // Check for basic syntax patterns (warnings)
      if (css.includes(';;')) {
        warnings.push('CSS: Double semicolons detected');
      }
      
      if (css.match(/[^{}]*\{[^}]*\{/)) {
        warnings.push('CSS: Potential nested braces issue');
      }
      
      // Check for many !important declarations (warning)
      const importantCount = (css.match(/!important/g) || []).length;
      if (importantCount > 3) {
        warnings.push(`CSS: Many !important declarations (${importantCount})`);
      }
      
    } catch (error) {
      critical.push(`CSS: Validation error - ${error.message}`);
    }
    
    return { critical, warnings };
  }

  validateJSSyntax(js) {
    const critical = [];
    const warnings = [];
    
    try {
      // Basic JavaScript syntax checking
      // Check for unmatched parentheses (critical)
      let parenLevel = 0;
      let braceLevel = 0;
      
      for (let i = 0; i < js.length; i++) {
        const char = js[i];
        if (char === '(') parenLevel++;
        if (char === ')') parenLevel--;
        if (char === '{') braceLevel++;
        if (char === '}') braceLevel--;
        
        if (parenLevel < 0) {
          critical.push('JavaScript: Unmatched closing parenthesis');
          break;
        }
        if (braceLevel < 0) {
          critical.push('JavaScript: Unmatched closing brace');
          break;
        }
      }
      
      if (parenLevel > 0) {
        critical.push('JavaScript: Unclosed parentheses');
      }
      if (braceLevel > 0) {
        critical.push('JavaScript: Unclosed braces');
      }

      // NOTE: Cannot use new Function() or eval() due to CSP restrictions
      // Basic syntax validation only - code will be validated during actual execution
      
      // Warning-level checks
      if (js.includes('console.log')) {
        warnings.push('JavaScript: Console.log statements found (consider removing for production)');
      }
      
      if (js.length > 5000) {
        warnings.push(`JavaScript: Large code size (${js.length} characters)`);
      }
      
    } catch (error) {
      critical.push(`JavaScript: Validation error - ${error.message}`);
    }
    
    return { critical, warnings };
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
