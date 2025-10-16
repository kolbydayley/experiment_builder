// Background service worker for Chrome extension - FIXED VERSION
console.log('🚀 Service Worker Loading - Convert.com Experiment Builder (Fixed)');

class ServiceWorker {
  constructor() {
    console.log('🔧 ServiceWorker constructor called');
    this.serviceWorkerStartTime = Date.now(); // Track when service worker started
    this.initializeExtension();
    this.maxLogEntries = 200;
    this.recentLogs = [];
    this.CAPTURE_TIMEOUT = 15000; // 15 second timeout for captures

    // Simple cache for element databases (reduces repetitive processing)
    this.elementDatabaseCache = new Map();
    this.CACHE_TTL = 60000; // 1 minute cache

    // Abort controller for cancelling AI requests
    this.currentAbortController = null;
    this.currentRequestContext = null; // Store context for reverting
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
      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('❌ Message handler error:', error);
        sendResponse({ success: false, error: error.message });
      });
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
          sendResponse({
            success: true,
            code: generated.code,
            usage: generated.usage,
            logs: generated.logs,
            testResults: generated.testResults,
            testScript: generated.testScript // NEW: Include test script
          });
          break;
        }

        case 'ADJUST_CODE': {
          // TEMPORARY: RefinementContext disabled due to service worker CSP limitations
          // Using proven adjustCode method instead
          // TODO: Refactor RefinementContext to work in service worker environment
          try {
            console.log('📨 [ADJUST_CODE] Received refinement request');
            const adjusted = await this.adjustCode(message.data, sender?.tab?.id);
            console.log('✅ [ADJUST_CODE] Refinement completed successfully');
            sendResponse({ success: true, code: adjusted.code, usage: adjusted.usage, logs: adjusted.logs });
          } catch (error) {
            console.error('❌ [ADJUST_CODE] Error:', error.message);
            sendResponse({ success: false, error: error.message, logs: this.takeRecentLogs() });
          }
          break;
        }

        case 'STOP_AI_REQUEST':
          console.log('🛑 Stop AI request received');
          if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
            sendResponse({ success: true, context: this.currentRequestContext });
            this.currentRequestContext = null;
          } else {
            sendResponse({ success: false, error: 'No active request to stop' });
          }
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

            // CRITICAL: Ensure content script is loaded (handles page reloads)
            const wasJustInjected = await this.ensureContentScriptLoaded(tabId);

            // If scripts were just injected, give them extra time to fully initialize
            if (wasJustInjected) {
              console.log('⏳ Scripts just injected, waiting for full initialization...');
              await this.wait(300); // Extra delay for message listeners to register
            }

            console.log('📤 Sending previewCode message to tab', tabId);
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

        case 'EXECUTE_PREVIEW_JS':
          try {
            // Get active tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
              throw new Error('No active tab found');
            }
            const tabId = tabs[0].id;

            console.log('🚀 Executing preview JS via chrome.scripting.executeScript (CSP-safe)');
            console.log(`📝 Received JS (${message.js.length} chars):`, message.js.substring(0, 300) + '...');

            // 🆕 Extract globalJS from the combined code if present
            // The message.js may contain both globalJS (helper functions) and variation JS
            // Strategy: Split at the first non-function line (waitForElement call)
            let globalHelpers = '';
            let variationCode = message.js;

            // Find all function declarations at the start
            // Match: function name(...) { ... } including nested braces
            const lines = message.js.split('\n');
            let functionEndIndex = 0;
            let braceDepth = 0;
            let inFunction = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();

              // Check if line starts a function
              if (line.startsWith('function ')) {
                inFunction = true;
              }

              // Count braces
              for (const char of line) {
                if (char === '{') braceDepth++;
                if (char === '}') braceDepth--;
              }

              // If we were in a function and braces are balanced, function ended
              if (inFunction && braceDepth === 0 && line.includes('}')) {
                functionEndIndex = i + 1;
                inFunction = false;
              }

              // If we hit a non-function line and no function is open, stop
              if (!inFunction && braceDepth === 0 && line.length > 0 &&
                  !line.startsWith('function ') && !line.startsWith('//')) {
                break;
              }
            }

            if (functionEndIndex > 0) {
              globalHelpers = lines.slice(0, functionEndIndex).join('\n');
              variationCode = lines.slice(functionEndIndex).join('\n').trim();
              const funcCount = (globalHelpers.match(/^function\s+\w+/gm) || []).length;
              console.log(`📦 Detected ${funcCount} helper functions (${globalHelpers.length} chars)`);
              console.log(`📝 Global helpers preview:`, globalHelpers.substring(0, 200) + '...');
              console.log(`📝 Variation code preview:`, variationCode.substring(0, 200) + '...');
            } else {
              console.log('⚠️ No helper functions detected in code');
              console.log(`📝 Full code preview (first 500 chars):`, message.js.substring(0, 500));
            }

            // Build the complete code with waitForElement utility
            const waitForElementUtility = `
              if (typeof window.waitForElement === 'undefined') {
                window.waitForElement = function(selector, callback, maxWait = 10000) {
                  console.log('[Convert AI] Waiting for element:', selector);
                  const start = Date.now();
                  const interval = setInterval(() => {
                    try {
                      const element = document.querySelector(selector);
                      if (element) {
                        clearInterval(interval);
                        console.log('[Convert AI] ✓ Found element:', selector);
                        callback(element);
                      } else if (Date.now() - start > maxWait) {
                        clearInterval(interval);
                        console.warn('[Convert AI] Element not found after timeout:', selector);
                      }
                    } catch (e) {
                      clearInterval(interval);
                      console.error('[Convert AI] Invalid selector:', selector, e);
                    }
                  }, 100);

                  // AUTO-TRACK: Register interval with Cleanup Manager
                  if (window.ConvertCleanupManager) {
                    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
                  } else {
                    console.warn('[Convert AI] Cleanup Manager not available, interval not tracked');
                  }
                };
              }
            `;

            const fullCode = `
              ${waitForElementUtility}

              ${globalHelpers}

              console.log('[Convert AI Preview] Starting variation ${message.variationNumber} execution...');
              try {
                ${variationCode}
                console.log('[Convert AI Preview] ✓ Variation ${message.variationNumber} executed successfully');
              } catch (error) {
                console.error('[Convert AI Preview] ✗ Execution error:', error);
              }
            `;

            // Execute using chrome.scripting.executeScript (bypasses CSP)
            await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN', // Execute in page context, not isolated world
              func: (code) => {
                eval(code);
              },
              args: [fullCode]
            });

            console.log('✅ Preview JS executed successfully via chrome.scripting');
            sendResponse({ success: true });
          } catch (error) {
            console.error('❌ Execute preview JS error:', error);
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

            // CRITICAL: Ensure content script is loaded (handles page reloads)
            await this.ensureContentScriptLoaded(tabId);

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

        case 'CLEAR_INJECTED_ASSETS':
          try {
            const tabId = message.tabId;
            if (!tabId) {
              throw new Error('No tab ID provided');
            }

            console.log('🧹 Clearing all injected assets on tab', tabId);

            // Send RESET_VARIATION message to content script
            await chrome.tabs.sendMessage(tabId, {
              type: 'RESET_VARIATION',
              keyPrefix: '' // Empty prefix clears all
            });

            console.log('✅ Injected assets cleared');
            sendResponse({ success: true });
          } catch (error) {
            console.error('Clear injected assets error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'ENSURE_CLEANUP_MANAGER':
          try {
            // Get active tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
              throw new Error('No active tab found');
            }
            const tabId = tabs[0].id;

            console.log('🔧 Ensuring Cleanup Manager is initialized on tab', tabId);

            // Read the cleanup manager file
            const cleanupManagerCode = await fetch(chrome.runtime.getURL('utils/cleanup-manager.js')).then(r => r.text());

            // Execute in MAIN world (page context)
            await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: (code) => {
                eval(code);
              },
              args: [cleanupManagerCode]
            });

            console.log('✅ Cleanup Manager initialized');
            sendResponse({ success: true });
          } catch (error) {
            console.error('❌ Ensure Cleanup Manager error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'RESET_VIA_CLEANUP_MANAGER':
          try {
            // Get active tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
              throw new Error('No active tab found');
            }
            const tabId = tabs[0].id;

            console.log('🧹 Resetting via Cleanup Manager on tab', tabId);

            // Execute reset in MAIN world
            const result = await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: () => {
                if (window.ConvertCleanupManager) {
                  return window.ConvertCleanupManager.resetAll();
                } else {
                  throw new Error('Cleanup Manager not initialized');
                }
              }
            });

            const summary = result[0]?.result;
            console.log('✅ Cleanup Manager reset complete:', summary);
            sendResponse({ success: true, summary });
          } catch (error) {
            console.error('❌ Reset via Cleanup Manager error:', error);
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
            const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
              format: 'jpeg',  // Use JPEG for smaller file size
              quality: 85      // Balance quality vs size
            });
            sendResponse({ success: true, screenshot });
          } catch (error) {
            console.error('After-injection capture failed:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'EXECUTE_TEST_SCRIPT':
          try {
            const startTime = Date.now();
            const maxRetries = 2;
            let lastError = null;

            // Get active tab
            let tabId = message.tabId;
            if (!tabId) {
              const tabs = await chrome.tabs.query({active: true, currentWindow: true});
              if (!tabs[0]) {
                throw new Error('No active tab found');
              }
              tabId = tabs[0].id;
            }

            console.log('🧪 Executing test script on tab', tabId);

            // Configure timeout (default 10s, max 20s for complex tests)
            let timeout = message.timeout || 10000;

            // Build executable code (test patterns + test script)
            const executableCode = this.buildTestExecutionCode(message.testScript);

            // Retry loop with recovery
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
              try {
                if (attempt > 0) {
                  console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);

                  // Recovery strategy: Increase timeout on retry
                  timeout = Math.min(timeout * 1.5, 20000);
                  console.log(`  Increased timeout to ${timeout}ms`);

                  // Add brief delay before retry
                  await new Promise(resolve => setTimeout(resolve, 500));
                }

                if (timeout > 20000) {
                  console.warn(`⚠️ Test timeout capped at 20s (requested: ${timeout}ms)`);
                }
                const finalTimeout = Math.min(timeout, 20000);

                // Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => {
                    reject(new Error(`Test execution timed out after ${finalTimeout}ms`));
                  }, finalTimeout);
                });

                // Create execution promise
                const executionPromise = chrome.scripting.executeScript({
                  target: { tabId },
                  world: 'MAIN',
                  func: (code) => {
                    return eval(code);
                  },
                  args: [executableCode]
                });

                // Race between execution and timeout
                const result = await Promise.race([executionPromise, timeoutPromise]);

                const testResults = result[0]?.result;

                if (!testResults) {
                  throw new Error('No results returned from test execution');
                }

                const duration = Date.now() - startTime;
                console.log(`✅ Test execution complete (${duration}ms, attempt ${attempt + 1}):`, testResults);

                sendResponse({
                  success: true,
                  results: testResults,
                  metadata: {
                    duration,
                    timeout: finalTimeout,
                    tabId,
                    attempts: attempt + 1
                  }
                });
                return; // Success - exit case
              } catch (error) {
                lastError = error;
                console.error(`❌ Test execution attempt ${attempt + 1} failed:`, error.message);

                // If this was the last attempt, fall through to error response
                if (attempt === maxRetries) {
                  break;
                }

                // Otherwise, continue to next attempt
              }
            }

            // All retries exhausted
            const duration = Date.now() - startTime;
            console.error('❌ Test execution failed after all retries:', lastError);

            sendResponse({
              success: false,
              error: lastError.message,
              errorType: this.classifyTestError(lastError),
              metadata: {
                duration,
                tabId: message.tabId,
                attempts: maxRetries + 1
              }
            });
          } catch (error) {
            // Catch-all for unexpected errors
            console.error('❌ Test execution unexpected error:', error);

            sendResponse({
              success: false,
              error: error.message,
              errorType: 'unexpected',
              metadata: {
                tabId: message.tabId
              }
            });
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
  // Returns true if scripts were just injected, false if already loaded
  async ensureContentScriptLoaded(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      console.log('✅ Content scripts already loaded');
      return false; // Already loaded, no injection needed
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
          return true; // Just injected
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
    const { pageData, description, designFiles, variations, settings, selectedElement, intentAnalysis } = data;
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

      // ✨ NEW: Use specialized system prompt for refinements
      const isRefinement = description.includes('CURRENT GENERATED CODE');
      const isVisualQARefinement = description.includes('VISUAL QA REFINEMENT') || description.includes('VISUAL QA FEEDBACK');

      const systemPrompt = isVisualQARefinement
        ? this.buildVisualQARefinementPrompt()
        : isRefinement
        ? this.buildRefinementSystemPrompt()
        : `You are an expert at generating clean, production-ready JavaScript and CSS code for A/B tests using only vanilla JavaScript.

CRITICAL CONSTRAINT: You will be given a list of valid CSS selectors. You MUST use ONLY these exact selectors in your code. Do NOT create, modify, or invent any selectors. If you use a selector not in the provided list, the code will fail completely.

When you see "YOU MUST ONLY USE THESE SELECTORS" in the user's message, that list is the ONLY source of valid selectors. Copy them character-by-character.`;

      const messages = [{
        role: 'system',
        content: systemPrompt
      }];

      // Build user message with screenshot for brand/style context
      const userContent = [];

      // Include full page screenshot (NOT selected element screenshot) for brand context
      if (pageData.screenshot) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: pageData.screenshot.replace(/^data:image\/png;base64,/, '')
          }
        });
        userContent.push({
          type: 'text',
          text: '📸 **FULL PAGE SCREENSHOT (BEFORE ANY CHANGES):**\nUse this screenshot to understand the page\'s brand identity, visual style, color palette, typography, and overall design language. Your generated code should match this existing style and feel cohesive with the page\'s visual identity. Pay attention to:\n- Brand colors and color harmony\n- Typography styles (font sizes, weights, hierarchy)\n- Button styles and UI patterns\n- Spacing and layout consistency\n- Visual tone and brand voice (professional, playful, minimal, etc.)\n\n'
        });
        logger.log('Including full page screenshot', 'for brand/style context');
      } else {
        logger.log('No screenshot available', 'proceeding with text-only mode');
      }

      // Add the main prompt
      userContent.push({
        type: 'text',
        text: prompt
      });

      messages.push({
        role: 'user',
        content: userContent
      });
      
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

      // 🆕 AUTO-FIX: Detect and generate missing helper functions
      parsedCode = await this.ensureHelperFunctionsExist(parsedCode, aiSettings);

      // ✨ Phase 2.2: Validate refinement and retry if broken
      // Skip validation for Visual QA refinements (they need to modify code to fix defects)
      if (isRefinement && !isVisualQARefinement) {
        const oldCodeMatch = description.match(/CURRENT GENERATED CODE:([\s\S]*?)(?:NEW REQUEST TO ADD:|$)/);
        if (oldCodeMatch && oldCodeMatch[1]) {
          const oldCode = oldCodeMatch[1].trim();
          const newCode = parsedCode.variations[0]?.js || '';

          // Phase 2.2: Get refinementType from intentAnalysis (default to incremental)
          const refinementType = intentAnalysis?.refinementType || 'incremental';

          // Skip validation for visual_qa mode (aggressive fixes are allowed)
          const shouldValidate = refinementType !== 'visual_qa';

          // 🤖 AI-powered validation (no heuristics - they never work)
          const validation = shouldValidate ? await this.validateRefinementWithAI(oldCode, newCode, description, aiSettings) : null;

          // Only validate if AI validation is available and validation is needed
          if (shouldValidate && validation && !validation.isValid && validation.severity === 'critical') {
            logger.log('Refinement validation FAILED - Retrying', `issues=${validation.issues.length}`);
            console.warn('🔄 AI broke the code - automatically retrying with corrective feedback...');

            // Build corrective feedback prompt
            const correctiveFeedback = `
❌ VALIDATION FAILED - YOUR PREVIOUS RESPONSE BROKE THE CODE ❌

CRITICAL ERRORS DETECTED:
${validation.issues.map((issue, i) => `
${i + 1}. ${issue.message}
   Impact: ${issue.impact}
   Details: ${typeof issue.details === 'string' ? issue.details : JSON.stringify(issue.details)}
`).join('\n')}

CORRECTIVE INSTRUCTIONS:
${validation.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

🔴 TRY AGAIN - THIS TIME:
1. Start with the EXACT original code (copy it character-by-character)
2. Add ONLY the new change requested by user
3. Do NOT remove any existing selectors
4. Do NOT remove any existing style properties
5. Do NOT rewrite or "optimize" existing code

Original code you MUST preserve:
\`\`\`javascript
${oldCode}
\`\`\`

User's NEW addition request:
${description.split('NEW REQUEST TO ADD:')[1] || description}

Now generate the corrected code with ALL original functionality preserved.`;

            // Retry with corrective feedback
            const retryMessages = [
              {
                role: 'system',
                content: this.buildRefinementSystemPrompt()
              },
              {
                role: 'user',
                content: userContent
              },
              {
                role: 'assistant',
                content: aiResponse.content
              },
              {
                role: 'user',
                content: correctiveFeedback
              }
            ];

            const retryResponse = await this.callAI(retryMessages, aiSettings);
            parsedCode = this.parseGeneratedCode(retryResponse.content);

            // Validate again with AI (no heuristics)
            const retryValidation = await this.validateRefinementWithAI(oldCode, parsedCode.variations[0]?.js || '', description, aiSettings);

            if (retryValidation && retryValidation.isValid) {
              logger.log('Refinement retry SUCCEEDED', 'Code now preserves existing functionality');
              console.log('✅ Retry successful - code is now valid');
            } else if (retryValidation) {
              logger.log('Refinement retry still has issues', `severity=${retryValidation.severity}`);
              console.warn('⚠️ Retry improved code but still has issues:', retryValidation.issues);
              // Continue anyway - user can fix manually if needed
            } else {
              console.log('⚠️ Retry validation unavailable - accepting code as-is');
            }
          } else if (validation && validation.isValid) {
            logger.log('Refinement validation PASSED', 'Code preserved existing functionality');
          } else if (validation) {
            logger.log('Refinement validation warnings', `severity=${validation.severity}, issues=${validation.issues.length}`);
          }
        }
      } else if (isVisualQARefinement) {
        logger.log('Visual QA refinement detected', 'Skipping validation - allowing code modifications to fix defects');
        console.log('🩹 [Visual QA] Applying defect fixes without validation');
      }

      // ✨ VALIDATION: Check if selectors exist in database (skip for Visual QA - it creates new elements)
      if (!isVisualQARefinement) {
        const validationWarnings = this.validateSelectorsAgainstDatabase(parsedCode, pageData.elementDatabase);
        if (validationWarnings.length > 0) {
          logger.log('Selector validation warnings', `${validationWarnings.length} selectors not found in database`);
          validationWarnings.forEach(warning => logger.log('Invalid selector', warning));

          // ✨ AUTO-FIX: Replace generic selectors with specific ones from database
          logger.log('Auto-fixing generic selectors', 'Replacing with database selectors...');
          parsedCode = this.fixGenericSelectors(parsedCode, pageData.elementDatabase, tabId);
          logger.log('Auto-fix complete', 'Generic selectors replaced');
        }
      } else {
        logger.log('Visual QA refinement', 'Skipping selector validation - code creates new elements');
        console.log('🩹 [Visual QA] Allowing new selectors for defect fixes (e.g., close button)');
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

            // 🆕 CRITICAL: Prepend globalJS and globalCSS to variation code
            // Helper functions in globalJS must be available before variation JS runs
            const combinedCSS = (parsedCode.globalCSS || '') + '\n' + (variation.css || '');
            const combinedJS = (parsedCode.globalJS || '') + '\n' + (variation.js || '');

            logger.log('Code combination', `globalCSS=${(parsedCode.globalCSS || '').length}chars, varCSS=${(variation.css || '').length}chars, globalJS=${(parsedCode.globalJS || '').length}chars, varJS=${(variation.js || '').length}chars`);

            await this.applyVariationCode({
              tabId: tabId,
              css: combinedCSS.trim(),
              js: combinedJS.trim(),
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

      // ✨ NEW: Generate test script for interactive validation
      let testScriptData = null;

      // Check settings (defaults to enabled if not set)
      const testScriptSettings = mergedSettings?.testScriptGeneration || { enabled: true, timeout: 10000 };

      // Skip test script generation for refinements unless new interactions were added
      const shouldGenerateTestScript = testScriptSettings.enabled !== false &&
        (!isRefinement || this.refinementAddedNewInteractions(description));

      if (shouldGenerateTestScript) {
        try {
          logger.log('Generating test script', 'Analyzing for interactive features...');

          // Inline simple test script generation (avoiding external dependencies)
          const testScript = await this.generateTestScript(
            {
              css: parsedCode.variations[0]?.css || '',
              js: parsedCode.variations[0]?.js || ''
            },
            description,
            aiSettings
          );

          if (testScript) {
            testScriptData = testScript;
            logger.log('Test script generated', `interactions=${testScript.requirements?.types?.join(',') || 'none'}`);
          } else {
            logger.log('Test script skipped', 'No interactive features detected');
          }
        } catch (error) {
          logger.error('Test script generation failed', error.message);
          // Don't throw - test script is optional
        }
      } else if (isRefinement) {
        logger.log('Test script generation skipped', 'Refinement with no new interactions');
      } else {
        logger.log('Test script generation disabled', 'Skipping per user settings');
      }

      return {
        code: parsedCode,
        testResults: testResults,
        testScript: testScriptData, // NEW: Include test script
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

    // Extract CSS selectors from CSS code only
    const extractCSSSelectors = (css) => {
      if (!css) return [];
      const selectors = [];

      // Extract from CSS (selector before {)
      const cssMatches = css.matchAll(/([^{}]+)\s*\{/g);
      for (const match of cssMatches) {
        const selector = match[1].trim().split(',').map(s => s.trim());
        selectors.push(...selector);
      }

      return selectors;
    };

    // Extract JS selectors from JS code only (from waitForElement calls)
    const extractJSSelectors = (js) => {
      if (!js) return [];
      const selectors = [];

      // Extract from waitForElement calls only
      const jsMatches = js.matchAll(/waitForElement\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const match of jsMatches) {
        selectors.push(match[1]);
      }

      return selectors;
    };

    // Check each variation
    parsedCode.variations?.forEach((variation, idx) => {
      const cssSelectors = extractCSSSelectors(variation.css);
      const jsSelectors = extractJSSelectors(variation.js);

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

  /**
   * Build specialized system prompt for Visual QA defect fixes
   * Used when fixing visual defects detected by automated QA
   */
  buildVisualQARefinementPrompt() {
    return `You are a Visual QA defect remediation specialist. Your task is to FIX VISUAL DEFECTS.

🔴 CRITICAL INSTRUCTION - VISUAL QA MODE:
- You will receive EXISTING CODE with VISUAL DEFECTS
- You will receive SPECIFIC DEFECTS that MUST be fixed
- Your output MUST: FIX ALL DEFECTS while preserving overall functionality
- This is NOT normal refinement - you MUST MODIFY/ADD/REMOVE code to fix defects

⚠️ VISUAL QA MODE - DIFFERENT FROM NORMAL REFINEMENTS:
Unlike normal refinements where you preserve all existing code, Visual QA mode allows you to:
✅ MODIFY existing CSS/JS to fix defects
✅ REMOVE problematic elements (e.g., remove separator colons)
✅ ADD missing elements (e.g., add close button)
✅ CHANGE selectors if needed to target correct elements
✅ RESTRUCTURE code if necessary to fix layout issues

🎯 YOUR PRIORITY HIERARCHY:
1. **FIX ALL CRITICAL DEFECTS** (highest priority)
2. **FIX ALL MAJOR DEFECTS** (high priority)
3. **Preserve working functionality** (medium priority - but can be changed to fix defects)
4. **Maintain code quality** (lowest priority)

📋 VISUAL QA EXAMPLES:

Example 1 - Removing Unwanted Elements:
DEFECT: "Colons between timer boxes must be removed"
EXISTING CODE:
<span class="timer-separator">:</span>

✅ CORRECT FIX:
// Find and remove separators
document.querySelectorAll('.timer-separator').forEach(el => el.remove());

Example 2 - Adding Missing Elements:
DEFECT: "Exit button missing - add close button"
EXISTING CODE:
<div class="banner">Content here</div>

✅ CORRECT FIX:
// Add close button
const closeBtn = document.createElement('button');
closeBtn.textContent = '×';
closeBtn.className = 'banner-close-btn';
closeBtn.onclick = () => banner.remove();
banner.appendChild(closeBtn);

// Add CSS for close button
const style = document.createElement('style');
style.textContent = \`.banner-close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
}\`;
document.head.appendChild(style);

Example 3 - Banner/Navigation Overlap (MOST COMMON ISSUE):
DEFECT: "BANNER OVERLAP: The new countdown banner overlaps with the top navigation bar"
EXISTING CODE:
// Banner with position: fixed at top
.promo-banner {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  z-index: 1000;
}

✅ CORRECT FIX (Use BOTH approaches):
// Approach 1: Add body padding to push content down
body {
  padding-top: 80px !important;  /* Banner height + extra space */
}

// Approach 2: Increase navigation margin-top
nav.primary-nav {
  margin-top: 90px !important;  /* Increased from 70px to 90px */
}

// OR if nav has different selector:
nav.header-navs__items {
  margin-top: 100px !important;  /* Create clearance below fixed banner */
}

Example 4 - Spacing Issues:
DEFECT: "Timer boxes overlap - need spacing between elements"
EXISTING CODE:
.timer-box {
  display: inline-block;
  margin: 0;
}

✅ CORRECT FIX:
.timer-box {
  display: inline-block;
  margin: 0 10px !important;  /* Add horizontal spacing */
}

🔴 CRITICAL RULES FOR VISUAL QA:
1. **READ THE DEFECT DESCRIPTIONS**: Each defect tells you EXACTLY what's wrong
2. **IMPLEMENT THE SUGGESTED FIX**: Use the "MANDATORY CSS/JS CHANGE" provided
3. **BE AGGRESSIVE WITH FIXES**: Don't preserve code that causes defects
4. **USE !important**: For CSS fixes, use !important to override existing styles
5. **TEST YOUR FIX**: Mentally verify your fix actually addresses the defect

Remember: Your goal is DEFECT ELIMINATION, not code preservation. Fix the issues!`;
  }

  /**
   * Build specialized system prompt for code refinement
   * Used when modifying existing working code
   */
  buildRefinementSystemPrompt() {
    return `You are a code refinement specialist. Your task is SURGICAL MODIFICATION ONLY.

🔴 CRITICAL INSTRUCTION - READ 3 TIMES BEFORE RESPONDING:
- You will receive EXISTING CODE that is ALREADY WORKING
- You will receive ONE NEW CHANGE REQUEST
- Your output MUST be: EXACT EXISTING CODE + ONLY THE NEW CHANGE
- Think of it as diff/patch, not rewrite

🔒 BASE PAGE STATE CONCEPT (Phase 1.3):
**CRITICAL:** The element database represents the page BEFORE ANY CODE RUNS.
- This is the ORIGINAL, UNMODIFIED page state
- Your code executes on this base page, not on a previously-modified page
- When you see a button with text "Buy Now", that's the STARTING state
- Your code transforms it FROM that original state
- Previous variations DO NOT affect the base page
- Each variation starts from the same clean slate

Example:
- Base page: Button says "Buy Now" with blue background
- Variation 1: Changes text to "Get Started" and makes it red
- Variation 2 (refinement): Sees ORIGINAL "Buy Now" + blue, NOT the modified version
- Your refinement code operates on "Buy Now" + blue, transforming it further

This means: selectors target ORIGINAL elements, not modified ones.

⛔ WHAT YOU MUST NOT DO:
❌ Do NOT rewrite existing code
❌ Do NOT "optimize" or "clean up" existing code
❌ Do NOT remove any existing functionality
❌ Do NOT change existing selectors
❌ Do NOT consolidate similar logic
❌ Do NOT simplify code structure
❌ Do NOT replace element.style.X with cssText
❌ Do NOT merge waitForElement calls

✅ WHAT YOU MUST DO:
✅ Copy all existing code character-by-character
✅ Add ONLY the new requested change
✅ Keep all existing waitForElement calls
✅ Keep all existing element.dataset.varApplied checks
✅ If modifying same element, add new properties alongside existing ones
✅ Preserve exact formatting and structure

📋 REFINEMENT EXAMPLES - STUDY THESE:

Example 1 - Adding Style Property:
EXISTING CODE:
waitForElement('button.cta', (btn) => {
  btn.style.backgroundColor = 'red';
  btn.style.fontSize = '18px';
});

USER REQUEST: "make button even more prominent"

✅ CORRECT OUTPUT (preserve + add):
waitForElement('button.cta', (btn) => {
  btn.style.backgroundColor = 'red';      // ← KEEP
  btn.style.fontSize = '18px';           // ← KEEP
  btn.style.fontWeight = 'bold';         // ← ADD
  btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'; // ← ADD
});

❌ WRONG OUTPUT (rewrite):
waitForElement('button.cta', (btn) => {
  btn.style.cssText = 'background: red; font-size: 20px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.2);';
  // ❌ This changed fontSize from 18px to 20px
  // ❌ This used cssText instead of individual properties
  // ❌ This is a rewrite, not an addition
});

Example 2 - Multiple Elements:
EXISTING CODE:
waitForElement('h1.title', (el) => {
  el.style.color = 'blue';
});

waitForElement('button.cta', (el) => {
  el.style.backgroundColor = 'red';
});

USER REQUEST: "make headline bigger"

✅ CORRECT OUTPUT (preserve both blocks):
waitForElement('h1.title', (el) => {
  el.style.color = 'blue';        // ← KEEP
  el.style.fontSize = '2.5em';    // ← ADD
});

waitForElement('button.cta', (el) => {  // ← KEEP ENTIRE BLOCK
  el.style.backgroundColor = 'red';
});

❌ WRONG OUTPUT (removed unrelated code):
waitForElement('h1.title', (el) => {
  el.style.color = 'blue';
  el.style.fontSize = '2.5em';
});
// ❌ Where did the button code go?

🏥 TREAT THIS AS A MEDICAL OPERATION:
- Existing code is the patient's working organs
- New request is the surgical procedure
- Your job: add/modify ONLY what's needed
- Leave everything else UNTOUCHED

Before responding, mentally checklist:
□ Did I copy ALL existing waitForElement calls?
□ Did I preserve ALL existing style properties?
□ Did I ONLY add the new requested change?
□ Did I avoid any "optimizations" or "cleanups"?
□ Would the user recognize their existing code?`;
  }

  /**
   * Analyze existing code to extract what's already implemented
   * Returns structured data about selectors, properties, and functions
   */
  analyzeExistingCode(code) {
    if (!code || typeof code !== 'string') {
      return {
        selectors: new Set(),
        properties: {},
        functions: [],
        waitForElementCalls: [],
        textContentChanges: [],
        hasCode: false
      };
    }

    const analysis = {
      selectors: new Set(),
      properties: {},
      functions: [],
      waitForElementCalls: [],
      textContentChanges: [],
      hasCode: true
    };

    try {
      // Extract all waitForElement selectors
      const selectorMatches = code.matchAll(/waitForElement\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const match of selectorMatches) {
        const selector = match[1];
        analysis.selectors.add(selector);
        analysis.waitForElementCalls.push({
          selector,
          fullMatch: match[0]
        });
      }

      // Extract all document.querySelector selectors
      const querySelectorMatches = code.matchAll(/document\.querySelector(?:All)?\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const match of querySelectorMatches) {
        analysis.selectors.add(match[1]);
      }

      // Extract style property assignments
      const styleMatches = code.matchAll(/\.style\.(\w+)\s*=\s*(['"`])([^'"`]+)\2/g);
      for (const match of styleMatches) {
        const [_, property, quote, value] = match;
        if (!analysis.properties[property]) {
          analysis.properties[property] = [];
        }
        analysis.properties[property].push(value);
      }

      // Extract textContent changes
      const textMatches = code.matchAll(/\.textContent\s*=\s*(['"`])([^'"`]+)\1/g);
      for (const match of textMatches) {
        const [_, quote, text] = match;
        analysis.textContentChanges.push(text);
        if (!analysis.properties['textContent']) {
          analysis.properties['textContent'] = [];
        }
        analysis.properties['textContent'].push(text);
      }

      // Extract innerHTML changes
      const htmlMatches = code.matchAll(/\.innerHTML\s*=\s*(['"`])([^'"`]+)\1/g);
      for (const match of htmlMatches) {
        if (!analysis.properties['innerHTML']) {
          analysis.properties['innerHTML'] = [];
        }
        analysis.properties['innerHTML'].push(match[2]);
      }

      // Extract function definitions
      const functionMatches = code.matchAll(/function\s+(\w+)\s*\(/g);
      for (const match of functionMatches) {
        analysis.functions.push(match[1]);
      }

      // Extract arrow function assignments
      const arrowFunctionMatches = code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g);
      for (const match of arrowFunctionMatches) {
        analysis.functions.push(match[1]);
      }

    } catch (error) {
      console.error('Error analyzing existing code:', error);
    }

    return analysis;
  }

  /**
   * Phase 2.1: Validate refinement to ensure code wasn't broken
   * Checks that old selectors/properties are preserved in new code
   * Phase 2.2: Skip validation for user-requested full rewrites
   * Visual QA: Skip strict validation for Visual QA fixes
   */
  /**
   * AI-powered validation: Use AI to check if refinement is valid
   * Much smarter than brittle heuristics
   * @param {object} aiSettings - AI settings with API keys (passed from parent)
   */
  async validateRefinementWithAI(oldCode, newCode, userRequest, aiSettings) {
    try {
      // Strip base64 images/screenshots from user request (they're HUGE and not needed for validation)
      // This is what causes 2.39MB requests - images are embedded as base64
      const cleanRequest = userRequest
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[IMAGE REMOVED FOR VALIDATION]')
        .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '[IMAGE]')
        .replace(/src="data:image\/[^"]+"/g, 'src="[IMAGE]"');

      // Extract just the user's actual request text (after "NEW REQUEST TO ADD:")
      const requestMatch = cleanRequest.match(/NEW REQUEST TO ADD:\s*(.+?)(?:\n\n|$)/s);
      const actualRequest = requestMatch ? requestMatch[1].trim() : cleanRequest;

      // Log size reduction
      const originalSize = userRequest.length;
      const cleanedSize = actualRequest.length;
      if (originalSize > 100000) {
        console.log(`📉 Request size reduced: ${Math.round(originalSize / 1024)}KB → ${Math.round(cleanedSize / 1024)}KB (removed images)`);
      }

      const validationPrompt = `You are a code review AI. Your job is to verify that a code refinement was done correctly.

USER'S REFINEMENT REQUEST:
${actualRequest}

ORIGINAL CODE:
\`\`\`javascript
${oldCode}
\`\`\`

NEW CODE AFTER REFINEMENT:
\`\`\`javascript
${newCode}
\`\`\`

QUESTION: Did the AI follow the user's request appropriately?

Respond ONLY with valid JSON in this exact format:
{
  "isValid": true/false,
  "reason": "Brief explanation of why valid or invalid",
  "severity": "none"/"warning"/"critical"
}

RULES:
- isValid: true = AI did what user asked (even if it rewrote code to do it)
- isValid: false = AI ignored request, broke working code, or did something completely different
- severity: "critical" only if code is completely broken or wrong
- severity: "warning" if minor issues but generally correct
- severity: "none" if everything is good

Be LENIENT - allow code rewrites if they accomplish the user's goal.`;

      const messages = [
        {
          role: 'user',
          content: validationPrompt
        }
      ];

      // Use same provider/API keys as main generation, but switch to Haiku for speed
      const validationSettings = {
        ...aiSettings, // Inherit API keys from parent
        model: aiSettings.provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini' // Fast models
      };

      console.log('🤖 Using AI to validate refinement...');
      const response = await this.callAI(messages, validationSettings);

      // Parse JSON response using robust extraction
      let jsonText = response.content;

      // Remove markdown code blocks if present
      if (jsonText.includes('```json')) {
        const start = jsonText.indexOf('```json') + 7;
        const end = jsonText.indexOf('```', start);
        jsonText = jsonText.substring(start, end).trim();
      } else if (jsonText.includes('```')) {
        const start = jsonText.indexOf('```') + 3;
        const end = jsonText.indexOf('```', start);
        jsonText = jsonText.substring(start, end).trim();
      }

      // Find JSON object boundaries
      const firstBrace = jsonText.indexOf('{');
      if (firstBrace === -1) {
        throw new Error('AI validation response not in JSON format');
      }

      // Find matching closing brace
      let braceCount = 0;
      let lastBrace = firstBrace;
      for (let i = firstBrace; i < jsonText.length; i++) {
        if (jsonText[i] === '{') braceCount++;
        if (jsonText[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastBrace = i;
            break;
          }
        }
      }

      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      const result = JSON.parse(jsonText);
      console.log('✅ AI Validation Result:', result);

      return {
        isValid: result.isValid,
        severity: result.severity || 'none',
        issues: result.isValid ? [] : [{
          type: 'ai_validation',
          severity: result.severity || 'critical',
          message: result.reason,
          impact: 'AI did not follow user request correctly'
        }],
        suggestions: result.isValid ? [] : ['Review the AI response and try again'],
        aiValidated: true
      };

    } catch (error) {
      console.error('❌ AI validation failed, falling back to heuristics:', error);
      // Fall back to heuristic validation
      return null;
    }
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

      // Only filter if we have enough elements (>= 5)
      // Small element databases should not be filtered
      if (originalCount >= 5) {
        // Keep only elements that are descendants of the selected element
        const filteredElements = topElements.filter(el => {
          // Always keep the selected element itself
          if (el.selector === selectedSelector) return true;

          // Check if element selector indicates it's within the selected scope
          // This works for selectors like "#parent .child" or "#parent > .child"
          const selectorParts = el.selector?.split(/[\s>+~]/);
          return selectorParts && selectorParts.some(part => part.includes(selectedSelector.replace(/^#/, '')));
        });

        // Only use filtered results if we still have elements
        if (filteredElements.length > 0) {
          topElements = filteredElements;
          console.log(`🔍 Filtered elements to selected scope: ${originalCount} → ${topElements.length} elements`);
          console.log(`  📍 Scope: ${selectedSelector}`);
        } else {
          console.log(`🔍 Filter would remove all elements - keeping full list (${originalCount} elements)`);
        }
      } else {
        console.log(`🔍 Element database too small (${originalCount}) - skipping scope filtering`);
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
7. Prevent duplicates: if(element.dataset.varApplied) return; element.dataset.varApplied='1';
8. **FOR COLOR CHANGES: Use CSS section with !important flags (most reliable)**
9. Text changes: element.textContent='new text' (use JS)
10. CSS overrides inline styles - prefer CSS for visual changes
11. **CRITICAL: ALL setInterval/setTimeout MUST be registered with Cleanup Manager**
    - Register intervals: window.ConvertCleanupManager.registerInterval(intervalId, 'description')
    - Register timeouts: window.ConvertCleanupManager.registerTimeout(timeoutId, 'description')
    - Register elements: window.ConvertCleanupManager.registerElement(element, 'description')
    - **NOTE: waitForElement() auto-registers its intervals - you don't need to register those**
    - **IMPORTANT: User-created setInterval/setTimeout MUST be manually registered**

🚨 **CRITICAL: NEVER MODIFY NAVIGATION OR HEADER POSITIONING** 🚨
❌ NEVER add margin-top, padding-top, or top offset to: header, nav, .nav, .header, .menu, .primary-nav, .secondary-nav
❌ FOR FIXED BANNERS: Use "body { padding-top: XXpx !important; }" ONLY - do NOT touch navigation elements
✅ CORRECT approach for fixed banner: #banner { position: fixed; top: 0; } + body { padding-top: 50px !important; }
❌ WRONG approach: #banner { position: fixed; top: 0; } + nav { margin-top: 50px !important; } ← THIS BREAKS THE PAGE

🔴 **REFINEMENT RULE (IF "CURRENT GENERATED CODE" IS IN REQUEST):**
If the REQUEST includes "CURRENT GENERATED CODE" section:
- This is a REFINEMENT of existing code
- You MUST include ALL existing code in your output
- You MUST add the new changes on top
- DO NOT remove, replace, or simplify existing code
- Think of it as: output = existing code + new changes
- The user wants to ADD features, not REPLACE them

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

    // ✨ NEW: Detect if this is a refinement request and add analysis
    let refinementPrefix = '';
    if (description.includes('CURRENT GENERATED CODE')) {
      console.log('🔧 Refinement detected - analyzing existing code...');

      // Extract existing code
      const existingCodeMatch = description.match(/CURRENT GENERATED CODE:([\s\S]*?)(?:NEW REQUEST TO ADD:|$)/);
      if (existingCodeMatch) {
        const existingCode = existingCodeMatch[1];
        const analysis = this.analyzeExistingCode(existingCode);

        if (analysis.hasCode && analysis.selectors.size > 0) {
          console.log(`  📊 Found ${analysis.selectors.size} selectors to preserve`);
          console.log(`  📊 Found ${Object.keys(analysis.properties).length} properties to preserve`);

          // Build DO NOT CHANGE list
          refinementPrefix = `
⚠️⚠️⚠️ REFINEMENT MODE - CRITICAL INSTRUCTIONS ⚠️⚠️⚠️

🔴 THIS IS A CODE REFINEMENT, NOT A REWRITE
You are modifying EXISTING WORKING CODE. Your output must be:
EXACT EXISTING CODE + ONLY THE NEW CHANGE

⛔ EXISTING IMPLEMENTATION (DO NOT REMOVE OR CHANGE):

**SELECTORS ALREADY IN USE (MUST APPEAR IN OUTPUT):**
${Array.from(analysis.selectors).map(s => `  ✓ "${s}" ← MUST BE PRESERVED`).join('\n')}

**STYLE PROPERTIES ALREADY SET (MUST BE PRESERVED):**
${Object.entries(analysis.properties)
  .filter(([prop]) => prop !== 'innerHTML')
  .map(([prop, values]) => `  ✓ ${prop}: ${values.join(', ')} ← KEEP THESE VALUES`).join('\n')}

${analysis.textContentChanges.length > 0 ? `**TEXT CONTENT ALREADY SET:**
${analysis.textContentChanges.map(text => `  ✓ "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}" ← KEEP THIS TEXT`).join('\n')}` : ''}

🎯 YOUR TASK:
1. Copy ALL ${analysis.waitForElementCalls.length} waitForElement call(s) from existing code
2. Inside each callback, keep ALL existing properties
3. Add ONLY the new requested change
4. DO NOT consolidate, optimize, or rewrite

📍 PHASE 3.2: AVAILABLE ELEMENTS FOR NEW ADDITIONS

The element database below contains THREE categories:

1. **CURRENT ELEMENTS** (${analysis.selectors.size} selectors listed above)
   - Elements already in your code
   - YOU MUST PRESERVE ALL OF THESE

2. **PROXIMITY ELEMENTS** (nearby elements in database)
   - Elements NEAR your existing changes (share same container/section)
   - Use these for requests like "add badge next to button" or "put banner above heading"

3. **TOP ELEMENTS** (high-importance page elements)
   - Globally important elements (nav, hero, CTA buttons)
   - Use these for new, unrelated additions

**HOW TO USE THIS:**
- For refinements: KEEP all current elements, ADD from proximity/top as needed
- Example: "add badge next to button" → KEEP button code, ADD badge using proximity element
- Example: "also change the header" → KEEP button code, ADD header change using top element

✅ VERIFICATION CHECKLIST (check before responding):
□ Did I preserve all ${analysis.selectors.size} selector(s)?
□ Did I keep all ${Object.keys(analysis.properties).length} existing properties?
□ Did I only ADD the new change, not REPLACE?
□ Would the original developer recognize their code?

`;
          console.log('  ✅ Refinement analysis added to prompt (with Phase 3.2 proximity context)');
        }
      }
    }

    return `${refinementPrefix}⚠️⚠️⚠️ CRITICAL - READ THIS FIRST ⚠️⚠️⚠️
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

⚠️ **CODE LENGTH LIMITS (CRITICAL):**
- Each variation's JS code must be ≤ 2000 characters
- Each variation's CSS code must be ≤ 1500 characters
- For complex features (timers, animations), use external helper functions in globalJS
- Keep code concise - focus on the specific requested change
- If implementing complex logic, break it into smaller helper functions

{
  "variations": [
    {
      "number": 1,
      "name": "Descriptive Name (2-5 words)",
      "css": "CSS code or empty string (max 1500 chars)",
      "js": "JavaScript code using waitForElement (max 2000 chars, DO NOT define it)"
    }
  ],
  "globalCSS": "Shared CSS or empty string",
  "globalJS": "Shared JavaScript helper functions or empty string"
}

**EXAMPLE JSON OUTPUT (Simple change):**
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

**EXAMPLE JSON OUTPUT (Complex feature with helper functions and Cleanup Manager):**
{
  "variations": [
    {
      "number": 1,
      "name": "Countdown Timer",
      "css": "#timer {\\n  position: fixed !important;\\n  top: 0 !important;\\n  background: #000 !important;\\n}",
      "js": "waitForElement('body', (body) => {\\n  if(document.getElementById('timer')) return;\\n  const timer = document.createElement('div');\\n  timer.id = 'timer';\\n  body.prepend(timer);\\n  if(window.ConvertCleanupManager) window.ConvertCleanupManager.registerElement(timer, 'countdown timer');\\n  updateTimer(timer);\\n  const intervalId = setInterval(() => updateTimer(timer), 1000);\\n  if(window.ConvertCleanupManager) window.ConvertCleanupManager.registerInterval(intervalId, 'timer update');\\n});"
    }
  ],
  "globalCSS": "",
  "globalJS": "function updateTimer(el) {\\n  const now = new Date();\\n  el.textContent = now.toLocaleTimeString();\\n}"
}

⚠️ **CRITICAL: If your variation JS calls ANY custom functions (like updateTimer, formatDate, etc.), you MUST define them in globalJS!**

NOTE: Do NOT include "function waitForElement(...)" definition - just call it directly.
BEST PRACTICE: Use CSS section for colors/sizes (with !important), JS section for text/behavior.

**CHECKLIST BEFORE SUBMITTING:**
□ ⚠️ VERIFIED every selector exists in the ELEMENTS list above
□ ❌ NO made-up selectors like 'button.btn.btn--primary'
□ ✅ ONLY used exact selectors from database (copy-paste)
□ ❌ Did NOT include waitForElement function definition
□ ✅ Just CALLED waitForElement with selector and callback
□ 🧹 ALL setInterval calls are registered with ConvertCleanupManager
□ 🧹 ALL setTimeout calls are registered with ConvertCleanupManager
□ 🧹 ALL created elements are registered with ConvertCleanupManager
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
   * Auto-fix: Ensure all called functions are defined in globalJS
   */
  async ensureHelperFunctionsExist(parsedCode, aiSettings) {
    console.log('🔍 Checking for undefined function calls...');

    // Extract all function calls from variation JS
    const allVariationJS = parsedCode.variations.map(v => v.js || '').join('\n');
    const functionCalls = new Set();

    // JavaScript keywords to exclude
    const jsKeywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally', 'function', 'var', 'let', 'const', 'class', 'new', 'this', 'super', 'extends', 'import', 'export', 'await', 'async', 'yield', 'typeof', 'instanceof', 'delete', 'void'];

    // Built-in functions and DOM methods to exclude
    const builtIns = ['waitForElement', 'document', 'window', 'console', 'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout', 'Date', 'Math', 'Array', 'Object', 'String', 'Number', 'Boolean', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet',
      // Common DOM methods
      'getElementById', 'querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName', 'createElement', 'createTextNode', 'appendChild', 'removeChild', 'insertBefore', 'replaceChild', 'setAttribute', 'getAttribute', 'removeAttribute', 'addEventListener', 'removeEventListener', 'dispatchEvent',
      // Common String/Array/Number methods
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join', 'split', 'indexOf', 'lastIndexOf', 'includes', 'find', 'filter', 'map', 'reduce', 'forEach', 'some', 'every', 'sort', 'reverse', 'substring', 'substr', 'charAt', 'charCodeAt', 'toLowerCase', 'toUpperCase', 'trim', 'replace', 'match', 'search', 'test', 'exec', 'toString', 'valueOf', 'toFixed', 'toPrecision', 'toExponential', 'toLocaleString', 'padStart', 'padEnd',
      // Date methods
      'getTime', 'getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds', 'setFullYear', 'setMonth', 'setDate', 'setHours', 'setMinutes', 'setSeconds', 'setMilliseconds',
      // Math methods
      'floor', 'ceil', 'round', 'abs', 'min', 'max', 'random', 'sqrt', 'pow', 'sin', 'cos', 'tan',
      // ConvertCleanupManager methods
      'registerInterval', 'registerTimeout', 'registerElement', 'registerStyleSheet', 'trackModification', 'resetAll'];

    // Match function calls, excluding method calls (preceded by .)
    // Use negative lookbehind to exclude method calls: (?<!\.)functionName(
    const callMatches = allVariationJS.matchAll(/(?<![.\w])([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
    for (const match of callMatches) {
      const funcName = match[1];
      // Skip keywords and built-ins
      if (!jsKeywords.includes(funcName) && !builtIns.includes(funcName)) {
        functionCalls.add(funcName);
      }
    }

    if (functionCalls.size === 0) {
      console.log('✅ No custom function calls found');
      return parsedCode;
    }

    console.log(`📋 Found ${functionCalls.size} custom function calls:`, Array.from(functionCalls));

    // Check which functions are NOT defined in globalJS or variation JS
    const globalJS = parsedCode.globalJS || '';
    const missingFunctions = Array.from(functionCalls).filter(funcName => {
      // Check for function declarations: function funcName(
      const declarationPattern = new RegExp(`function\\s+${funcName}\\s*\\(`);
      // Check for function expressions: const funcName = function( or const funcName = (
      const expressionPattern = new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*(?:function\\s*\\(|\\()`);
      // Check for arrow functions: const funcName = (...) =>
      const arrowPattern = new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*\\([^)]*\\)\\s*=>`);

      // Check globalJS
      if (declarationPattern.test(globalJS) || expressionPattern.test(globalJS) || arrowPattern.test(globalJS)) {
        return false; // Function is defined in globalJS
      }

      // Check variation JS (function might be defined inline)
      if (declarationPattern.test(allVariationJS) || expressionPattern.test(allVariationJS) || arrowPattern.test(allVariationJS)) {
        return false; // Function is defined in variation JS
      }

      return true; // Function is not defined anywhere
    });

    if (missingFunctions.length === 0) {
      console.log('✅ All functions are defined in globalJS or variation code');
      return parsedCode;
    }

    console.warn(`⚠️ Found ${missingFunctions.length} UNDEFINED functions:`, missingFunctions);
    console.log('🤖 Auto-generating missing helper functions...');

    // Generate the missing functions using AI
    const prompt = `The following JavaScript code calls these functions but they are not defined: ${missingFunctions.join(', ')}

Code that calls them:
\`\`\`javascript
${allVariationJS}
\`\`\`

Generate ONLY the missing function definitions. Return valid JavaScript code with just the function declarations, no explanations.

For example, if the code calls getNextFridayMidnightPT(), getTimeRemaining(), and updateCountdown(), generate all three functions.`;

    try {
      const response = await this.callAI([{role: 'user', content: prompt}], {
        ...aiSettings,
        model: aiSettings.provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini' // Use fast model
      });

      // Extract just the function code (remove markdown if present)
      let generatedFunctions = response.content;
      if (generatedFunctions.includes('```')) {
        const match = generatedFunctions.match(/```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```/);
        if (match) generatedFunctions = match[1];
      }

      // Append to existing globalJS
      parsedCode.globalJS = (parsedCode.globalJS || '') + '\n\n' + generatedFunctions.trim();
      console.log(`✅ Auto-generated ${missingFunctions.length} helper functions (${generatedFunctions.length} chars)`);
      console.log(`📝 Preview: ${generatedFunctions.substring(0, 200)}...`);

    } catch (error) {
      console.error('❌ Failed to auto-generate helper functions:', error);
      // Continue anyway - the code will fail at runtime but that's better than crashing here
    }

    return parsedCode;
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
      // Verify service worker context is still valid
      try {
        await chrome.storage.local.get(['settings']); // Quick context check
      } catch (contextError) {
        throw new Error('Service worker context is invalid. Please reload the extension.');
      }

      const requestBodyString = JSON.stringify(requestBody);
      const requestBodySize = requestBodyString.length;

      console.log('🌐 Making API request to Anthropic...', {
        url: 'https://api.anthropic.com/v1/messages',
        model: model,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        timestamp: new Date().toISOString(),
        requestBodySize: requestBodySize
      });

      // Check if request is too large (Chrome fetch limit is ~10MB, but we want to stay well under)
      const MAX_REQUEST_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (requestBodySize > MAX_REQUEST_SIZE) {
        console.error(`❌ Request body too large: ${(requestBodySize / 1024 / 1024).toFixed(2)}MB (max: ${MAX_REQUEST_SIZE / 1024 / 1024}MB)`);
        throw new Error(`Request too large (${(requestBodySize / 1024 / 1024).toFixed(2)}MB). Try capturing fewer elements or using a simpler description.`);
      }

      // Warn if request is getting large
      if (requestBodySize > 1 * 1024 * 1024) { // 1MB
        console.warn(`⚠️ Large request: ${(requestBodySize / 1024 / 1024).toFixed(2)}MB - this may be slow or fail`);
      }

      // Add a small delay to prevent rapid-fire requests that might be blocked
      await new Promise(resolve => setTimeout(resolve, 100));

      // Validate service worker context before fetch
      try {
        await chrome.storage.local.get(['contextCheck']);
        console.log('✅ Service worker context is valid');
      } catch (contextError) {
        console.error('❌ Service worker context invalid:', contextError);
        throw new Error('Service worker context lost. Please reload the extension.');
      }

      console.log('🔄 About to make fetch request...');
      const fetchStartTime = Date.now();

      // Create abort controller for cancellable requests
      this.currentAbortController = new AbortController();

      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: requestBodyString, // Use pre-stringified body
          signal: this.currentAbortController.signal // Allow cancellation
        });

        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ Fetch completed in ${fetchDuration}ms`);
      } catch (innerFetchError) {
        const fetchDuration = Date.now() - fetchStartTime;

        // Check if request was aborted by user
        if (innerFetchError.name === 'AbortError') {
          console.log('🛑 Request cancelled by user');
          this.currentAbortController = null;
          throw new Error('REQUEST_CANCELLED');
        }

        console.error(`❌ Fetch failed after ${fetchDuration}ms`);
        console.error('Error name:', innerFetchError.name);
        console.error('Error message:', innerFetchError.message);
        console.error('Error type:', typeof innerFetchError);
        console.error('Error toString:', innerFetchError.toString());

        // Check if this is a CORS error vs network error
        if (innerFetchError.message === 'Failed to fetch') {
          console.error('🔍 This is a "Failed to fetch" error - possible causes:');
          console.error('  1. Network connectivity issue');
          console.error('  2. CORS blocking (unlikely with manifest permissions)');
          console.error('  3. API endpoint down');
          console.error('  4. Service worker permissions lost');
          console.error('  5. Browser extension was recently reloaded');
        }

        throw innerFetchError;
      } finally {
        // Clean up abort controller after request completes
        this.currentAbortController = null;
      }

      console.log('📡 API Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

    } catch (fetchError) {
      console.error('🚨 Network Error Details:', {
        message: fetchError.message,
        name: fetchError.name,
        stack: fetchError.stack,
        timestamp: new Date().toISOString()
      });

      // Provide specific error messages for common issues
      if (fetchError.message.includes('Failed to fetch')) {
        // Try to determine if this is a service worker issue
        const timeSinceStart = Date.now() - (this.serviceWorkerStartTime || Date.now());
        const possibleCauses = [
          'Your internet connection',
          'Extension permissions (reload extension if needed)',
          'No firewall blocking api.anthropic.com'
        ];

        if (timeSinceStart > 300000) { // 5 minutes
          possibleCauses.push('Service worker may need restart - try reloading the extension');
        }

        throw new Error('Network error: Unable to connect to Anthropic API. Please check:\n' +
                       possibleCauses.map((c, i) => `${i + 1}. ${c}`).join('\n'));
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

    // Convert Anthropic-format messages to OpenAI format
    const convertedMessages = messages.map(msg => {
      if (msg.role !== 'user' || typeof msg.content === 'string') {
        return msg; // No conversion needed
      }

      // Convert array content from Anthropic format to OpenAI format
      if (Array.isArray(msg.content)) {
        const openAIContent = msg.content.map(item => {
          if (item.type === 'image' && item.source) {
            // Convert Anthropic image format to OpenAI format
            const base64Data = item.source.data;
            const mediaType = item.source.media_type || 'image/png';
            return {
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${base64Data}`,
                detail: 'high'
              }
            };
          }
          return item; // Keep text items as-is
        });

        return {
          role: msg.role,
          content: openAIContent
        };
      }

      return msg;
    });

    // Use model-specific parameters for GPT-5 vs GPT-4 models
    const isGPT5Model = resolvedModel.startsWith('gpt-5');
    const requestBody = {
      model: resolvedModel,
      messages: convertedMessages
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

    // CRITICAL: Force JSON output mode (prevents markdown code blocks)
    requestBody.response_format = { type: "json_object" };

    // Create abort controller for cancellable requests
    this.currentAbortController = new AbortController();

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(requestBody),
        signal: this.currentAbortController.signal // Allow cancellation
      });
    } catch (fetchError) {
      // Check if request was aborted by user
      if (fetchError.name === 'AbortError') {
        console.log('🛑 Request cancelled by user');
        this.currentAbortController = null;
        throw new Error('REQUEST_CANCELLED');
      }
      throw fetchError;
    } finally {
      // Clean up abort controller after request completes
      this.currentAbortController = null;
    }

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

    // Extract JSON from markdown code blocks (handles text before/after)
    // CRITICAL: Find ALL code blocks and pick the one that's valid JSON with variations
    const allCodeBlocks = [];

    // Find all ```json blocks
    const jsonBlocks = cleanedResponse.matchAll(/```json\s*\n([\s\S]*?)\n```/gi);
    for (const match of jsonBlocks) {
      allCodeBlocks.push({ content: match[1].trim(), type: 'json' });
    }

    // Find all ``` blocks without language specifier
    const genericBlocks = cleanedResponse.matchAll(/```\s*\n([\s\S]*?)\n```/gi);
    for (const match of genericBlocks) {
      const content = match[1].trim();
      if (content.startsWith('{')) {
        allCodeBlocks.push({ content, type: 'generic' });
      }
    }

    // Try each block and pick the first one that's valid JSON with variations
    let foundValidJSON = false;
    for (const block of allCodeBlocks) {
      try {
        const parsed = JSON.parse(block.content);
        if (parsed.variations && Array.isArray(parsed.variations) && parsed.variations.length > 0) {
          cleanedResponse = block.content;
          console.log(`🧹 Extracted valid JSON from ${block.type} code block with ${parsed.variations.length} variations`);
          foundValidJSON = true;
          break;
        }
      } catch (e) {
        // Log the error for debugging but don't spam console
        if (allCodeBlocks.length === 1) {
          console.warn(`⚠️ JSON parse error:`, e.message);
        }
        // Continue to next block
      }
    }

    if (!foundValidJSON && allCodeBlocks.length > 0) {
      // Fallback: use the last code block if no valid JSON found
      cleanedResponse = allCodeBlocks[allCodeBlocks.length - 1].content;
      console.log('⚠️ Using last code block as fallback (no valid JSON with variations found)');
    }

    // CRITICAL: Handle case where AI adds text BEFORE raw JSON (no code blocks)
    // Example: "I'll update the code...\n\n{\"variations\": [...]}"
    if (!foundValidJSON && !cleanedResponse.startsWith('{')) {
      const firstBraceIndex = cleanedResponse.indexOf('{');
      if (firstBraceIndex > 0) {
        console.log('⚠️ Detected explanatory text before JSON, extracting JSON portion...');
        cleanedResponse = cleanedResponse.substring(firstBraceIndex);
      }
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

          console.log(`🔍 Generated Code Debug - Global Code:`);
          console.log(`  GlobalCSS: ${parsed.globalCSS ? parsed.globalCSS.length + ' chars' : 'None'}`);
          console.log(`  GlobalJS: ${parsed.globalJS ? parsed.globalJS.length + ' chars' : 'None'}`);
          if (parsed.globalJS) {
            console.log(`  GlobalJS preview: ${parsed.globalJS.substring(0, 300)}...`);
          } else {
            console.warn(`  ⚠️ AI did not generate globalJS despite variation JS being present`);
          }

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
        console.warn('⚠️ JSON parsing failed:', jsonError.message);

        // 🆕 Check if it's a truncation error (unterminated string)
        if (jsonError.message.includes('Unterminated string')) {
          console.log('🔧 Attempting to recover from truncated JSON...');

          try {
            // Find the last complete variation before truncation
            const variationMatches = [...cleanedResponse.matchAll(/"variations":\s*\[\s*\{/g)];

            if (variationMatches.length > 0) {
              // Try to find where the string was cut off
              const truncationPoint = cleanedResponse.lastIndexOf('"');

              if (truncationPoint > 0) {
                // Close the truncated string and complete the JSON structure
                let recovered = cleanedResponse.substring(0, truncationPoint + 1);

                // Add closing brackets based on structure
                // Count open braces to determine how many we need to close
                const openBraces = (recovered.match(/\{/g) || []).length;
                const closeBraces = (recovered.match(/\}/g) || []).length;
                const openBrackets = (recovered.match(/\[/g) || []).length;
                const closeBrackets = (recovered.match(/\]/g) || []).length;

                // Close the JS/CSS string if it's open
                if (!recovered.endsWith('"')) {
                  recovered += '"';
                }

                // Close the variation object
                for (let i = 0; i < (openBraces - closeBraces); i++) {
                  recovered += '\n}';
                }

                // Close the variations array
                for (let i = 0; i < (openBrackets - closeBrackets); i++) {
                  recovered += '\n]';
                }

                // Add missing globalCSS and globalJS fields
                if (!recovered.includes('"globalCSS"')) {
                  recovered += ',\n  "globalCSS": "",\n  "globalJS": ""';
                }

                console.log('🔧 Recovered JSON structure:', {
                  original: cleanedResponse.length,
                  recovered: recovered.length,
                  openBraces,
                  closeBraces,
                  openBrackets,
                  closeBrackets
                });

                const parsedRecovered = JSON.parse(recovered);

                if (parsedRecovered.variations && parsedRecovered.variations.length > 0) {
                  console.log('✅ Successfully recovered truncated JSON!');
                  console.log('⚠️ Warning: Code was truncated - some functionality may be incomplete');

                  // Truncate the JS/CSS to valid length and add warning comment
                  return {
                    variations: parsedRecovered.variations.map(v => ({
                      number: v.number || 1,
                      name: v.name || 'Unnamed',
                      css: v.css || '',
                      js: (v.js || '') + '\n// ⚠️ Code was truncated - please refine if incomplete'
                    })),
                    globalCSS: parsedRecovered.globalCSS || '',
                    globalJS: parsedRecovered.globalJS || ''
                  };
                }
              }
            }
          } catch (recoveryError) {
            console.warn('⚠️ Truncation recovery failed:', recoveryError.message);
          }
        }

        // Try to fix malformed JSON (AI sometimes returns JSON with literal newlines in strings)
        try {
          console.log('🔧 Attempting to fix newlines in JSON strings...');

          // Replace literal newlines inside string values with \\n
          // This handles the AI putting actual newlines in "css": "..." and "js": "..." values
          let fixed = cleanedResponse.replace(/"(css|js)":\s*"([\s\S]*?)(?="[,\}])/g, (match, key, content) => {
            // Escape special characters in the content
            const escaped = content
              .replace(/\\/g, '\\\\')  // Escape backslashes
              .replace(/\n/g, '\\n')    // Escape newlines
              .replace(/\r/g, '\\r')    // Escape carriage returns
              .replace(/\t/g, '\\t')    // Escape tabs
              .replace(/"/g, '\\"');     // Escape quotes
            return `"${key}": "${escaped}`;
          });

          const parsedFixed = JSON.parse(fixed);

          if (parsedFixed.variations && Array.isArray(parsedFixed.variations)) {
            console.log('✅ Successfully fixed and parsed JSON');
            return {
              variations: parsedFixed.variations.map(v => ({
                number: v.number || 1,
                name: v.name || 'Unnamed',
                css: v.css || '',
                js: v.js || ''
              })),
              globalCSS: parsedFixed.globalCSS || '',
              globalJS: parsedFixed.globalJS || ''
            };
          }
        } catch (fixError) {
          console.warn('⚠️ Could not fix JSON:', fixError.message);
        }
      }
    }

    // NEW: Try parsing separate CSS/JS code blocks (handles when AI "forgets" JSON format)
    if (!cleanedResponse.startsWith('{') && cleanedResponse.includes('```css')) {
      console.log('🔄 Detected separate CSS/JS code blocks, attempting to parse...');

      try {
        const cssBlocks = [];
        const jsBlocks = [];

        // Extract all CSS blocks
        const cssMatches = cleanedResponse.matchAll(/```css\s*\n([\s\S]*?)\n```/gi);
        for (const match of cssMatches) {
          cssBlocks.push(match[1].trim());
        }

        // Extract all JavaScript blocks
        const jsMatches = cleanedResponse.matchAll(/```(?:javascript|js)\s*\n([\s\S]*?)\n```/gi);
        for (const match of jsMatches) {
          jsBlocks.push(match[1].trim());
        }

        if (cssBlocks.length > 0 || jsBlocks.length > 0) {
          console.log(`📦 Found ${cssBlocks.length} CSS blocks and ${jsBlocks.length} JS blocks`);

          // Combine into JSON structure
          const combinedCSS = cssBlocks.join('\n\n');
          const combinedJS = jsBlocks.join('\n\n');

          return {
            variations: [{
              number: 1,
              name: 'Variation 1',
              css: combinedCSS,
              js: combinedJS
            }],
            globalCSS: '',
            globalJS: ''
          };
        }
      } catch (blockParseError) {
        console.warn('⚠️ CSS/JS block parsing failed:', blockParseError.message);
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
    let currentVariationName = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect variation title format: --- Title ---
      if (trimmed.match(/^---\s+(.+?)\s+---$/)) {
        const match = trimmed.match(/^---\s+(.+?)\s+---$/);
        currentVariationName = match[1];
        variationHeadersFound++;
        console.log(`Found variation title: ${currentVariationName}`);
        continue;
      }

      // Detect CSS: or JS: section markers
      if (trimmed === 'CSS:' || trimmed === 'JS:' || trimmed === 'JavaScript:') {
        if (currentSection && currentContent.trim()) {
          this.addToSection(sections, currentSection, currentContent.trim());
        }
        const type = trimmed.startsWith('CSS') ? 'css' : 'js';
        currentSection = {
          type: 'variation',
          number: variationHeadersFound || 1,
          name: currentVariationName || 'Unnamed Variation',
          section: type
        };
        currentContent = '';
        continue;
      }

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

  /**
   * Load and execute a script in the service worker context
   * @param {string} scriptPath - Path to script file
   * @returns {Promise<any>} - The exported class or function from the script
   */
  async loadScript(scriptPath) {
    try {
      // Check if already loaded
      const className = scriptPath.split('/').pop().replace('.js', '').split('-').map(
        part => part.charAt(0).toUpperCase() + part.slice(1)
      ).join('');

      // Try to access in global scope
      if (typeof self[className] !== 'undefined') {
        console.log(`✅ Script already loaded: ${className}`);
        return self[className];
      }

      // Use importScripts (CSP-compliant for service workers)
      const scriptUrl = chrome.runtime.getURL(scriptPath);

      try {
        // importScripts is synchronous and CSP-compliant
        importScripts(scriptUrl);
      } catch (importError) {
        console.error(`Failed to importScripts: ${importError.message}`);
        throw new Error(`Cannot load ${scriptPath} - importScripts failed: ${importError.message}`);
      }

      // Return the loaded class
      if (typeof self[className] !== 'undefined') {
        console.log(`✅ Loaded script: ${className} from ${scriptPath}`);
        return self[className];
      } else {
        throw new Error(`Script loaded but class ${className} not found in global scope`);
      }

    } catch (error) {
      console.error(`❌ Failed to load script ${scriptPath}:`, error);
      throw error;
    }
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
      console.log('🔄 [adjustCode] Starting refinement');

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
        extraContext,
        selectedElement  // 🆕 Element attached to refinement request
      } = data || {};

      // Determine which format we're using
      const isNewFormat = pageData && newRequest;
      const actualPageData = isNewFormat ? pageData : generationData?.pageData;

      console.log('📊 [adjustCode] Input:', {
        format: isNewFormat ? 'new' : 'old',
        hasPageData: !!actualPageData,
        hasPreviousCode: !!previousCode,
        requestLength: newRequest?.length || 0
      });
      const actualDescription = isNewFormat ? newRequest : (feedback || generationData?.description);
      const actualVariations = isNewFormat ? (variations || []) : generationData?.variations;
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
        console.log('📝 [adjustCode] Previous code received:', {
          type: typeof previousCode,
          hasVariations: !!previousCode?.variations,
          variationsCount: previousCode?.variations?.length,
          hasGlobalJS: !!previousCode?.globalJS,
          globalJSLength: previousCode?.globalJS?.length || 0,
          hasGlobalCSS: !!previousCode?.globalCSS,
          variation0HasJS: !!previousCode?.variations?.[0]?.js,
          variation0JSLength: previousCode?.variations?.[0]?.js?.length || 0,
          variation0HasCSS: !!previousCode?.variations?.[0]?.css,
          variation0CSSLength: previousCode?.variations?.[0]?.css?.length || 0
        });

        // Format previous code to clearly show what's already implemented
        // If previousCode is an object with variations, convert to string format
        let codeString = previousCode;
        if (typeof previousCode === 'object' && previousCode.variations) {
          // Convert code object to readable string format
          codeString = previousCode.variations.map((v, i) => {
            let varCode = `// ===== VARIATION ${v.number || i + 1}: ${v.name || 'Unnamed'} =====\n\n`;
            if (v.css) varCode += `/* CSS */\n${v.css}\n\n`;
            if (v.js) varCode += `/* JavaScript */\n${v.js}\n`;
            return varCode;
          }).join('\n\n');

          console.log('📝 [adjustCode] After variations map, codeString length:', codeString.length);

          if (previousCode.globalCSS) {
            codeString = `/* GLOBAL CSS */\n${previousCode.globalCSS}\n\n${codeString}`;
            console.log('📝 [adjustCode] After adding globalCSS, length:', codeString.length);
          }
          if (previousCode.globalJS) {
            codeString = `/* GLOBAL JAVASCRIPT */\n${previousCode.globalJS}\n\n${codeString}`;
            console.log('📝 [adjustCode] After adding globalJS, length:', codeString.length);
          }

          console.log('📝 [adjustCode] Final codeString type:', typeof codeString, 'length:', codeString.length);
        }

        const formattedPreviousCode = this.formatPreviousCodeContext(codeString);
        console.log('📝 [adjustCode] After formatPreviousCodeContext, length:', formattedPreviousCode.length);

        // Use special marker to trigger strict refinement validation
        adjustmentContext += `\n**🚨 CURRENT GENERATED CODE (ALREADY APPLIED TO PAGE):**

This code is WORKING and LIVE on the page RIGHT NOW (${formattedPreviousCode.length} characters).

\`\`\`javascript
${formattedPreviousCode}
\`\`\`

**NEW REQUEST TO ADD:**`;
        logger.log('Including previous code in adjustment (refinement mode)', `length=${formattedPreviousCode.length}`);
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
          adjustmentContext += `\n**NEW USER REQUEST (Follow-up):**\n"${userRequest}"`;

          // 🆕 Add selected element as attachment to this specific request
          if (selectedElement) {
            adjustmentContext += `\n\n**📎 ATTACHED ELEMENT (User Selected This Element):**`;
            adjustmentContext += `\n- Tag: ${selectedElement.tag || 'unknown'}`;
            if (selectedElement.id) adjustmentContext += `\n- ID: #${selectedElement.id}`;
            if (selectedElement.classes && selectedElement.classes.length > 0) {
              adjustmentContext += `\n- Classes: .${selectedElement.classes.join('.')}`;
            }
            if (selectedElement.selector) adjustmentContext += `\n- Selector: ${selectedElement.selector}`;
            if (selectedElement.text) {
              const truncatedText = selectedElement.text.substring(0, 100);
              adjustmentContext += `\n- Text Content: "${truncatedText}${selectedElement.text.length > 100 ? '...' : ''}"`;
            }
            adjustmentContext += `\n\n**Context:** The user clicked on this specific element when making the request above. They are referring to THIS element when they say "${userRequest}".`;

            // 🆕 Add note about generated elements
            adjustmentContext += `\n\n**Important:** If the user is describing layout/positioning issues (like "below", "above", "aligned with"), you may need to look at BOTH:`;
            adjustmentContext += `\n1. The attached element screenshot (what they clicked)`;
            adjustmentContext += `\n2. The CURRENT GENERATED CODE below (features we created, like countdown banners)`;
            adjustmentContext += `\nThe issue might be about how elements created by our code relate to existing page elements.`;

            logger.log('Including selected element attachment', `selector=${selectedElement.selector}`);
          }

          adjustmentContext += `\n\n**CRITICAL CONTEXT:**\nThis is a follow-up request. The page data comes from the ORIGINAL capture (before any modifications).\nThe PREVIOUS IMPLEMENTATION shows code already applied.\nYour task: Preserve ALL previous changes AND add the new request.`;
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
**🚨 CRITICAL - THIS IS A REFINEMENT REQUEST 🚨**

The code shown in "CURRENT GENERATED CODE (ALREADY APPLIED TO PAGE)" is WORKING and LIVE on the page right now.

**YOUR TASK:**
Look at the CURRENT GENERATED CODE section above.
Then read the NEW REQUEST TO ADD section.
Generate code that includes BOTH:
- Everything from CURRENT GENERATED CODE (all CSS, all JavaScript, all functionality)
- Plus the new change from NEW REQUEST TO ADD

**MANDATORY RULES:**
1. ✅ Include ALL CSS from current code + any new CSS needed
2. ✅ Include ALL JavaScript from current code + any new JS needed
3. ✅ Keep ALL globalJS helper functions
4. ✅ Keep ALL globalCSS styles
5. ⚠️ SPECIAL: When request says "remove element", determine if it means:
   - Removing an EXISTING page element → Add CSS: display: none (KEEP all JS)
   - Removing a FEATURE we created → Keep JS, modify to hide the feature
   - NEVER delete JavaScript code unless explicitly told "delete the code"

**EXAMPLES:**

Example 1 - Adding to existing code:
Current code: Red countdown banner with timer (100 lines JS)
New request: "Add a close button"
✅ CORRECT: Red banner + timer + close button (100+ lines JS)
❌ WRONG: Only close button code (10 lines - WHERE IS THE OTHER 90 LINES?!)

Example 2 - Modifying existing code:
Current code: Banner says "Sale ends Friday" (100 lines JS)
New request: "Change text to 'Limited time offer'"
✅ CORRECT: Banner with timer + new text (100+ lines JS)
❌ WRONG: Only new text (5 lines - CODE DESTROYED!)

Example 3 - "Remove" request (CRITICAL - READ THIS):
Current code: Countdown banner with timer (100 lines JS) + hides announcement (2 lines CSS)
New request: "Remove this element" (user clicks the countdown banner)
✅ CORRECT: Keep all 100 lines JS + add CSS to hide banner (102 lines total)
❌ WRONG: Delete all JS, only output CSS (2 lines - CODE DESTROYED!)

Example 4 - "Remove" request for page element:
Current code: Countdown banner (100 lines JS) + hides announcement bar (CSS)
New request: "Remove this element" (user clicks existing page announcement bar)
✅ CORRECT: Keep all 100 lines JS + update CSS to hide announcement (100+ lines)
❌ WRONG: Delete all JS (0 lines - CODE DESTROYED!)

**🚨 KEY INSIGHT: "Remove element" ALMOST NEVER means "delete JavaScript code"**
- 95% of the time: User wants to HIDE something with CSS
- Keep the countdown banner JS, timer logic, helper functions
- Just add CSS or modify display logic

**OUTPUT THE COMPLETE, MERGED CODE:**
Do not skip or abbreviate. Include every line from current code plus your changes.`
        : `
**INITIAL GENERATION:**
Generate code based on the USER FEEDBACK.
This is the first iteration, so no previous changes to preserve.`;

      const outputFormatRequirement = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 OUTPUT FORMAT REQUIREMENT - READ THIS CAREFULLY 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST respond with ONLY valid JSON. No explanations, no text before or after.

❌ WRONG:
"I'll add the close button. Here's the code:

{ "variations": [...] }"

❌ WRONG:
\`\`\`css
.countdown-banner { ... }
\`\`\`

✅ CORRECT:
{
  "variations": [{
    "number": 1,
    "name": "Variation Name",
    "css": "/* CSS here */",
    "js": "/* JS here */"
  }],
  "globalCSS": "",
  "globalJS": ""
}

DO NOT add any text before the opening { or after the closing }.
Your ENTIRE response must be parseable as JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const finalPrompt = `${outputFormatRequirement}

${basePrompt}
${adjustmentContext}
${adjustmentInstructions}

**FINAL CHECKLIST BEFORE YOU RESPOND:**
✅ Did I prepare the COMPLETE code (old + new changes)?
✅ Is my response VALID JSON starting with { and ending with }?
✅ Did I remove ALL explanatory text?
✅ Did I include ALL previous code + new changes?

${outputFormatRequirement}

Generate the complete, merged code as JSON NOW (no other text):`;

      const systemMessage = previousCode
        ? `You are an expert A/B testing developer performing ITERATIVE REFINEMENT on EXISTING, WORKING code.

🚨 CRITICAL RULES FOR REFINEMENTS:

**YOU HAVE FULL EDITORIAL FREEDOM** to modify existing code to achieve the user's request efficiently.

✅ You CAN and SHOULD:
- Edit existing code to make changes (e.g., change "Try now" to "Try later" by editing the text directly)
- Restructure code for better implementation (e.g., turn sticky banner into pop-up)
- Replace functionality completely if user requests it (e.g., "change countdown to progress bar")
- Add, modify, or reorganize CSS and JavaScript as needed
- Remove specific features if user explicitly requests it (e.g., "remove the countdown timer")
- Make code shorter if edits are legitimate (e.g., simplifying logic, removing requested features)

❌ You CANNOT:
- Delete ALL JavaScript when user says vague things like "remove this element" or "hide this"
- Output only CSS when the current code has substantial JavaScript functionality (unless user explicitly asked to remove JS)
- Ignore existing features unless user explicitly asks to remove them
- Generate fresh code that loses unrelated existing functionality

🎯 UNDERSTANDING USER INTENT - Think Before Acting:

**Editing/Modification requests** (MODIFY existing code freely):
- "Change text to 'Try later'" → Edit the string directly in existing code
- "Make banner green" → Edit the background color property
- "Turn sticky banner into popup" → Restructure existing code to be popup instead
- "Add close button" → Add close button to existing banner code
→ Result: Code may be shorter or longer, both are fine

**Hiding requests** (PRESERVE functionality, hide visually):
- "Remove this element" (with attached element screenshot) → User wants to hide THAT specific element
- "Hide this" → Keep all code, add CSS: display: none for the attached element
- "Don't show banner" → Keep banner code, prevent display
→ Result: Code stays same length + small CSS addition

**🔍 USING ATTACHED ELEMENTS:**
- When you see "📎 ATTACHED ELEMENT" in the prompt, the user clicked a specific element
- Look for the attached element screenshot (appears FIRST, before page screenshot)
- Check the "ATTACHED ELEMENT" section for selector, ID, classes, and text
- The user's request refers to THIS specific element
- Example: "Remove this element" + Attached element "#countdown-banner" → Hide #countdown-banner with CSS, keep all JS

**Deletion requests** (REMOVE features):
- "Delete the countdown timer" → Remove countdown-specific code
- "Remove all JavaScript" → Remove JS (explicit instruction)
- "Get rid of the banner completely" → Remove banner code
→ Result: Code gets shorter (expected and correct)

🔍 CRITICAL QUESTION TO ASK YOURSELF:
"If I remove this JavaScript, will the user lose functionality they still want?"

Examples:
- User: "hide element" + Code has countdown timer → KEEP timer code (they said hide, not delete)
- User: "change text" + Code has timer → EDIT text, KEEP timer (unrelated feature)
- User: "remove countdown" + Code has countdown → REMOVE countdown code (explicit request)
- User: "turn banner into popup" + Code creates banner → RESTRUCTURE into popup (legitimate edit)

**Character count is a GUIDE, not a hard rule:**
- ✅ Editing text makes code shorter: GOOD
- ✅ Restructuring improves code: GOOD
- ✅ Removing explicitly requested feature reduces code: GOOD
- ❌ Code shrinks by 90% with no clear reason: PROBLEM (you probably deleted something by accident)

CRITICAL: (1) Respond with ONLY valid JSON. (2) Make smart editorial decisions to achieve user's request efficiently.`
        : 'You are an expert A/B testing developer who generates clean, production-ready code using only vanilla JavaScript. CRITICAL: (1) You MUST respond with ONLY valid JSON - no explanatory text before or after. (2) When Visual QA feedback is provided, you MUST implement every fix mentioned.';

      const messages = [{
        role: 'system',
        content: systemMessage
      }];

      // Build user message with screenshot for brand/style context
      const userContent = [];

      // 🆕 Include selected element screenshot FIRST (most relevant)
      if (selectedElement?.screenshot) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: selectedElement.screenshot.replace(/^data:image\/png;base64,/, '')
          }
        });
        userContent.push({
          type: 'text',
          text: '📎 **ATTACHED ELEMENT SCREENSHOT:**\nThis is the specific element the user clicked and is referring to in their request.\n\n'
        });
        logger.log('Including selected element screenshot', `for ${selectedElement.selector}`);
      }

      // Include full page screenshot for brand context in iterative changes
      if (actualPageData?.screenshot) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: actualPageData.screenshot.replace(/^data:image\/png;base64,/, '')
          }
        });
        userContent.push({
          type: 'text',
          text: '📸 **FULL PAGE SCREENSHOT (ORIGINAL STATE):**\nThis shows the page BEFORE any changes. Use it to maintain brand consistency and visual harmony as you make iterative changes.\n\n'
        });
        logger.log('Including full page screenshot in adjustment', 'for brand/style context');
      } else {
        logger.log('No screenshot available for adjustment', 'proceeding with text-only mode');
      }

      // Add the adjustment prompt
      userContent.push({
        type: 'text',
        text: finalPrompt
      });

      messages.push({
        role: 'user',
        content: userContent
      });

      // Use unified AI call
      const aiSettings = {
        provider: actualSettings?.provider || 'openai',
        authToken: authToken,
        anthropicApiKey: actualSettings?.anthropicApiKey,
        model: actualSettings?.model || 'gpt-4o-mini'
      };

      console.log('🤖 [adjustCode] Calling AI with model:', aiSettings.model);
      const aiResponse = await this.callAI(messages, aiSettings);
      console.log('✅ [adjustCode] AI response received, parsing code...');

      const parsedCode = this.parseGeneratedCode(aiResponse.content);
      console.log('✅ [adjustCode] Code parsed successfully, returning result');

      return {
        code: parsedCode,
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

          let timeoutId;
          const timeoutPromise = new Promise((resolve) => {
            timeoutId = setTimeout(() => {
              logger.error('Content script message timeout', 'No response after 5 seconds');
              resolve({ success: false, error: 'Content script timeout - no response received', timeout: true });
            }, 5000);
          });

          cssResult = await Promise.race([messagePromise, timeoutPromise]);
          clearTimeout(timeoutId); // Clear timeout if message succeeded
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

                // Only log if there's a meaningful result
                if (result !== undefined) {
                  console.log('[JavaScript Execution] ✓ Execution completed with result:', result);
                } else {
                  console.log('[JavaScript Execution] ✓ Execution completed successfully');
                }

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

    let expand = Array.isArray(expandParam)
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
      elementDatabase,
      testResults  // NEW: Test results from interactive validation
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

      // Build Visual QA prompt (now includes test results)
      const visualQAPrompt = this.buildVisualQAPrompt(userRequest, chatHistory, variation, elementDatabase, testResults);

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

  buildVisualQAPrompt(userRequest, chatHistory, variation, elementDatabase, testResults) {
    const chatContext = chatHistory && chatHistory.length > 0
      ? `\n\n## Conversation History:\n${chatHistory.map(msg => `**${msg.role}**: ${msg.content}`).join('\n')}`
      : '';

    const elementContext = elementDatabase && elementDatabase.elements
      ? `\n\n## Page Elements:\n${elementDatabase.elements.slice(0, 10).map(el => `- ${el.tag}${el.selector ? ` (${el.selector})` : ''}: "${el.text?.substring(0, 50) || ''}"`).join('\n')}`
      : '';

    // NEW: Add test results context
    const testContext = testResults ? `

## Interactive Test Results:
**Overall Status**: ${testResults.overallStatus || 'unknown'}

${testResults.interactions?.length > 0 ? `**Interactions Tested** (${testResults.interactions.length}):
${testResults.interactions.map(int => `- ${int.type} on ${int.target}: ${int.success ? '✅ SUCCESS' : '❌ FAILED'}`).join('\n')}
` : ''}
${testResults.validations?.length > 0 ? `**Validations** (${testResults.validations.length}):
${testResults.validations.map(val => `- ${val.test}: ${val.passed ? '✅ PASS' : '❌ FAIL'}${val.expected && val.actual ? ` (expected: ${val.expected}, actual: ${val.actual})` : ''}`).join('\n')}
` : ''}
${testResults.error ? `**Test Error**: ${testResults.error}` : ''}

**Confidence Modifier**: ${testResults.overallStatus === 'passed' ? '+20% (behavioral tests passed)' : testResults.overallStatus === 'failed' ? '-30% (behavioral tests failed)' : '0% (no test data)'}
` : '';

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
${testContext}

## Your Task:
Compare the BEFORE and AFTER screenshots. Validate:

1. **Did the changes actually happen?** - Check if the visual changes match what the code should do
2. **Are they correct?** - Do they match the user's request?
3. **Any visual bugs?** - Layout breaks, overlapping elements, hidden content, wrong colors, etc.
${testResults ? '4. **Behavioral validation** - Consider the test results above when scoring' : ''}

**IMPORTANT**:
- Be strict about correctness - if the user asked for "green button" but it's blue, that's FAILED
- Check if text changes actually applied
- Verify color changes are visible
- Look for layout shifts or broken designs
${testResults && testResults.overallStatus === 'passed' ? '- ✅ Interactive tests PASSED - increase confidence in correctness' : ''}
${testResults && testResults.overallStatus === 'failed' ? '- ⚠️ Interactive tests FAILED - lower confidence, investigate failures' : ''}

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

  /**
   * Check if refinement added new interactive features requiring test script update
   * @param {string} description - Refinement request description
   * @returns {boolean} - True if new interactions likely added
   */
  refinementAddedNewInteractions(description) {
    // Keywords that suggest new interactive features
    const interactionKeywords = [
      'click', 'button', 'hover', 'popup', 'modal', 'dropdown',
      'menu', 'form', 'submit', 'toggle', 'accordion', 'tab',
      'slider', 'carousel', 'animation', 'transition', 'scroll',
      'link', 'navigation', 'expand', 'collapse', 'open', 'close'
    ];

    const lowerDescription = description.toLowerCase();

    // Check if any interaction keywords are in the refinement request
    const hasInteractionKeywords = interactionKeywords.some(keyword =>
      lowerDescription.includes(keyword)
    );

    // Also check for "add" or "create" combined with interactive elements
    const isAdding = lowerDescription.match(/\b(add|create|insert|include)\b/);
    const mentionsInteractive = interactionKeywords.some(keyword =>
      lowerDescription.includes(keyword)
    );

    const likelyAddsInteraction = isAdding && mentionsInteractive;

    if (hasInteractionKeywords || likelyAddsInteraction) {
      console.log('[Test Script] Refinement likely adds new interactions - will regenerate test script');
      return true;
    }

    console.log('[Test Script] Refinement appears to be visual-only - skipping test script regeneration');
    return false;
  }

  /**
   * Generate test script for interactive feature validation
   * @param {Object} code - Implementation code { css, js }
   * @param {string} userRequest - Original user request
   * @param {Object} aiSettings - AI provider settings
   * @returns {Promise<Object|null>} - Test script data or null
   */
  async generateTestScript(code, userRequest, aiSettings) {
    // Step 1: Analyze if interactions are present
    const requirements = this.analyzeInteractionRequirements(code, userRequest);

    // Step 2: Skip if no interactions
    if (!requirements.hasInteractions) {
      console.log('[Test Script] No interactions detected, skipping');
      return null;
    }

    console.log('[Test Script] Detected interactions:', requirements.types.join(', '));

    // Step 3: Build prompt for AI
    const prompt = this.buildTestScriptPrompt(code, userRequest, requirements);

    // Step 4: Call AI (using same provider as code generation)
    try {
      const response = await this.callAI([{
        role: 'system',
        content: 'You are an expert at generating test scripts for web A/B tests. Generate JavaScript test functions using the TestPatterns API.'
      }, {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }], {
        ...aiSettings,
        model: aiSettings.provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini' // Use cheaper models for test generation
      });

      const testScript = this.parseTestScriptResponse(response.content);

      if (!testScript) {
        console.warn('[Test Script] Failed to parse AI response');
        return null;
      }

      return {
        testScript,
        requirements,
        suggestedDuration: requirements.suggestedDuration
      };
    } catch (error) {
      console.error('[Test Script] Generation failed:', error);
      return null;
    }
  }

  /**
   * Analyze implementation code for interaction requirements
   * @param {Object} code - { css, js }
   * @param {string} userRequest - User request
   * @returns {Object} - { hasInteractions, types[], complexity, suggestedDuration }
   */
  analyzeInteractionRequirements(code, userRequest) {
    const interactionPatterns = {
      click: /addEventListener\(['"]click['"]|\.click\(|onclick=/gi,
      hover: /addEventListener\(['"]mouse(enter|over)['"]|:hover/gi,
      scroll: /addEventListener\(['"]scroll['"]|window\.scrollTo|scrollIntoView/gi,
      exitIntent: /mouseout|mouse.*leave|clientY.*-/gi,
      session: /sessionStorage\.(get|set)Item/gi,
      local: /localStorage\.(get|set)Item/gi,
      modal: /modal|popup|overlay|\.show\(|\.open\(/gi,
      form: /input|textarea|select|form|\.value\s*=/gi,
      timer: /setTimeout|setInterval/gi,
      animation: /animate|transition|transform|@keyframes/gi
    };

    const requirements = {
      hasInteractions: false,
      types: [],
      complexity: 'simple',
      suggestedDuration: 3000
    };

    const fullCode = `${code.css || ''}\n${code.js || ''}`;
    const requestLower = userRequest.toLowerCase();

    // Detect interaction types
    for (const [type, pattern] of Object.entries(interactionPatterns)) {
      if (pattern.test(fullCode) || requestLower.includes(type)) {
        requirements.types.push(type);
        requirements.hasInteractions = true;
      }
    }

    // Determine complexity
    if (requirements.types.length === 0) {
      requirements.complexity = 'simple';
      requirements.suggestedDuration = 1000;
    } else if (requirements.types.length <= 2) {
      requirements.complexity = 'medium';
      requirements.suggestedDuration = 3000;
    } else {
      requirements.complexity = 'complex';
      requirements.suggestedDuration = 5000;
    }

    // Adjust for specific types
    if (requirements.types.includes('timer')) {
      requirements.suggestedDuration = Math.max(requirements.suggestedDuration, 3000);
    }
    if (requirements.types.includes('animation')) {
      requirements.suggestedDuration = Math.max(requirements.suggestedDuration, 2000);
    }

    return requirements;
  }

  /**
   * Build AI prompt for test script generation
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User request
   * @param {Object} requirements - Interaction requirements
   * @returns {string} - Prompt
   */
  buildTestScriptPrompt(code, userRequest, requirements) {
    const interactionTypes = requirements.types.join(', ') || 'static';

    return `Generate a test script to validate this A/B test implementation.

**USER REQUEST:** ${userRequest}

**IMPLEMENTATION CODE:**
CSS:
\`\`\`css
${code.css || '/* No CSS */'}
\`\`\`

JavaScript:
\`\`\`javascript
${code.js || '/* No JavaScript */'}
\`\`\`

**DETECTED INTERACTIONS:** ${interactionTypes}

**YOUR TASK:**
Generate a JavaScript test function named \`testVariation()\` that:
1. Uses TestPatterns API methods (waitForElement, simulateClick, validate, etc.)
2. Tests the interactive features detected above
3. Returns results in this format:
\`\`\`javascript
{
  interactions: [{ type: 'click', target: 'selector', success: true }],
  validations: [{ test: 'description', passed: true, expected: 'value', actual: 'value' }],
  overallStatus: 'passed' // or 'failed' or 'error'
}
\`\`\`

**TESTPATTERNS API AVAILABLE:**
- TestPatterns.waitForElement(selector, timeout)
- TestPatterns.simulateClick(target)
- TestPatterns.simulateHover(target)
- TestPatterns.isVisible(target)
- TestPatterns.exists(selector)
- TestPatterns.getSessionStorage(key)
- TestPatterns.getLocalStorage(key)
- TestPatterns.validate(testName, condition, expected, actual)
- TestPatterns.wait(ms)

**CRITICAL REQUIREMENTS:**
✅ Return ONLY the test function code
✅ Function must be named \`testVariation\`
✅ Use try/catch for all operations
✅ Return results object even if errors occur
✅ Mark failed tests with passed: false (don't throw)

Generate the test function now:`;
  }

  /**
   * Parse AI test script response
   * @param {string} response - AI response
   * @returns {string|null} - Test script code or null
   */
  parseTestScriptResponse(response) {
    try {
      let cleaned = response.trim();

      // Extract from code block if present
      if (cleaned.includes('```')) {
        const match = cleaned.match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/i);
        if (match) {
          cleaned = match[1].trim();
        }
      }

      // Verify function exists
      if (!cleaned.includes('async function testVariation') && !cleaned.includes('function testVariation')) {
        console.warn('[Test Script] No testVariation function found in response');
        return null;
      }

      return cleaned;
    } catch (error) {
      console.error('[Test Script] Parse error:', error);
      return null;
    }
  }

  /**
   * Classify test execution error for better recovery
   * @param {Error} error - Error object
   * @returns {string} - Error type
   */
  classifyTestError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (message.includes('element not found') || message.includes('selector')) {
      return 'selector-not-found';
    }

    if (message.includes('no results') || message.includes('null')) {
      return 'no-results';
    }

    if (message.includes('syntax') || message.includes('unexpected token')) {
      return 'javascript-error';
    }

    if (message.includes('tab') || message.includes('not found')) {
      return 'tab-error';
    }

    return 'unknown';
  }

  /**
   * Build executable code for test script (TestPatterns + test function + wrapper)
   * @param {string} testScript - AI-generated test function
   * @returns {string} - Complete executable code
   */
  buildTestExecutionCode(testScript) {
    // Get TestPatterns library code
    const testPatternsCode = this.getTestPatternsCode();

    return `
(async function() {
  const executionResults = {
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    error: null,
    testResults: null
  };

  try {
    // Inject TestPatterns library
    ${testPatternsCode}

    // Inject and execute test function
    ${testScript}

    // Execute test
    const results = await testVariation();
    executionResults.testResults = results;
    executionResults.status = results.overallStatus || 'completed';
    executionResults.endTime = Date.now();
    executionResults.duration = executionResults.endTime - executionResults.startTime;

    console.log('[Test Execution] Completed:', executionResults);
    return executionResults;
  } catch (error) {
    executionResults.status = 'error';
    executionResults.error = error.message;
    executionResults.endTime = Date.now();
    executionResults.duration = executionResults.endTime - executionResults.startTime;
    console.error('[Test Execution] Failed:', error);
    return executionResults;
  }
})();
`;
  }

  /**
   * Get TestPatterns library code as string
   * @returns {string} - TestPatterns code
   */
  getTestPatternsCode() {
    // Return TestPatterns library inline (from test-patterns.js)
    return `
const TestPatterns = {
  async waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(\`[Test] ✓ Found element: \${selector}\`);
        return element;
      }
      await this.wait(100);
    }
    throw new Error(\`Element not found after \${timeout}ms: \${selector}\`);
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async simulateClick(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.click();
      console.log(\`[Test] ✓ Clicked: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(300);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Click failed:', error);
      return false;
    }
  },

  async simulateHover(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      console.log(\`[Test] ✓ Hovered: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(200);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Hover failed:', error);
      return false;
    }
  },

  async simulateExitIntent() {
    try {
      document.dispatchEvent(new MouseEvent('mouseout', {
        bubbles: true,
        cancelable: true,
        clientY: -10,
        relatedTarget: null
      }));
      console.log('[Test] ✓ Exit intent triggered');
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Exit intent failed:', error);
      return false;
    }
  },

  async scrollTo(yPosition) {
    try {
      window.scrollTo({ top: yPosition, behavior: 'smooth' });
      console.log(\`[Test] ✓ Scrolled to: \${yPosition}px\`);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll failed:', error);
      return false;
    }
  },

  async scrollToElement(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log(\`[Test] ✓ Scrolled to element: \${typeof target === 'string' ? target : element.tagName}\`);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll to element failed:', error);
      return false;
    }
  },

  async fillInput(target, value) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(\`[Test] ✓ Filled input: \${typeof target === 'string' ? target : element.tagName}\`);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Fill input failed:', error);
      return false;
    }
  },

  isVisible(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const isHidden = style.display === 'none' ||
                      style.visibility === 'hidden' ||
                      style.opacity === '0';
      return !isHidden && element.offsetParent !== null;
    } catch (error) {
      return false;
    }
  },

  exists(selector) {
    return !!document.querySelector(selector);
  },

  getStyle(target, property) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      if (!element) return null;
      return window.getComputedStyle(element)[property];
    } catch (error) {
      return null;
    }
  },

  getSessionStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ SessionStorage access failed:', error);
      return null;
    }
  },

  getLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ LocalStorage access failed:', error);
      return null;
    }
  },

  countElements(selector) {
    return document.querySelectorAll(selector).length;
  },

  getText(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;
      return element ? element.textContent.trim() : null;
    } catch (error) {
      return null;
    }
  },

  captureState(label = 'unnamed') {
    return {
      label,
      timestamp: Date.now(),
      url: window.location.href,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  },

  async validate(testName, condition, expectedValue = '', actualValue = '') {
    const passed = typeof condition === 'function' ? await condition() : condition;
    const result = {
      test: testName,
      passed,
      expected: expectedValue,
      actual: actualValue,
      timestamp: Date.now()
    };
    console.log(\`[Test] \${passed ? '✓' : '✗'} \${testName}\`);
    if (!passed && expectedValue && actualValue) {
      console.log(\`  Expected: \${expectedValue}, Actual: \${actualValue}\`);
    }
    return result;
  }
};

if (typeof window !== 'undefined') {
  window.TestPatterns = TestPatterns;
}
`;
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
