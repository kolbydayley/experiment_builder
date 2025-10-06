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
        this.setDefaultSettings();
        this.setupSidePanel();
      }
    });

    // Set up side panel behavior
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
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

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

        case 'CREATE_CONVERT_EXPERIMENT':
          const experiment = await this.createConvertExperiment(message.data);
          sendResponse({ success: true, data: experiment });
          break;
        
        case 'GET_CONVERT_API_KEYS':
          const keys = await this.getConvertAPIKeys();
          sendResponse({ success: true, keys });
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
          function: () => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
        });
        await this.wait(100);
      } catch (scrollError) {
        console.warn('Unable to reset scroll position before capture:', scrollError);
      }
      
      // Capture screenshot
      let screenshot = null;
      let originalZoom = 1;
      let zoomAdjusted = false;

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

      // Get element database from content script
      let elementDatabase = null;
      let messageError = null;
      
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PAGE_DATA' });
        if (response?.success && response.data) {
          elementDatabase = response.data.elementDatabase;
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

      if (!elementDatabase && this.shouldInjectCaptureScript(messageError)) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/page-capture.js']
          });
          const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PAGE_DATA' });
          if (response?.success && response.data) {
            elementDatabase = response.data.elementDatabase;
          }
        } catch (injectError) {
          console.warn('Manual content script injection failed:', injectError);
        }
      }

      if (!elementDatabase || !elementDatabase.elements) {
        throw new Error('Unable to build element database. Please reload the page and try again.');
      }

      console.log(`✅ Captured ${elementDatabase.elements.length} elements from page`);

      return {
        url: tab.url,
        title: tab.title,
        screenshot,
        elementDatabase,
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

      // NEW: Element database is already in pageData!
      logger.log('Using Element Database', `elements=${pageData.elementDatabase?.elements?.length || 0}`);
      
      if (!pageData.elementDatabase || !pageData.elementDatabase.elements) {
        throw new Error('Element database not found in page data. Please recapture the page.');
      }
      
      // Generate code directly using the element database
      logger.log('Generating code with Element Database');
      const prompt = this.buildCodeGenerationPrompt(
        pageData, 
        description, 
        designFiles, 
        variations, 
        settings
      );
      
      const messages = [{
        role: 'system',
        content: 'You are an expert at generating clean, production-ready JavaScript and CSS code for A/B tests using only vanilla JavaScript.'
      }];

      // Add screenshot with structured element data
      if (pageData.screenshot) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: pageData.screenshot,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        });
        logger.log('Including screenshot in request', 'using vision');
      } else {
        messages.push({
          role: 'user',
          content: prompt
        });
        logger.log('No screenshot available', 'text-only');
      }
      
      const aiResponse = await this.callChatGPT(messages, authToken, settings?.model);
      logger.log('Code generated', `tokens=${aiResponse.usage?.promptTokens || 0}`);
      
      const parsedCode = this.parseGeneratedCode(aiResponse.content);
      logger.log('Code parsed', `variations=${parsedCode.variations.length}`);

      return {
        code: parsedCode,
        usage: this.normalizeUsage(aiResponse),
        logs: logger.entries()
      };
    } catch (error) {
      logger.error('Code generation failed', error?.message);
      throw error;
    }
  }

  buildCodeGenerationPrompt(pageData, description, designFiles, variations, settings) {
    // Get top 50 most important elements from database
    const topElements = pageData.elementDatabase.elements.slice(0, 50);
    const elementsJSON = JSON.stringify(topElements, null, 2);
    const metadata = pageData.elementDatabase.metadata;

    return `
You are generating A/B test code for Convert.com using a STRUCTURED ELEMENT DATABASE.

**USER REQUEST:**
${description}

**PAGE INFORMATION:**
URL: ${metadata.url}
Title: ${metadata.title}
Total Interactive Elements: ${metadata.totalElements}

**ELEMENT DATABASE (Top ${topElements.length} elements by importance):**
${elementsJSON}

**HOW TO USE THE DATABASE:**
1. Each element has a unique ID (e.g., "el_001")
2. Use the "selector" field - these are VERIFIED and will work
3. Match elements by:
   - text: What the element says
   - type: button, a, input, etc.
   - visual: colors, position, size
   - context: section (hero, nav, footer)
   - category: cta, button, link, etc.

**EXAMPLE MATCHING:**
User says: "Change the blue CTA button text"
You find: element with text="Get Started", backgroundColor="blue", category="cta"
You use: That element's "selector" field exactly as-is

**VARIATIONS TO CREATE:**
${variations.map((v, i) => `${i + 1}. ${v.name}: ${v.description || 'See description above'}`).join('\n')}

**CRITICAL RULES - READ EVERY ONE:**
1. ALWAYS use selectors from the database - they are pre-verified
2. Match elements using text, visual properties, and context
3. Use vanilla JavaScript ONLY - no jQuery, no libraries
4. **IMPLEMENT EVERY ASPECT OF THE USER REQUEST** - DO NOT SKIP ANY PART
5. If user mentions color AND text changes, your code MUST include BOTH
6. For color changes: ALWAYS use element.style.backgroundColor = 'red' (or hex)
7. For text changes: ALWAYS use element.textContent = 'new text'
8. Prefer JavaScript for styling (inline styles override CSS)
9. If an element isn't in the database, don't make up selectors

**CODE PATTERNS:**

// Wait for element using selector from database:
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

// ✅ CORRECT Example - User asks for text AND color:
// Database: { selector: "button.cta-primary", text: "Get Started" }
waitForElement('button.cta-primary', (element) => {
  element.textContent = 'Start Free Trial';           // ← Text change
  element.style.backgroundColor = 'red';               // ← Color change  
  element.style.color = 'white';                       // ← Optional: contrast
});

// ❌ WRONG - Only changes text when user asked for color too:
waitForElement('button.cta-primary', (element) => {
  element.textContent = 'Start Free Trial';  // Missing backgroundColor!
});

// Color names: 'red', 'blue', 'green', 'orange', 'purple'
// Or hex: '#FF0000', '#0000FF', '#00FF00', '#FFA500', '#800080'

// IMPORTANT: Always test selectors exist before using them:
// const testElement = document.querySelector('selector');
// if (!testElement) console.error('Selector not found:', 'selector');

**GENERATION SETTINGS:**
- Prefer CSS: ${settings.preferCSS ? 'YES' : 'NO'}
- Include DOM checks: ${settings.includeDOMChecks ? 'YES' : 'NO'}

**OUTPUT FORMAT:**
Return ONLY the CSS and JavaScript code sections without any comments or explanations.

// VARIATION [NUMBER] - [NAME]
// VARIATION CSS
[Pure CSS rules only - no comments]

// VARIATION JAVASCRIPT
// Always use waitForElement for robust element selection:
waitForElement('exact-selector-from-database', (element) => {
  // Your changes here
  element.textContent = 'New text';
  element.style.backgroundColor = 'red';
});

// GLOBAL EXPERIENCE CSS (if needed)
[Shared CSS rules only]

// GLOBAL EXPERIENCE JS (if needed)
[Shared JavaScript code only]

**BEFORE YOU RESPOND - VERIFY:**
□ Did I read the ENTIRE user request?
□ Did I identify ALL requested changes (text, color, style, etc.)?
□ Did I implement EVERY change in my code?
□ If user wants color change, did I add element.style.backgroundColor?
□ If user wants text change, did I add element.textContent?
□ Am I using ONLY selectors from the database?

**REMEMBER:** 
- Look at the screenshot to visually identify elements
- Match them to the database using text, color, position, category
- Use the exact selector from the matched database entry
- IMPLEMENT EVERY ASPECT - don't skip color changes or text changes
- Never invent selectors - only use what's in the database
`;
  }

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

    // Clean content - remove markdown code fences
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

      const basePrompt = this.buildCodeGenerationPrompt(
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

      const messages = [{
        role: 'system',
        content: 'You are an expert A/B testing developer who generates clean, production-ready code using only vanilla JavaScript.'
      }];

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
        // Clean CSS before applying
        const cleanedCSS = css
          .replace(/\/\/.*$/gm, '')           // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments  
          .replace(/\n\s*\n/g, '\n')          // Remove empty lines
          .trim();
          
        try {
          logger.log('Sending CSS to content script', `length=${cleanedCSS.length}`);
          cssResult = await chrome.tabs.sendMessage(tabId, {
            type: 'APPLY_VARIATION',
            css: cleanedCSS,
            js: null,
            key
          });
          logger.log('Content script response for CSS', JSON.stringify(cssResult));
          if (!cssResult?.success) {
            const cssError = cssResult?.error || 'Content script failed to apply CSS';
            logger.error('CSS application reported failure', cssError);
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
        // AGGRESSIVE cleaning of JavaScript
        let cleanedJS = js.trim();
        
        // Remove markdown code fences (multiple passes to catch all variations)
        cleanedJS = cleanedJS.replace(/^```(?:javascript|js)?\s*\n?/gi, '');
        cleanedJS = cleanedJS.replace(/\n?```\s*$/g, '');
        cleanedJS = cleanedJS.replace(/```$/g, ''); // Extra pass for trailing backticks
        
        // Remove comments
        cleanedJS = cleanedJS.replace(/\/\/.*$/gm, '');
        cleanedJS = cleanedJS.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Clean up whitespace
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
                // Define utility functions first
                if (!window.waitForElement) {
                  window.waitForElement = function(selector, callback, maxWait = 10000) {
                    console.log(`%c[CONVERT-AI] Looking for: ${selector}`, 'color: blue; font-weight: bold');
                    
                    // First, test if selector is valid
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
                        const oldBg = element.style.backgroundColor;
                        
                        callback(element);
                        
                        const newText = element.textContent;
                        const newBg = element.style.backgroundColor;
                        
                        console.log(`%c[CONVERT-AI] ✓ Callback executed for: ${selector}`, 'color: green', {
                          textChanged: oldText !== newText,
                          oldText: oldText?.substring(0, 30),
                          newText: newText?.substring(0, 30),
                          bgChanged: oldBg !== newBg,
                          oldBg,
                          newBg
                        });
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
                          console.log('[CONVERT-AI] Available elements on page:', {
                            buttons: document.querySelectorAll('button').length,
                            links: document.querySelectorAll('a').length,
                            allElements: document.querySelectorAll('*').length
                          });
                        }
                      }, 100);
                      return false;
                    }
                  };
                  
                  // Add a direct test function for debugging
                  window.testElementChange = function(selector, newText, newColor) {
                    const elements = document.querySelectorAll(selector);
                    console.log(`[testElementChange] Found ${elements.length} elements for "${selector}"`);
                    elements.forEach((el, i) => {
                      const oldText = el.textContent;
                      const oldColor = window.getComputedStyle(el).backgroundColor;
                      el.textContent = newText || `TEST ${i}`;
                      el.style.backgroundColor = newColor || 'red';
                      console.log(`[testElementChange] Element ${i} changed:`, {
                        oldText: oldText.substring(0, 30),
                        newText: el.textContent.substring(0, 30),
                        oldColor,
                        newColor: el.style.backgroundColor
                      });
                    });
                    return elements.length;
                  };
                }

                // ULTRA-AGGRESSIVE cleaning
                let cleanCode = code.trim();
                
                // Remove ALL possible markdown code fence variations
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
                
                // Debug: Check if any selectors in the code actually exist
                const selectorMatches = cleanCode.match(/waitForElement\(['"`]([^'"`]+)['"`]/g);
                if (selectorMatches) {
                  selectorMatches.forEach(match => {
                    const selector = match.match(/['"`]([^'"`]+)['"`]/)[1];
                    const elements = document.querySelectorAll(selector);
                    console.log(`[JavaScript Debug] Selector "${selector}" matches ${elements.length} elements`);
                    if (elements.length > 0) {
                      console.log(`[JavaScript Debug] First element:`, {
                        tagName: elements[0].tagName,
                        classes: elements[0].className,
                        text: elements[0].textContent?.substring(0, 50),
                        visible: elements[0].offsetParent !== null
                      });
                    }
                  });
                }
                
                const result = (0, eval)(cleanCode);
                console.log('[JavaScript Execution] Execution completed, result:', result);
                
                // After execution, check if changes were applied
                if (selectorMatches) {
                  setTimeout(() => {
                    selectorMatches.forEach(match => {
                      const selector = match.match(/['"`]([^'"`]+)['"`]/)[1];
                      const elements = document.querySelectorAll(selector);
                      if (elements.length > 0) {
                        console.log(`[JavaScript Verification] Post-execution check for "${selector}":`, {
                          text: elements[0].textContent?.substring(0, 50),
                          backgroundColor: window.getComputedStyle(elements[0]).backgroundColor
                        });
                      }
                    });
                  }, 500); // Check after 500ms to allow waitForElement to work
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
            logger.error('JavaScript execution reported failure', jsResult?.error || 'Unknown error');
            return {
              success: false,
              error: jsResult?.error || 'JavaScript execution failed',
              stack: jsResult?.stack,
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
    }).catch(() => {
      // Side panel might not be open, ignore error
    });
  }

  // ============================================
  // Convert.com API Integration
  // ============================================

  async getConvertAPIKeys() {
    try {
      const result = await chrome.storage.local.get(['convertApiKeys']);
      return result.convertApiKeys || [];
    } catch (error) {
      console.error('Failed to get Convert API keys:', error);
      return [];
    }
  }

  wrapCSSInJS(css, js) {
    let code = '';
    
    // Inject CSS via JavaScript (Convert.com requirement)
    if (css && css.trim()) {
      // Escape backticks and dollar signs for template literal
      const escapedCSS = css.replace(/`/g, '\\`').replace(/\$/g, '\\

// Initialize service worker
console.log('🚀 Initializing ServiceWorker...');
try {
  const serviceWorker = new ServiceWorker();
  console.log('✅ ServiceWorker initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize ServiceWorker:', error);
}

// Helper functions for page metrics
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
);
      code += `
// Inject CSS via dynamic style tag
(function() {
  const style = document.createElement('style');
  style.setAttribute('data-convert-variation', 'true');
  style.textContent = \`${escapedCSS}\`;
  document.head.appendChild(style);
})();
`;
    }
    
    // Add JavaScript
    if (js && js.trim()) {
      code += '\n\n' + js;
    }
    
    return code;
  }

  formatVariationsForConvert(variations) {
    return variations.map((variation, index) => {
      // Wrap CSS in JavaScript
      const combinedCode = this.wrapCSSInJS(variation.css, variation.js);
      
      return {
        name: variation.name || `Variation ${index + 1}`,
        weight: Math.floor(100 / (variations.length + 1)), // Equal distribution
        code: combinedCode
      };
    });
  }

  async createConvertExperiment(experimentData) {
    const { apiKey, apiSecret, projectId, name, description, variations, url } = experimentData;
    
    if (!apiKey || !apiSecret) {
      throw new Error('Convert.com API key and secret are required');
    }

    const logger = this.createOperationLogger('CreateExperiment');
    logger.log('Creating experiment in Convert.com', `name=${name}`);

    try {
      // Format variations
      const formattedVariations = this.formatVariationsForConvert(variations);
      
      // Create base64 encoded credentials for Basic Auth
      const credentials = btoa(`${apiKey}:${apiSecret}`);
      
      // Create experiment via Convert.com API
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
}

// Initialize service worker
console.log('🚀 Initializing ServiceWorker...');
try {
  const serviceWorker = new ServiceWorker();
  console.log('✅ ServiceWorker initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize ServiceWorker:', error);
}

// Helper functions for page metrics
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
