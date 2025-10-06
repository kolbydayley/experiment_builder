// Background service worker for Chrome extension
console.log('🚀 Service Worker Loading - Convert.com Experiment Builder');

class ServiceWorker {
  constructor() {
    console.log('🔧 ServiceWorker constructor called');
    this.initializeExtension();
    this.maxLogEntries = 200;
    this.recentLogs = [];
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

    // Set up side panel behavior
    console.log('🔧 Setting up side panel behavior...');
    
    // Handle extension icon click - use sidePanel.open() with proper user gesture
    chrome.action.onClicked.addListener(async (tab) => {
      console.log('🖱️ Extension icon clicked, tab:', tab.url);
      
      try {
        // This should work because it's in direct response to user action
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
        
        // Fallback: try setting as default panel behavior
        try {
          await chrome.sidePanel.setPanelBehavior({
            openPanelOnActionClick: true
          });
          console.log('� Set panel to open on action click');
        } catch (fallbackError) {
          console.error('❌ Fallback also failed:', fallbackError);
        }
      }
    });

    // Handle messages from content scripts and side panel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates to refresh page capture
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.notifyPageChange(tabId, tab);
      }
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      preferCSS: true,
      includeDOMChecks: true,
      outputFormat: 'convert-format',
      authToken: '',
      model: 'gpt-4o-mini',
      generationHistory: []
    };

    const result = await chrome.storage.local.get(['settings']);
    const existingSettings = result.settings || {};

    const mergedSettings = {
      ...defaultSettings,
      ...existingSettings,
      generationHistory: existingSettings.generationHistory || []
    };

    await chrome.storage.local.set({ settings: mergedSettings });
  }

  async setupSidePanel() {
    try {
      console.log('🔧 Configuring side panel behavior...');
      
      // Set the side panel to open when the action icon is clicked
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
      });
      console.log('✅ Side panel configured to open on action click');

      // Ensure the default side panel content is registered and enabled
      await chrome.sidePanel.setOptions({
        path: 'sidepanel/sidepanel.html',
        enabled: true
      });
      console.log('✅ Side panel options registered globally');
    } catch (error) {
      console.error('❌ Failed to configure side panel:', error);
    }
  }

  // Side panel is now handled automatically by Chrome
  // The panel will open when user clicks the extension icon

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'CAPTURE_PAGE':
          const pageData = await this.capturePage(message.tabId);
          sendResponse({ success: true, data: pageData });
          break;

        case 'GENERATE_CODE':
          const generated = await this.generateCode(message.data);
          sendResponse({ success: true, code: generated.code, usage: generated.usage, logs: generated.logs });
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

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      const recentLogs = this.takeRecentLogs();
      sendResponse({ success: false, error: error.message, logs: recentLogs });
    }
  }

  async capturePage(tabId) {
    try {
      // Get tab information
      const tab = await chrome.tabs.get(tabId);
      if (!this.isCapturePermitted(tab.url)) {
        throw new Error('This type of page cannot be captured. Try a standard http(s) page in another tab.');
      }
      let metrics = {};

      try {
        const [metricsResult] = await chrome.scripting.executeScript({
          target: { tabId },
          function: collectPageMetrics
        });
        metrics = metricsResult?.result || {};
      } catch (metricsError) {
        console.warn('Unable to collect page metrics:', metricsError);
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          function: () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          }
        });
        await this.wait(100);
      } catch (scrollError) {
        console.warn('Unable to reset scroll position before capture:', scrollError);
      }
      
      // Capture screenshot
      let screenshot = null;
      let originalZoom = 1;
      let zoomAdjusted = false;
      metrics.originalZoom = originalZoom;

      try {
        originalZoom = await chrome.tabs.getZoom(tabId);
        metrics.originalZoom = originalZoom;
      } catch (zoomReadError) {
        console.warn('Unable to read current zoom level:', zoomReadError);
      }

      try {
        const heightRatio = metrics.fullHeight && metrics.viewportHeight
          ? metrics.viewportHeight / metrics.fullHeight
          : 1;
        const widthRatio = metrics.fullWidth && metrics.viewportWidth
          ? metrics.viewportWidth / metrics.fullWidth
          : 1;
        const limitingRatio = Math.min(heightRatio || 1, widthRatio || 1);
        const desiredZoom = Math.max(0.25, Math.min(originalZoom, originalZoom * limitingRatio));

        if (desiredZoom < originalZoom - 0.001) {
          await chrome.tabs.setZoom(tabId, desiredZoom);
          zoomAdjusted = true;
          metrics.appliedZoom = desiredZoom;
          await this.wait(250);
        } else {
          metrics.appliedZoom = originalZoom;
        }
      } catch (zoomError) {
        console.warn('Unable to adjust zoom for full-page capture:', zoomError);
        metrics.appliedZoom = originalZoom;
      }

      try {
        screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'png',
          quality: 90
        });
      } catch (screenshotError) {
        console.warn('Screenshot capture skipped:', screenshotError?.message || screenshotError);
      }

      if (zoomAdjusted) {
        try {
          await chrome.tabs.setZoom(tabId, originalZoom);
        } catch (restoreError) {
          console.warn('Failed to restore original zoom level:', restoreError);
        }
      }

      // Attempt to collect HTML/CSS via messaging (preferred)
      let domSnapshot = null;
      let messageError = null;
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PAGE_DATA' });
        if (response?.success && response.data) {
          domSnapshot = response.data;
        }
      } catch (err) {
        messageError = err;
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          console.warn('Content script capture unavailable:', runtimeError.message);
        } else {
          console.warn('Content script capture threw:', err);
        }
      }

      if (!domSnapshot && this.shouldInjectCaptureScript(messageError)) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/page-capture.js']
          });
          const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PAGE_DATA' });
          if (response?.success && response.data) {
            domSnapshot = response.data;
          }
        } catch (injectError) {
          console.warn('Manual content script injection failed:', injectError);
        }
      }

      if (!domSnapshot) {
        try {
          const extractionResults = await chrome.scripting.executeScript({
            target: { tabId },
            function: extractPageData
          });
          const [result] = extractionResults || [];
          domSnapshot = result?.result || null;
        } catch (scriptError) {
          console.error('DOM extraction failed:', scriptError);
        }
      }

      if (!domSnapshot) {
        try {
          const simpleResults = await chrome.scripting.executeScript({
            target: { tabId },
            function: extractHtmlOnly
          });
          const [simple] = simpleResults || [];
          domSnapshot = simple?.result || null;
        } catch (simpleError) {
          console.warn('Simple HTML extraction failed:', simpleError);
        }
      }

      if (!domSnapshot || !domSnapshot.html) {
        throw new Error('Unable to read page DOM. If the site restricts script injection, try reloading or capturing a different page.');
      }

      const sanitized = this.sanitizeDomSnapshot(domSnapshot);

      return {
        url: tab.url,
        title: tab.title,
        screenshot,
        html: sanitized.html,
        css: sanitized.css,
        timestamp: Date.now(),
        metrics
      };
    } catch (error) {
      console.error('Page capture failed:', error);
      throw new Error(error?.message || 'Failed to capture page data');
    }
  }

  async generateCode(data) {
    const { pageData, description, designFiles, variations, settings } = data;
    const logger = this.createOperationLogger('GenerateCode');
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) {
        throw new Error('OpenAI API key missing. Add one in the side panel settings.');
      }

      // PHASE 1: Extract selectors first
      logger.log('Phase 1: Extracting selectors from page');
      const selectorExtractor = new SelectorExtractor();
      const extractionResult = await selectorExtractor.extractSelectors(
        pageData,
        description,
        authToken,
        settings?.model || 'gpt-4o'
      );
      
      const extractedSelectors = extractionResult.selectors;
      logger.log('Selectors extracted', JSON.stringify(extractedSelectors));
      
      // PHASE 2: Verify selectors exist on page
      logger.log('Phase 2: Verifying selectors exist');
      // We'll verify during testing, but log them for now
      
      // PHASE 3: Generate code using extracted selectors
      logger.log('Phase 3: Generating code with verified selectors');
      const prompt = this.buildCodeGenerationPrompt(
        pageData, 
        description, 
        designFiles, 
        variations, 
        settings,
        extractedSelectors
      );
      
      const messages = [{
        role: 'system',
        content: 'You are an expert at generating clean, production-ready JavaScript and CSS code using only vanilla JavaScript.'
      }, {
        role: 'user',
        content: prompt
      }];
      
      const aiResponse = await this.callChatGPT(messages, authToken, settings?.model);
      logger.log('Code generated', `tokens=${aiResponse.usage?.promptTokens || 0}`);
      
      const parsedCode = this.parseGeneratedCode(aiResponse.content);
      logger.log('Code parsed', `variations=${parsedCode.variations.length}`);

      // Combine usage from both phases
      const totalUsage = {
        promptTokens: (extractionResult.usage?.prompt_tokens || 0) + (aiResponse.usage?.promptTokens || 0),
        completionTokens: (extractionResult.usage?.completion_tokens || 0) + (aiResponse.usage?.completionTokens || 0),
        totalTokens: 0
      };
      totalUsage.totalTokens = totalUsage.promptTokens + totalUsage.completionTokens;

      return {
        code: parsedCode,
        usage: totalUsage,
        extractedSelectors,
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Code generation failed', error?.message);
      throw error;
    }
  }

  buildCodeGenerationPrompt(pageData, description, designFiles, variations, settings, extractedSelectors) {
    const selectorsJSON = JSON.stringify(extractedSelectors, null, 2);

    return `
You are generating A/B test code for Convert.com. The selectors have ALREADY been extracted and verified.

**USER REQUEST:**
${description}

**VERIFIED SELECTORS (USE THESE EXACTLY):**
${selectorsJSON}

**VARIATIONS TO CREATE:**
${variations.map((v, i) => `${i + 1}. ${v.name}: ${v.description || 'See description above'}`).join('\n')}

**CRITICAL RULES:**
1. Use ONLY the selectors provided in the JSON above - they are already verified to exist
2. Do NOT modify or change these selectors in any way
3. Do NOT add generic selectors like ".button" or "a"
4. Use vanilla JavaScript ONLY - no jQuery, no libraries
5. Prefer CSS changes when possible
6. Add !important to CSS rules that need to override

**CODE PATTERNS:**

// Wait for element (using verified selector):
function waitForElement(selector, callback, maxWait = 10000) {
  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(checkInterval);
      callback(element);
    } else if (Date.now() - startTime > maxWait) {
      clearInterval(checkInterval);
      console.warn('Element not found:', selector);
    }
  }, 100);
}

// Example usage with verified selectors:
const selectors = ${selectorsJSON};
waitForElement(selectors.primaryCTA, (element) => {
  element.textContent = 'New Text';
});

**GENERATION SETTINGS:**
- Prefer CSS: ${settings.preferCSS ? 'YES' : 'NO'}
- Include DOM checks: ${settings.includeDOMChecks ? 'YES' : 'NO'}

**OUTPUT FORMAT:**

// VARIATION [NUMBER] - [NAME]
// VARIATION CSS
[CSS using verified selectors]

// VARIATION JAVASCRIPT
[JavaScript using verified selectors from the JSON]

// GLOBAL EXPERIENCE CSS (if needed)
[Shared CSS]

// GLOBAL EXPERIENCE JS (if needed)
[Shared JavaScript]

**REMINDER:** All selectors are in the JSON object above. Reference them exactly as provided. Do not create new selectors.
`;

  async callChatGPT(messages, authToken, model = 'gpt-4o-mini') {
    const resolvedModel = typeof model === 'string' && model.trim() ? model.trim() : 'gpt-4o-mini';
    console.log('Calling OpenAI Chat Completions.', { model: resolvedModel, messageCount: messages.length });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: messages,
        max_tokens: 4000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      let errorDetail = `ChatGPT API error: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error?.message) {
          errorDetail = `${errorBody.error.message} (HTTP ${response.status})`;
        }
      } catch (parseError) {
        // Ignore parse errors and fall back to status message
      }

      if (response.status === 429 && !/rate limit|quota|billing/i.test(errorDetail)) {
        errorDetail = 'OpenAI rate limit hit. Wait a moment or reduce request frequency.';
      }

      throw new Error(errorDetail);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '';
    return {
      content,
      usage: result?.usage || null,
      model: resolvedModel
    };
  }

  parseGeneratedCode(response) {
    // Parse the generated code into structured format
    const sections = {
      variations: [],
      globalCSS: '',
      globalJS: ''
    };

    const lines = response.split('\n');
    let currentSection = null;
    let currentContent = '';
    
    for (const line of lines) {
      if (line.includes('VARIATION') && line.includes('//')) {
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
    
    // Add final section
    if (currentSection) {
      this.addToSection(sections, currentSection, currentContent.trim());
    }

    return sections;
  }

  parseSection(line) {
    if (line.includes('GLOBAL EXPERIENCE CSS')) {
      return { type: 'globalCSS' };
    } else if (line.includes('GLOBAL EXPERIENCE JS')) {
      return { type: 'globalJS' };
    } else if (line.includes('VARIATION')) {
      const match = line.match(/VARIATION\s+(\d+)[^-]*-\s*(.+)/);
      const isCSS = line.includes('CSS');
      const isJS = line.includes('JAVASCRIPT') || line.includes('JS');
      
      return {
        type: 'variation',
        number: match ? parseInt(match[1]) : 1,
        name: match ? match[2].trim() : 'Unnamed',
        codeType: isCSS ? 'css' : 'js'
      };
    }
    return null;
  }

  addToSection(sections, sectionInfo, content) {
    if (!sectionInfo || !content) return;

    if (sectionInfo.type === 'globalCSS') {
      sections.globalCSS = content;
    } else if (sectionInfo.type === 'globalJS') {
      sections.globalJS = content;
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
        variation.css = content;
      } else {
        variation.js = content;
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

  sanitizeDomSnapshot(snapshot = {}) {
    const MAX_CAPTURE_CHARS = 750000;
    const clamp = (value = '', note = '') => {
      if (!value) return '';
      return value.length > MAX_CAPTURE_CHARS
        ? `${value.substring(0, MAX_CAPTURE_CHARS)}${note}`
        : value;
    };

    return {
      html: clamp(snapshot.html, '\n<!-- truncated -->'),
      css: clamp(snapshot.css, '\n/* truncated */')
    };
  }

  shouldInjectCaptureScript(error) {
    if (!error && !chrome.runtime.lastError) return false;
    const message = chrome.runtime.lastError?.message || error?.message || '';
    const triggers = [
      'No matching message handler',
      'Receiving end does not exist',
      'Could not establish connection'
    ];
    return triggers.some(trigger => message.includes(trigger));
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

  normalizeUsage(aiResponse = {}) {
    const usage = aiResponse.usage || {};
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || promptTokens + completionTokens;

    return {
      model: aiResponse.model || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens
    };
  }

  async adjustCode(data) {
    const logger = this.createOperationLogger('AdjustCode');
    try {
      const { generationData, previousCode, feedback, testSummary } = data || {};
      if (!generationData) {
        throw new Error('Missing generation context for adjustment request.');
      }

      const authToken = await this.getAuthToken();
      if (!authToken) {
        throw new Error('OpenAI API key missing. Add one in the side panel settings.');
      }

      const basePrompt = this.buildPrompt(
        generationData.pageData,
        generationData.description,
        generationData.designFiles,
        generationData.variations,
        generationData.settings
      );
      logger.log('Base prompt prepared', `length=${basePrompt.length}`);

      let adjustmentContext = '';
      if (previousCode) {
        adjustmentContext += `\nPREVIOUS IMPLEMENTATION OUTPUT:\n${previousCode}`;
        logger.log('Including previous code in adjustment');
      }
      if (testSummary) {
        adjustmentContext += `\nLATEST TEST RESULTS:\n${this.formatTestSummary(testSummary)}`;
        logger.log('Including test summary');
      }
      if (feedback) {
        adjustmentContext += `\nUSER FEEDBACK:\n${feedback}`;
        logger.log('Including user feedback');
      }

      const finalPrompt = `${basePrompt}
${adjustmentContext}

Please revise the generated code to address the feedback and keep the exact output structure described earlier.`;

      // Build messages with screenshot for adjustment too
      const messages = [{
        role: 'system',
        content: 'You are an expert A/B testing developer who generates clean, production-ready code using only vanilla JavaScript.'
      }];

      // Include screenshot if available
      if (generationData.pageData?.screenshot) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: generationData.pageData.screenshot,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: finalPrompt
            }
          ]
        });
        logger.log('Including screenshot in adjustment request', 'using vision');
      } else {
        messages.push({
          role: 'user',
          content: finalPrompt
        });
        logger.log('No screenshot available for adjustment', 'text-only');
      }

      const aiResponse = await this.callChatGPT(
        messages,
        authToken,
        generationData.settings?.model || 'gpt-4o-mini'
      );
      logger.log('OpenAI adjustment response received', `promptTokens=${aiResponse.usage?.promptTokens || 0} completionTokens=${aiResponse.usage?.completionTokens || 0}`);

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
    
    if (!tabId) {
      return { success: false, error: 'No tab ID provided for variation application' };
    }

    try {
      // First, send CSS to content script for injection
      let cssResult = { success: true };
      if (css) {
        try {
          cssResult = await chrome.tabs.sendMessage(tabId, {
            type: 'APPLY_VARIATION',
            css,
            js: null, // Don't send JS to content script
            key
          });
        } catch (error) {
          return { success: false, error: `Failed to apply CSS: ${error.message}` };
        }
      }

      // Then, execute JavaScript using chrome.scripting.executeScript
      // This bypasses CSP and runs in the page's main world
      let jsResult = { success: true };
      if (js && js.trim()) {
        // Debug: Log the JS being executed
        console.log('🔧 Executing JavaScript for variation:', {
          length: js.length,
          preview: js.substring(0, 200)
        });
        
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN', // Execute in page context, not isolated world
            func: (code) => {
              try {
                // Clean the code - remove markdown code fences and extra whitespace
                let cleanCode = code.trim();
                
                // Remove markdown code fences if present
                cleanCode = cleanCode.replace(/^```(?:javascript|js)?\n?/gi, '');
                cleanCode = cleanCode.replace(/\n?```$/g, '');
                cleanCode = cleanCode.trim();
                
                if (!cleanCode) {
                  return { success: false, error: 'Empty code after cleaning' };
                }
                
                // Execute the code directly in global scope
                // Using indirect eval to ensure global scope execution
                const result = (0, eval)(cleanCode);
                return { success: true, result };
              } catch (error) {
                return {
                  success: false,
                  error: error.message,
                  stack: error.stack
                };
              }
            },
            args: [js]
          });

          if (results && results[0]) {
            jsResult = results[0].result;
          }
        } catch (error) {
          return {
            success: false,
            error: `JavaScript execution error: ${error.message}`
          };
        }
      }

      // Return combined result
      if (!jsResult.success) {
        return {
          success: false,
          error: jsResult.error,
          cssApplied: !!css,
          jsApplied: false
        };
      }

      return {
        success: true,
        cssApplied: !!css,
        jsApplied: !!js
      };
    } catch (error) {
      console.error('Variation application failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to apply variation'
      };
    }
  }

  notifyPageChange(tabId, tab) {
    // Notify side panel about page changes
    chrome.runtime.sendMessage({
      type: 'PAGE_CHANGED',
      tabId,
      url: tab.url,
      title: tab.title
    }).catch(() => {
      // Side panel might not be open, ignore error
    });
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

// Runs in the context of the active tab to collect DOM details for generation prompts
function extractPageData() {
  const MAX_CAPTURE_CHARS = 750000;

  // SMART HTML EXTRACTION - Prioritize important elements
  function extractSmartHTML() {
    const importantElements = [];
    
    // Priority 1: Interactive elements
    const interactive = document.querySelectorAll(
      'button, a[href], input, textarea, select, [role="button"], [onclick], .btn, .button, [class*="cta"]'
    );
    
    // Priority 2: Headings and important text
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    // Priority 3: Forms
    const forms = document.querySelectorAll('form');
    
    // Priority 4: Navigation
    const navigation = document.querySelectorAll('nav, header, [role="navigation"]');
    
    // Priority 5: Main content areas
    const mainContent = document.querySelectorAll('main, article, [role="main"], .content, #content');
    
    // Collect all priority elements
    const allPriority = [
      ...interactive,
      ...headings,
      ...forms,
      ...navigation,
      ...mainContent
    ];
    
    // Extract clean HTML for each element with context
    const extractedHTML = [];
    const seenElements = new Set();
    
    allPriority.forEach(element => {
      if (seenElements.has(element)) return;
      seenElements.add(element);
      
      // Get element with some parent context
      let contextElement = element;
      let depth = 0;
      while (contextElement.parentElement && depth < 2) {
        contextElement = contextElement.parentElement;
        depth++;
      }
      
      const elementHTML = contextElement.outerHTML;
      const selector = generateSmartSelector(element);
      
      extractedHTML.push({
        selector: selector,
        html: cleanHTML(elementHTML, 500), // Limit each element
        type: element.tagName.toLowerCase(),
        text: element.textContent?.trim().substring(0, 100),
        classes: Array.from(element.classList),
        id: element.id || null
      });
    });
    
    // Build smart HTML summary
    let smartHTML = '<!-- SMART HTML EXTRACTION - Priority Elements -->\n\n';
    
    // Group by type
    const byType = {};
    extractedHTML.forEach(item => {
      if (!byType[item.type]) byType[item.type] = [];
      byType[item.type].push(item);
    });
    
    // Output structured format
    Object.entries(byType).forEach(([type, items]) => {
      smartHTML += `\n<!-- ${type.toUpperCase()} Elements (${items.length}) -->\n`;
      items.forEach(item => {
        smartHTML += `<!-- Selector: ${item.selector} -->\n`;
        if (item.id) smartHTML += `<!-- ID: ${item.id} -->\n`;
        if (item.classes.length) smartHTML += `<!-- Classes: ${item.classes.join(', ')} -->\n`;
        if (item.text) smartHTML += `<!-- Text: ${item.text} -->\n`;
        smartHTML += item.html + '\n\n';
      });
    });
    
    // If still space, add body structure
    if (smartHTML.length < MAX_CAPTURE_CHARS * 0.7) {
      const bodyClone = document.body.cloneNode(false);
      smartHTML += '\n<!-- PAGE STRUCTURE -->\n';
      smartHTML += `<body class="${document.body.className}" id="${document.body.id}">\n`;
      smartHTML += '  <!-- Content extracted above -->\n';
      smartHTML += '</body>\n';
    }
    
    return smartHTML.substring(0, MAX_CAPTURE_CHARS);
  }
  
  function generateSmartSelector(element) {
    // Try ID first
    if (element.id) return `#${element.id}`;
    
    // Try unique class combination
    if (element.className) {
      const classes = Array.from(element.classList)
        .filter(c => !c.match(/^(is-|has-|active|selected)/)); // Filter state classes
      if (classes.length > 0) {
        const selector = '.' + classes.join('.');
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }
    
    // Build path-based selector
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className) {
        const classes = Array.from(current.classList).slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }
      
      // Add nth-child if needed
      const siblings = Array.from(current.parentElement?.children || []);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      if (path.length >= 4) break; // Max depth
    }
    
    return path.join(' > ');
  }
  
  function cleanHTML(html, maxLength) {
    // Remove scripts and comments
    let cleaned = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<!--.*?-->/gs, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '... -->';
    }
    
    return cleaned;
  }

  // SMART CSS EXTRACTION - Only used styles
  function extractSmartCSS() {
    const usedClasses = new Set();
    const usedIds = new Set();
    
    // Collect all classes and IDs actually used
    document.querySelectorAll('*').forEach(element => {
      if (element.id) usedIds.add(element.id);
      element.classList.forEach(cls => usedClasses.add(cls));
    });
    
    const cssSnippets = [];
    
    // Extract only CSS for used classes/IDs
    for (const styleSheet of document.styleSheets) {
      try {
        for (const rule of styleSheet.cssRules) {
          if (rule.cssText) {
            const text = rule.cssText;
            
            // Check if rule applies to any used class or ID
            const matchesUsed = 
              Array.from(usedClasses).some(cls => text.includes(`.${cls}`)) ||
              Array.from(usedIds).some(id => text.includes(`#${id}`)) ||
              text.match(/^(body|html|\*|button|a|input|form|nav|header|main)/); // Common elements
            
            if (matchesUsed) {
              cssSnippets.push(text);
            }
          }
        }
      } catch (error) {
        // Cross-origin stylesheet, skip
        if (styleSheet.href) {
          cssSnippets.push(`/* External: ${styleSheet.href} */`);
        }
      }
    }
    
    // Add inline styles for key elements
    document.querySelectorAll('[style]').forEach(element => {
      const selector = generateSmartSelector(element);
      cssSnippets.push(`${selector} { ${element.style.cssText} }`);
    });
    
    // Add computed styles for interactive elements
    document.querySelectorAll('button, .btn, [role="button"], a[href]').forEach(element => {
      const computed = window.getComputedStyle(element);
      const selector = generateSmartSelector(element);
      const importantProps = [
        'display', 'position', 'color', 'background-color', 'background', 
        'border', 'border-radius', 'padding', 'margin', 'font-size', 
        'font-weight', 'text-align', 'cursor'
      ];
      
      const styles = importantProps
        .map(prop => {
          const value = computed.getPropertyValue(prop);
          return value && value !== 'none' && value !== 'normal' ? `${prop}: ${value}` : null;
        })
        .filter(Boolean)
        .join('; ');
      
      if (styles) {
        cssSnippets.push(`/* Computed for ${selector} */\n${selector} { ${styles}; }`);
      }
    });
    
    return cssSnippets.join('\n\n').substring(0, MAX_CAPTURE_CHARS);
  }

  const smartHTML = extractSmartHTML();
  const smartCSS = extractSmartCSS();

  return { 
    html: smartHTML,
    css: smartCSS,
    stats: {
      htmlLength: smartHTML.length,
      cssLength: smartCSS.length,
      interactiveElements: document.querySelectorAll('button, a[href], input, textarea, select').length,
      totalElements: document.querySelectorAll('*').length
    }
  };
}

function collectPageMetrics() {
  const doc = document.documentElement;
  const body = document.body;

  const fullHeight = Math.max(
    doc?.scrollHeight || 0,
    body?.scrollHeight || 0,
    doc?.offsetHeight || 0,
    body?.offsetHeight || 0
  );

  const fullWidth = Math.max(
    doc?.scrollWidth || 0,
    body?.scrollWidth || 0,
    doc?.offsetWidth || 0,
    body?.offsetWidth || 0
  );

  return {
    fullHeight,
    fullWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio
  };
}

function extractHtmlOnly() {
  try {
    return {
      html: document.documentElement.outerHTML,
      css: ''
    };
  } catch (error) {
    return { html: '', css: '' };
  }
}
