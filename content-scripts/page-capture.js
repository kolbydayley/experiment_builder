// Content script for page capture functionality
class PageCapture {
  constructor() {
    this.isInitialized = false;
    this.initialize();
  }

  initialize() {
    if (this.isInitialized) return;
    
    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle PING to check if content script is loaded
      if (message.type === 'PING') {
        sendResponse({ success: true, loaded: true });
        return false;
      }
      
      if (message.type === 'CAPTURE_PAGE_DATA') {
        const options = {
          rootElementSelector: message.rootElementSelector || null,
          selectedElementSelector: message.selectedElementSelector || null,
          maxProximityElements: message.maxProximityElements || 8,
          maxStructureElements: message.maxStructureElements || 12,
          proximityRadius: message.proximityRadius || 300
        };

        this.capturePageData(options)
          .then(data => sendResponse({ success: true, data }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
      }

      // Handle code preview (temporary injection)
      if (message.action === 'previewCode') {
        console.log('🎯 [Content Script] Received previewCode message:', {
          hasCSS: !!message.css,
          hasJS: !!message.js,
          variationNumber: message.variationNumber,
          cssLength: message.css?.length || 0,
          jsLength: message.js?.length || 0
        });
        this.previewCode(message.css, message.js, message.variationNumber)
          .then(() => {
            console.log('✅ [Content Script] previewCode completed successfully');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('❌ [Content Script] previewCode failed:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      // Handle code testing (permanent injection)
      if (message.action === 'testCode') {
        this.testCode(message.css, message.js, message.variationNumber)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }

      // Handle clear preview
      if (message.action === 'clearPreview') {
        this.clearPreview()
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }

      // Handle error checking
      if (message.action === 'checkErrors') {
        const errorCheck = this.checkPageErrors(message.variationNumber);
        sendResponse({ success: true, hasErrors: errorCheck.hasErrors, errors: errorCheck.errors });
        return false;
      }

      if (message.type === 'RESET_VARIATION') {
        try {
          this.clearInjectedAssets(message.keyPrefix || 'convert-ai-');
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return false;
      }

      if (message.type === 'APPLY_VARIATION') {
        const payload = message;
        try {
          console.log('[Convert CSS Debug] Received APPLY_VARIATION message:', payload);
          const result = this.applyVariation(payload);
          console.log('[Convert CSS Debug] applyVariation returned:', result);

          // Send logs back to background for debugging
          if (result && typeof result === 'object') {
            result.debugLogs = [
              `applyVariation called with: css=${!!payload.css}, js=${!!payload.js}, key=${payload.key}`,
              `variation key: ${payload.key || 'auto-generated'}`,
              `result: ${JSON.stringify(result)}`
            ];
          }

          console.log('[Convert CSS Debug] Sending response:', result);
          sendResponse(result);
          console.log('[Convert CSS Debug] Response sent');
        } catch (error) {
          console.error('[Convert CSS Debug] Error in applyVariation:', error);
          const errorResponse = { success: false, error: error.message };
          console.log('[Convert CSS Debug] Sending error response:', errorResponse);
          sendResponse(errorResponse);
        }
        return true; // Keep message channel open for response
      }

      // ✨ NEW: Automatic code testing
      if (message.type === 'TEST_CODE') {
        try {
          const tester = new CodeTester();
          tester.testGeneratedCode(message.variation, { testExecution: false })
            .then(testResult => {
              sendResponse({ success: true, testResult });
            })
            .catch(error => {
              sendResponse({ success: false, error: error.message });
            });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return true; // Keep message channel open for async response
      }

      // ✨ NEW: Verify selectors exist on page (for RefinementContext validation)
      if (message.type === 'VERIFY_SELECTORS') {
        try {
          const { selectors } = message;
          const exists = {};

          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              exists[selector] = elements.length > 0;
            } catch (error) {
              // Invalid selector
              exists[selector] = false;
            }
          });

          sendResponse({ success: true, exists });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return false;
      }

      // ✨ NEW: Test code validation (runtime testing for RefinementContext)
      if (message.type === 'TEST_CODE_VALIDATION') {
        try {
          const { code, timeout } = message;
          const errors = [];
          const warnings = [];

          // Basic runtime test: Try to apply code and catch errors
          const testKey = 'validation-test-' + Date.now();

          // Test CSS injection
          if (code.variations && code.variations.length > 0) {
            code.variations.forEach((variation, idx) => {
              if (variation.css) {
                try {
                  const style = document.createElement('style');
                  style.id = testKey + '-css-' + idx;
                  style.textContent = variation.css;
                  document.head.appendChild(style);

                  // Check if any selectors matched
                  const cssRules = Array.from(style.sheet?.cssRules || []);
                  if (cssRules.length === 0) {
                    warnings.push({
                      type: 'NO_CSS_RULES',
                      message: `Variation ${idx + 1} CSS has no rules`
                    });
                  }

                  // Clean up
                  style.remove();
                } catch (error) {
                  errors.push({
                    type: 'CSS_ERROR',
                    variation: idx + 1,
                    message: error.message
                  });
                }
              }

              // Test JS syntax (don't execute, just parse)
              if (variation.js) {
                try {
                  new Function(variation.js);
                } catch (error) {
                  errors.push({
                    type: 'JS_SYNTAX_ERROR',
                    variation: idx + 1,
                    message: error.message
                  });
                }
              }
            });
          }

          sendResponse({ success: true, errors, warnings });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return false;
      }

      // ✨ NEW: Capture deep context for specific element (Stage 2 of two-stage generation)
      if (message.type === 'CAPTURE_DEEP_CONTEXT') {
        try {
          const { selector, options = {} } = message;

          const element = document.querySelector(selector);
          if (!element) {
            sendResponse({ success: false, error: `Element not found: ${selector}` });
            return false;
          }

          // Capture DEEP context with all available data
          const deepContext = this.captureDeepElementContext(element, options);
          sendResponse({ success: true, deepContext });
        } catch (error) {
          console.error('[CAPTURE_DEEP_CONTEXT] Error:', error);
          sendResponse({ success: false, error: error.message });
        }
        return false;
      }

      // ✨ NEW: Analyze page-wide behavior patterns
      if (message.type === 'ANALYZE_PAGE_BEHAVIORS') {
        try {
          if (!window.ContextBuilder) {
            sendResponse({ success: false, error: 'ContextBuilder not loaded' });
            return false;
          }

          const contextBuilder = new ContextBuilder();
          const analysis = contextBuilder.analyzePageBehaviors();
          sendResponse({ success: true, analysis });
        } catch (error) {
          console.error('[ANALYZE_PAGE_BEHAVIORS] Error:', error);
          sendResponse({ success: false, error: error.message });
        }
        return false;
      }
    });

    this.isInitialized = true;
  }

  clearInjectedAssets(prefix) {
    console.log('🧹 [LEGACY] clearInjectedAssets called with prefix:', prefix);
    console.log('⚠️ This is legacy code - Cleanup Manager should handle most cleanup');

    // Remove injected CSS and JS tags (for old applyVariation method)
    document.querySelectorAll('[data-convert-ai-style]').forEach(node => {
      if (!prefix || node.dataset.convertAiStyle?.startsWith(prefix)) {
        node.remove();
      }
    });
    document.querySelectorAll('[data-convert-ai-script]').forEach(node => {
      if (!prefix || node.dataset.convertAiScript?.startsWith(prefix)) {
        node.remove();
      }
    });

    console.log(`🧹 [LEGACY] Cleared injected CSS/JS tags for prefix: ${prefix}`);
    console.log('⚠️ NOTE: Intervals and DOM modifications handled by Cleanup Manager');
  }

  applyVariation({ css, js, key }) {
    const variationKey = key || `convert-ai-${Date.now()}`;

    // Wrap everything in a try-catch to ensure we always return a response
    try {
      this.clearInjectedAssets(variationKey);

      if (css) {
        // Clean CSS: remove comments and extra whitespace
        const cleanCSS = css
          .replace(/^\s*\/\/.*$/gm, '')       // Remove single-line comments (only full line comments)
          .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
          .replace(/\n\s*\n/g, '\n')          // Remove empty lines
          .trim();

        const style = document.createElement('style');
        style.dataset.convertAiStyle = variationKey;
        style.textContent = cleanCSS;
        document.head.appendChild(style);

        // Quick validation: only check if at least one CSS rule matches
        // (Removed expensive per-rule debugging to prevent timeout)
        let debugCSS = css.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

        // Extract selectors more carefully
        // Match: selector { ... } pattern and extract just the selector
        const selectorMatches = debugCSS.matchAll(/([^{}]+)\s*{[^}]*}/g);
        const selectors = [];
        for (const match of selectorMatches) {
          const selector = match[1].trim();
          // Skip if it looks like it has CSS properties (contains :)
          if (!selector.includes(':') || selector.includes(':hover') || selector.includes(':focus')) {
            selectors.push(selector);
          }
        }

        if (selectors.length > 0) {
          let matchedCount = 0;
          // Only check first 3 selectors to avoid timeout
          selectors.slice(0, 3).forEach(selector => {
            try {
              const matchingElements = document.querySelectorAll(selector);
              if (matchingElements.length > 0) matchedCount++;
            } catch (e) {
              console.warn(`[Convert CSS] Invalid selector: ${selector.substring(0, 100)}`);
            }
          });
          console.log(`[Convert CSS] ${matchedCount}/${Math.min(3, selectors.length)} selectors matched`);
        }

        console.log('[Convert Variation] CSS applied', {
          key: variationKey,
          rules: selectors.length || 0
        });
      }

      // JavaScript execution is now handled by the background service worker
      // using chrome.scripting.executeScript to avoid CSP violations
      // The content script only handles CSS injection

      return {
        success: true,
        cssApplied: !!css,
        cssLength: css ? css.length : 0,
        jsPresent: !!js,
        key: variationKey
      };
    } catch (error) {
      console.error('[Convert Variation] CSS injection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture DEEP context for a specific element (Stage 2 of two-stage generation)
   * Returns ALL available data for the element with no token limits
   */
  captureDeepElementContext(element, options = {}) {
    const {
      maxHTMLLength = 5000,
      includeAllStyles = true,
      includeAllCSSRules = true,
      includeChildren = true,
      includeParents = true,
      includeJSBehaviors = true
    } = options;

    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    // 1. ALL computed styles (200+ properties, not just key ones)
    const allStyles = {};
    if (includeAllStyles) {
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        allStyles[prop] = computed.getPropertyValue(prop);
      }
    }

    // 2. ALL CSS rules that apply to this element (unlimited, sorted by specificity)
    const allCSSRules = [];
    if (includeAllCSSRules) {
      try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            // Skip external stylesheets for CORS safety
            if (sheet.href && !sheet.href.startsWith(window.location.origin)) continue;

            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            for (const rule of rules) {
              if (rule.type === CSSRule.STYLE_RULE) {
                try {
                  if (element.matches(rule.selectorText)) {
                    allCSSRules.push({
                      selector: rule.selectorText,
                      cssText: rule.style.cssText,
                      specificity: this.calculateSpecificity(rule.selectorText),
                      href: sheet.href || 'inline'
                    });
                  }
                } catch (e) {
                  // Invalid selector
                }
              }
            }
          } catch (e) {
            // CORS error on external stylesheet
          }
        }

        // Sort by specificity (most specific last)
        allCSSRules.sort((a, b) => a.specificity - b.specificity);
      } catch (error) {
        console.warn('[Deep Context] Failed to extract CSS rules:', error);
      }
    }

    // 3. Full HTML structure (up to maxHTMLLength)
    const html = element.outerHTML.substring(0, maxHTMLLength);
    const innerHTML = element.innerHTML.substring(0, maxHTMLLength);

    // 4. Siblings context (for understanding horizontal relationships)
    const siblings = {
      previous: null,
      next: null
    };
    if (element.previousElementSibling) {
      const prevStyles = window.getComputedStyle(element.previousElementSibling);
      const prevRect = element.previousElementSibling.getBoundingClientRect();
      siblings.previous = {
        selector: this.generateBasicSelector(element.previousElementSibling),
        tag: element.previousElementSibling.tagName.toLowerCase(),
        classes: Array.from(element.previousElementSibling.classList),
        display: prevStyles.display,
        width: prevStyles.width,
        height: prevStyles.height,
        margin: prevStyles.margin,
        actualWidth: prevRect.width,
        actualHeight: prevRect.height
      };
    }
    if (element.nextElementSibling) {
      const nextStyles = window.getComputedStyle(element.nextElementSibling);
      const nextRect = element.nextElementSibling.getBoundingClientRect();
      siblings.next = {
        selector: this.generateBasicSelector(element.nextElementSibling),
        tag: element.nextElementSibling.tagName.toLowerCase(),
        classes: Array.from(element.nextElementSibling.classList),
        display: nextStyles.display,
        width: nextStyles.width,
        height: nextStyles.height,
        margin: nextStyles.margin,
        actualWidth: nextRect.width,
        actualHeight: nextRect.height
      };
    }

    // 5. Children context (for understanding structure and layout)
    const children = [];
    if (includeChildren && element.children.length > 0) {
      Array.from(element.children).slice(0, 10).forEach(child => {
        const childStyles = window.getComputedStyle(child);
        children.push({
          selector: this.generateBasicSelector(child),
          tag: child.tagName.toLowerCase(),
          classes: Array.from(child.classList),
          text: child.textContent?.substring(0, 100),
          // Layout properties (enhanced for flex/grid understanding)
          position: childStyles.position,
          display: childStyles.display,
          width: childStyles.width,
          height: childStyles.height,
          margin: childStyles.margin,
          padding: childStyles.padding,
          // Flex properties
          flex: childStyles.flex,
          flexGrow: childStyles.flexGrow,
          flexShrink: childStyles.flexShrink,
          flexBasis: childStyles.flexBasis,
          // Grid properties
          gridColumn: childStyles.gridColumn,
          gridRow: childStyles.gridRow
        });
      });
    }

    // 6. Parent chain context
    const parents = [];
    if (includeParents) {
      let parent = element.parentElement;
      let level = 0;
      while (parent && level < 3 && parent.tagName.toLowerCase() !== 'body') {
        const parentComputed = window.getComputedStyle(parent);
        parents.push({
          selector: this.generateBasicSelector(parent),
          tag: parent.tagName.toLowerCase(),
          classes: Array.from(parent.classList),
          level: level,
          position: parentComputed.position,
          display: parentComputed.display,
          zIndex: parentComputed.zIndex
        });
        parent = parent.parentElement;
        level++;
      }
    }

    // 6. JavaScript behaviors
    let behaviors = null;
    if (includeJSBehaviors && window.ContextBuilder) {
      try {
        const contextBuilder = new ContextBuilder();
        behaviors = contextBuilder.extractElementBehaviors(element);
      } catch (error) {
        console.warn('[Deep Context] Failed to extract behaviors:', error);
      }
    }

    // 7. Pseudo-elements (::before and ::after)
    const pseudoElements = {
      before: this.capturePseudoElement(element, '::before'),
      after: this.capturePseudoElement(element, '::after')
    };

    // 8. Overflow and scroll state
    const scrollState = {
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      isScrollable: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
      overflow: computed.overflow,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY
    };

    // 9. Stacking context information
    const stackingContext = {
      zIndex: computed.zIndex,
      createsContext: computed.zIndex !== 'auto' ||
                      computed.position === 'fixed' ||
                      computed.position === 'sticky' ||
                      computed.position === 'absolute' && computed.zIndex !== 'auto' ||
                      parseFloat(computed.opacity) < 1 ||
                      computed.transform !== 'none' ||
                      computed.filter !== 'none'
    };

    // 10. Inline styles
    const inlineStyles = element.getAttribute('style') || null;

    // 11. All attributes
    const attributes = {};
    Array.from(element.attributes).forEach(attr => {
      attributes[attr.name] = attr.value;
    });

    return {
      selector: this.generateBasicSelector(element),
      tag: element.tagName.toLowerCase(),

      // HTML
      html: html,
      innerHTML: innerHTML,
      textContent: element.textContent?.substring(0, 500),

      // Styles (COMPLETE)
      allStyles: allStyles,
      inlineStyles: inlineStyles,

      // CSS Rules (COMPLETE, sorted by specificity)
      allCSSRules: allCSSRules,

      // Pseudo-elements (NEW)
      pseudoElements: pseudoElements,

      // Structure (ENHANCED)
      siblings: siblings,
      children: children,
      parents: parents,

      // Attributes
      attributes: attributes,

      // JavaScript
      behaviors: behaviors,

      // Overflow/Scroll (NEW)
      scrollState: scrollState,

      // Z-Index/Stacking (NEW)
      stackingContext: stackingContext,

      // Position
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right
      },

      // Viewport
      isAboveFold: rect.top < window.innerHeight,
      isVisible: rect.width > 0 && rect.height > 0,

      // Meta
      timestamp: Date.now()
    };
  }

  /**
   * Capture pseudo-element (::before or ::after) styles
   */
  capturePseudoElement(element, pseudo) {
    try {
      const styles = window.getComputedStyle(element, pseudo);
      const content = styles.content;

      // If no content or content is 'none', pseudo-element doesn't exist
      if (!content || content === 'none' || content === '""' || content === "''") {
        return null;
      }

      return {
        content: content,
        display: styles.display,
        width: styles.width,
        height: styles.height,
        position: styles.position,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        margin: styles.margin,
        padding: styles.padding,
        // Useful for icon fonts
        fontFamily: styles.fontFamily
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate CSS selector specificity (a, b, c) -> number
   * IDs = 100, Classes/Attributes = 10, Elements = 1
   */
  calculateSpecificity(selector) {
    try {
      let a = 0, b = 0, c = 0;

      // Count IDs
      a = (selector.match(/#/g) || []).length;

      // Count classes, attributes, pseudo-classes
      b = (selector.match(/\./g) || []).length;
      b += (selector.match(/\[/g) || []).length;
      b += (selector.match(/:/g) || []).length;

      // Count elements
      const elements = selector.replace(/[#.\[:\]]/g, ' ').split(/\s+/).filter(e => e && e !== '>' && e !== '+' && e !== '~');
      c = elements.length;

      return a * 100 + b * 10 + c;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate basic selector for an element
   */
  generateBasicSelector(element) {
    // Prefer ID
    if (element.id) {
      return `#${element.id}`;
    }

    // Use classes
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList)
      .filter(c => !c.match(/^(active|hover|focus|selected)/) && c.length < 30)
      .slice(0, 2)
      .join('.');

    if (classes) {
      return `${tag}.${classes}`;
    }

    return tag;
  }

  async capturePageData(options = {}) {
    try {
      console.log('🔍 Page capture starting with options:', options);

      // Use intelligent context builder for better AI performance
      const contextBuilder = new ContextBuilder();

      // Determine root element for scoping database capture
      let rootElement = null;
      let selectedElement = null;

      if (options.rootElementSelector) {
        // NEW: Root element scopes the entire database capture
        rootElement = document.querySelector(options.rootElementSelector);
        if (!rootElement) {
          console.warn(`⚠️ Could not find root element with selector: ${options.rootElementSelector}`);
        } else {
          console.log('✓ Found root element for scoped capture:', rootElement.tagName, rootElement.id || rootElement.className);
        }
      }

      if (options.selectedElementSelector) {
        // LEGACY: Selected element for focused context mode
        selectedElement = document.querySelector(options.selectedElementSelector);
        if (!selectedElement) {
          console.warn(`⚠️ Could not find element with selector: ${options.selectedElementSelector}`);
        } else {
          console.log('✓ Found selected element:', selectedElement);
        }
      }

      const context = contextBuilder.buildContext(selectedElement, {
        rootElement: rootElement, // Pass root element for scoping
        includeScreenshot: false, // Screenshot handled separately
        maxProximityElements: options.maxProximityElements || 8,
        maxStructureElements: options.maxStructureElements || 12,
        proximityRadius: options.proximityRadius || 300
      });

      const pageData = {
        url: window.location.href,
        title: document.title,

        // NEW: Hierarchical context (replaces elementDatabase)
        context: context,

        // LEGACY: Keep elementDatabase for backward compatibility
        elementDatabase: this.convertContextToLegacyFormat(context),

        viewport: this.getViewportInfo(),
        timestamp: Date.now(),

        // Deprecated fields (keep for compatibility)
        html: null,
        css: null,
        elements: null
      };

      console.log('📦 Page data captured:', {
        mode: context.mode,
        primary: context.primary.length,
        proximity: context.proximity.length,
        structure: context.structure.length,
        tokens: context.metadata.estimatedTokens
      });

      return pageData;
    } catch (error) {
      console.error('Page capture failed:', error);
      throw error;
    }
  }

  /**
   * Convert new hierarchical context to legacy elementDatabase format
   * for backward compatibility
   */
  convertContextToLegacyFormat(context) {
    const elements = [];

    // Combine all levels into a flat array
    [...context.primary, ...context.proximity, ...context.structure].forEach(el => {
      elements.push({
        id: `el_${String(elements.length).padStart(3, '0')}`,
        selector: el.selector,
        type: el.tag,
        text: el.text || '',
        visual: el.visual || {},
        context: el.context || {},
        level: el.level // Preserve level information
      });
    });

    return {
      elements: elements,
      metadata: context.metadata
    };
  }

  getCleanHTML() {
    // Create a clone of the document to clean it up
    const clone = document.cloneNode(true);
    
    // Remove script tags to avoid potential issues
    const scripts = clone.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove chrome extension elements
    const extensionElements = clone.querySelectorAll('[id*="chrome-extension"], [class*="chrome-extension"]');
    extensionElements.forEach(el => el.remove());

    // Clean up inline event handlers
    this.removeInlineEvents(clone);

    return clone.documentElement.outerHTML;
  }

  removeInlineEvents(element) {
    const eventAttributes = [
      'onclick', 'onmouseover', 'onmouseout', 'onmousedown', 'onmouseup',
      'onkeydown', 'onkeyup', 'onkeypress', 'onsubmit', 'onchange',
      'onfocus', 'onblur', 'onload', 'onerror'
    ];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    const elements = [];
    let node;
    while (node = walker.nextNode()) {
      elements.push(node);
    }

    elements.forEach(el => {
      eventAttributes.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });
    });
  }

  extractCSS() {
    let allCSS = '';

    try {
      // Extract from stylesheets
      for (let i = 0; i < document.styleSheets.length; i++) {
        const styleSheet = document.styleSheets[i];
        
        try {
          const rules = styleSheet.cssRules || styleSheet.rules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j];
              if (rule.cssText) {
                allCSS += rule.cssText + '\n';
              }
            }
          }
        } catch (e) {
          // Handle CORS restrictions on external stylesheets
          console.warn('Cannot access stylesheet:', styleSheet.href, e);
          
          // Try to get href for external stylesheets
          if (styleSheet.href) {
            allCSS += `/* External stylesheet: ${styleSheet.href} */\n`;
          }
        }
      }

      // Extract inline styles and generate CSS rules
      const elementsWithStyle = document.querySelectorAll('[style]');
      elementsWithStyle.forEach(element => {
        const selector = this.generateUniqueSelector(element);
        const styles = element.style.cssText;
        if (styles) {
          allCSS += `${selector} { ${styles} }\n`;
        }
      });

      // Extract computed styles for important elements
      const importantElements = document.querySelectorAll('button, a, input, .btn, .button, [role="button"]');
      importantElements.forEach(element => {
        const computedStyles = window.getComputedStyle(element);
        const selector = this.generateUniqueSelector(element);
        
        // Extract key visual properties
        const keyProperties = [
          'color', 'background-color', 'border', 'font-size', 'font-weight',
          'padding', 'margin', 'width', 'height', 'display', 'position'
        ];
        
        let elementCSS = '';
        keyProperties.forEach(prop => {
          const value = computedStyles.getPropertyValue(prop);
          if (value && value !== 'initial' && value !== 'normal') {
            elementCSS += `  ${prop}: ${value};\n`;
          }
        });
        
        if (elementCSS) {
          allCSS += `/* Computed styles for ${selector} */\n${selector} {\n${elementCSS}}\n\n`;
        }
      });

    } catch (error) {
      console.error('CSS extraction failed:', error);
    }

    return allCSS;
  }

  // Helper function to escape special characters in CSS selectors
  escapeCSSIdentifier(str) {
    // Escape special CSS characters: !"#$%&'()*+,./:;<=>?@[\]^`{|}~
    // Also handle leading digits
    if (!str) return '';

    // CSS.escape is the standard way, but fallback for older browsers
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(str);
    }

    // Manual fallback
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~])/g, '\\$1');
  }

  generateUniqueSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${this.escapeCSSIdentifier(element.id)}`;
    }

    // Try unique class combination (prefer simpler selectors)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(cls => cls.length > 0);
      if (classes.length > 0) {
        // Escape each class name
        const escapedClasses = classes.map(cls => this.escapeCSSIdentifier(cls));

        // Try single class first, then progressively more specific
        for (let i = 1; i <= Math.min(escapedClasses.length, 3); i++) {
          const classSelector = element.tagName.toLowerCase() + '.' + escapedClasses.slice(0, i).join('.');
          try {
            const matchingElements = document.querySelectorAll(classSelector);
            if (matchingElements.length <= 3 && matchingElements.length > 0) {
              return classSelector;
            }
          } catch (e) {
            // If selector is still invalid, skip to next
            continue;
          }
        }

        // Fallback to all classes if needed
        const fullClassSelector = `.${escapedClasses.join('.')}`;
        try {
          const matchingElements = document.querySelectorAll(fullClassSelector);
          if (matchingElements.length <= 5) {
            return fullClassSelector;
          }
        } catch (e) {
          // Invalid selector, fall through to path-based
        }
      }
    }

    // Generate path-based selector
    const path = [];
    let currentElement = element;

    while (currentElement && currentElement !== document.body) {
      let selector = currentElement.tagName.toLowerCase();

      if (currentElement.id) {
        selector += `#${this.escapeCSSIdentifier(currentElement.id)}`;
        path.unshift(selector);
        break;
      }

      if (currentElement.className && typeof currentElement.className === 'string') {
        const classes = currentElement.className.trim().split(/\s+/);
        if (classes.length > 0 && classes[0]) {
          selector += `.${this.escapeCSSIdentifier(classes[0])}`;
        }
      }

      // Add nth-child if there are siblings
      const siblings = Array.from(currentElement.parentNode?.children || []);
      const sameTagSiblings = siblings.filter(sibling => sibling.tagName === currentElement.tagName);

      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(currentElement) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      currentElement = currentElement.parentElement;
    }

    return path.slice(-3).join(' > '); // Use last 3 elements to avoid overly long selectors
  }

  getViewportInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent
    };
  }

  analyzeElements() {
    const analysis = {
      buttons: [],
      links: [],
      forms: [],
      images: [],
      text: []
    };

    // Analyze buttons and CTAs
    const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], .btn, .button');
    buttons.forEach(button => {
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) { // Only visible elements
        analysis.buttons.push({
          selector: this.generateUniqueSelector(button),
          text: button.textContent?.trim() || button.value || '',
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: this.getElementStyles(button),
          attributes: this.getElementAttributes(button)
        });
      }
    });

    // Analyze links
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      const rect = link.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        analysis.links.push({
          selector: this.generateUniqueSelector(link),
          text: link.textContent?.trim() || '',
          href: link.href,
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: this.getElementStyles(link)
        });
      }
    });

    // Analyze forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      const inputs = form.querySelectorAll('input, textarea, select');
      analysis.forms.push({
        selector: this.generateUniqueSelector(form),
        action: form.action,
        method: form.method,
        inputs: Array.from(inputs).map(input => ({
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
          selector: this.generateUniqueSelector(input)
        }))
      });
    });

    // Analyze key text elements
    const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p');
    textElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text && text.length > 10) { // Only meaningful text
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          analysis.text.push({
            selector: this.generateUniqueSelector(element),
            tagName: element.tagName.toLowerCase(),
            text: text.substring(0, 200), // Limit text length
            position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            styles: this.getElementStyles(element)
          });
        }
      }
    });

    return analysis;
  }

  getElementStyles(element) {
    const computedStyles = window.getComputedStyle(element);
    return {
      color: computedStyles.color,
      backgroundColor: computedStyles.backgroundColor,
      fontSize: computedStyles.fontSize,
      fontWeight: computedStyles.fontWeight,
      padding: computedStyles.padding,
      margin: computedStyles.margin,
      border: computedStyles.border,
      borderRadius: computedStyles.borderRadius,
      display: computedStyles.display,
      position: computedStyles.position
    };
  }

  getElementAttributes(element) {
    const attributes = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (!attr.name.startsWith('on')) { // Skip event handlers
        attributes[attr.name] = attr.value;
      }
    }
    return attributes;
  }

  // ============================================
  // NEW: Element Database Builder
  // ============================================
  buildElementDatabase() {
    console.log('🔍 Building Element Database...');
    
    const database = {
      elements: [],
      metadata: {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
        totalElements: 0,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    };
    
    let elementId = 0;

    // Priority selectors to capture
    const prioritySelectors = [
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[onclick]',
      '.btn, .button, [class*="cta"], [class*="CTA"]',
      'h1, h2, h3, h4, h5, h6',
      'form',
      'nav a',
      '[class*="nav"]',
      'p.lead, p.intro, [class*="hero"]'
    ];

    const seen = new Set();
    
    prioritySelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(element => {
          // Skip if already processed or not visible
          if (seen.has(element)) return;
          if (!element.offsetParent && element.tagName.toLowerCase() !== 'option') return;
          
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          
          seen.add(element);
          
          const computed = window.getComputedStyle(element);
          const text = element.textContent?.trim() || '';
          const tag = element.tagName.toLowerCase();
          
          // Skip elements with too much text (likely containers)
          if (text.length > 500 && !['h1', 'h2', 'h3'].includes(tag)) return;
          
          const elementData = {
            id: `el_${String(elementId++).padStart(3, '0')}`,
            selector: this.generateUniqueSelector(element),
            alternativeSelectors: this.generateAlternatives(element),
            
            type: tag,
            text: text.substring(0, 150),
            ariaLabel: element.getAttribute('aria-label') || null,
            placeholder: element.getAttribute('placeholder') || null,
            title: element.getAttribute('title') || null,
            
            visual: {
              position: {
                x: Math.round(rect.x + window.scrollX),
                y: Math.round(rect.y + window.scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              isVisible: rect.width > 0 && rect.height > 0,
              isAboveFold: rect.top < window.innerHeight,
              color: computed.color,
              backgroundColor: computed.backgroundColor,
              fontSize: computed.fontSize,
              fontWeight: computed.fontWeight,
              borderRadius: computed.borderRadius,
              display: computed.display
            },
            
            context: {
              section: this.findSection(element),
              parentTag: element.parentElement?.tagName.toLowerCase(),
              parentClass: element.parentElement?.className || null,
              nearbyText: this.getNearbyText(element),
              siblings: element.parentElement?.children.length || 0,
              depth: this.getDepth(element)
            },
            
            attributes: {
              id: element.id || null,
              name: element.getAttribute('name') || null,
              href: element.getAttribute('href') || null,
              type: element.getAttribute('type') || null,
              value: element.value || null
            },
            
            metadata: {
              interactive: ['button', 'a', 'input', 'textarea', 'select'].includes(tag),
              hasClickHandler: element.onclick !== null || element.hasAttribute('onclick'),
              importance: this.calculateImportance(element, computed),
              category: this.categorizeElement(element),
              timestamp: Date.now()
            }
          };
          
          database.elements.push(elementData);
        });
      } catch (error) {
        console.warn('Error processing selector:', selector, error);
      }
    });

    // Sort by importance
    database.elements.sort((a, b) => b.metadata.importance - a.metadata.importance);
    
    database.metadata.totalElements = database.elements.length;

    console.log(`✅ Element Database built: ${database.elements.length} elements`);

    // ✨ NEW: Validate all selectors before returning
    const validator = new SelectorValidator();
    const validatedDatabase = validator.validateElementDatabase(database);

    // Filter to high-confidence selectors (0.7+)
    const highConfidenceDatabase = validator.filterHighConfidence(validatedDatabase, 0.7);

    return highConfidenceDatabase;
  }

  generateAlternatives(element) {
    const alternatives = [];
    
    // ID selector (highest priority)
    if (element.id) {
      alternatives.push(`#${element.id}`);
    }
    
    // Single class selectors (more robust)
    if (element.className && typeof element.className === 'string') {
      const classes = Array.from(element.classList).slice(0, 2);
      classes.forEach(cls => {
        if (cls && cls.length > 2) { // Skip very short classes
          alternatives.push(element.tagName.toLowerCase() + '.' + cls);
        }
      });
    }
    
    // Attribute-based selectors
    const name = element.getAttribute('name');
    if (name) {
      alternatives.push(`[name="${name}"]`);
    }
    
    const type = element.getAttribute('type');
    if (type) {
      alternatives.push(`${element.tagName.toLowerCase()}[type="${type}"]`);
    }
    
    const dataAttr = Array.from(element.attributes)
      .find(attr => attr.name.startsWith('data-') && attr.value);
    if (dataAttr) {
      alternatives.push(`[${dataAttr.name}="${dataAttr.value}"]`);
    }
    
    return [...new Set(alternatives)].slice(0, 4);
  }

  findSection(element) {
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName?.toLowerCase();
      if (['header', 'nav', 'main', 'footer', 'aside', 'section'].includes(tag)) {
        return tag;
      }

      const rawId = current.id;
      const id = typeof rawId === 'string'
        ? rawId.toLowerCase()
        : (rawId?.baseVal ? String(rawId.baseVal).toLowerCase() : '');
      if (id && (id.includes('header') || id.includes('nav') || id.includes('hero') || 
                 id.includes('footer') || id.includes('main'))) {
        return id;
      }

      const rawClassName = current.className;
      const className = typeof rawClassName === 'string'
        ? rawClassName.toLowerCase()
        : (typeof rawClassName?.baseVal === 'string'
            ? rawClassName.baseVal.toLowerCase()
            : '');
      if (className && (className.includes('header') || className.includes('hero') || 
                        className.includes('nav') || className.includes('footer'))) {
        const match = className.match(/(header|hero|nav|footer|main)/);
        return match ? match[1] : 'body';
      }

      current = current.parentElement;
    }
    return 'body';
  }

  getNearbyText(element) {
    const nearby = [];
    const parent = element.parentElement;
    
    if (parent) {
      // Get text from siblings
      Array.from(parent.children).forEach(child => {
        if (child !== element) {
          const text = child.textContent?.trim().substring(0, 50);
          if (text && text.length > 5) {
            nearby.push(text);
          }
        }
      });
      
      // Get text from parent
      const parentText = parent.textContent?.trim().substring(0, 100);
      const elementText = element.textContent?.trim() || '';
      if (parentText && parentText !== elementText) {
        const context = parentText.replace(elementText, '').trim().substring(0, 50);
        if (context && context.length > 5) {
          nearby.unshift(context);
        }
      }
    }
    
    return nearby.slice(0, 3);
  }

  calculateImportance(element, computed) {
    let score = 0;
    
    // Size
    const rect = element.getBoundingClientRect();
    if (rect.width > 150 || rect.height > 40) score += 2;
    if (rect.width > 200 || rect.height > 50) score += 2;
    
    // Position (above the fold is more important)
    if (rect.top < window.innerHeight) score += 3;
    if (rect.top < window.innerHeight / 2) score += 2;
    
    // Styling
    const bgColor = computed.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      score += 2;
    }
    
    const fontSize = parseInt(computed.fontSize);
    if (fontSize > 16) score += 1;
    if (fontSize > 20) score += 1;
    
    // Element type
    const tag = element.tagName.toLowerCase();
    if (tag === 'button') score += 3;
    if (tag === 'a' && element.href) score += 2;
    
    // Classes indicating importance
    const className = element.className?.toLowerCase() || '';
    if (className.includes('cta') || className.includes('primary')) score += 3;
    if (className.includes('btn') || className.includes('button')) score += 2;
    
    return Math.min(10, score);
  }

  categorizeElement(element) {
    const tag = element.tagName.toLowerCase();
    const className = element.className?.toLowerCase() || '';
    const text = element.textContent?.toLowerCase() || '';
    
    if (className.includes('cta') || 
        (tag === 'button' && (className.includes('primary') || className.includes('main')))) {
      return 'cta';
    }
    
    if (tag === 'button' || className.includes('btn') || className.includes('button')) {
      return 'button';
    }
    
    if (tag === 'a' && element.href) {
      if (element.closest('nav')) return 'navigation';
      return 'link';
    }
    
    if (['input', 'textarea', 'select'].includes(tag)) {
      return 'form-field';
    }
    
    if (tag === 'form') {
      return 'form';
    }
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      return 'heading';
    }
    
    if (tag === 'nav' || className.includes('nav')) {
      return 'navigation';
    }
    
    return 'content';
  }

  getDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement && depth < 20) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  // Code injection methods for testing variations
  async previewCode(css, js, variationNumber) {
    console.log(`🧪 Previewing variation ${variationNumber}`);

    // STEP 1: Ensure Cleanup Manager is initialized (runs in MAIN world)
    console.log('🔧 Ensuring Cleanup Manager is initialized...');
    await chrome.runtime.sendMessage({
      type: 'ENSURE_CLEANUP_MANAGER'
    });

    // STEP 2: Use Cleanup Manager for atomic reset (runs in MAIN world)
    console.log('🧹 Performing atomic reset via Cleanup Manager...');
    const resetResponse = await chrome.runtime.sendMessage({
      type: 'RESET_VIA_CLEANUP_MANAGER'
    });

    if (!resetResponse || !resetResponse.success) {
      console.warn('⚠️ Cleanup Manager reset failed, falling back to legacy cleanup');
      this.clearPreviewElements();
      this.clearInjectedAssets('');
    } else {
      console.log(`✅ Cleanup Manager reset complete:`, resetResponse.summary);
    }

    // Wait for cleanup to fully complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // STEP 3: Inject CSS (CSS doesn't have CSP restrictions)
    if (css && css.trim()) {
      // Remove any existing preview CSS first
      const existing = document.getElementById(`convert-preview-css-${variationNumber}`);
      if (existing) {
        console.log(`🗑️ Removing existing preview CSS for variation ${variationNumber}`);
        existing.remove();
      }

      const styleEl = document.createElement('style');
      styleEl.id = `convert-preview-css-${variationNumber}`;
      styleEl.setAttribute('data-convert-preview', 'true');
      styleEl.textContent = css;
      document.head.appendChild(styleEl);

      console.log(`✅ Preview CSS injected for variation ${variationNumber}:`);
      console.log(`   📝 CSS length: ${css.length} characters`);
      console.log(`   📝 CSS preview (first 200 chars):`, css.substring(0, 200));
      console.log(`   🎯 Style element ID: ${styleEl.id}`);
      console.log(`   📍 Style element in DOM:`, !!document.getElementById(styleEl.id));

      // Verify the CSS is actually in the DOM
      setTimeout(() => {
        const check = document.getElementById(`convert-preview-css-${variationNumber}`);
        if (check) {
          console.log(`✅ CSS still in DOM after 100ms, styles should be applied`);
        } else {
          console.error(`❌ CSS was removed from DOM! Something cleaned it up.`);
        }
      }, 100);
    }

    // STEP 4: Execute JavaScript via service worker (bypasses CSP)
    if (js && js.trim()) {
      console.log(`📤 Sending JS to service worker for CSP-safe execution...`);

      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_PREVIEW_JS',
        js: js,
        variationNumber: variationNumber
      });

      if (response && response.success) {
        console.log(`✅ Preview JS executed via service worker for variation ${variationNumber}`);

        // Wait for async JS code to complete (e.g., whenReady callbacks, setTimeout delays)
        // This ensures DOM modifications from the JS have time to execute
        console.log('⏳ Waiting for async JS operations to complete...');
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log('✅ Async JS operations should be complete');
      } else {
        console.error(`❌ Preview JS execution failed:`, response?.error);
        throw new Error(response?.error || 'JS execution failed');
      }
    }
  }

  async testCode(css, js, variationNumber) {
    console.log(`🚀 Testing variation ${variationNumber} on page`);
    
    // Clear any existing test elements for this variation
    this.clearTestElements(variationNumber);
    
    // Inject CSS
    if (css && css.trim()) {
      const styleEl = document.createElement('style');
      styleEl.id = `convert-test-css-${variationNumber}`;
      styleEl.setAttribute('data-convert-test', variationNumber);
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
      console.log(`✅ Test CSS injected for variation ${variationNumber}`);
    }
    
    // JS is now handled by background service worker using chrome.scripting.executeScript()
    // to avoid CSP violations with inline scripts
    if (js && js.trim()) {
      console.log(`✅ JS will be executed by service worker for test ${variationNumber}`);
    }
  }

  async clearPreview() {
    console.log('🧹 Clearing preview elements');
    this.clearPreviewElements();
  }

  clearPreviewElements() {
    console.log('🧹 [LEGACY] Starting fallback preview element cleanup...');
    console.log('⚠️ This should only run if Cleanup Manager failed');

    // Remove all preview elements (styles, scripts)
    const previewElements = document.querySelectorAll('[data-convert-preview]');
    console.log(`🧹 Removing ${previewElements.length} preview elements with [data-convert-preview]`);
    previewElements.forEach(el => el.remove());

    // Reset all data-var-applied flags (idempotency checks)
    const flaggedElements = document.querySelectorAll('[data-var-applied]');
    console.log(`🧹 Resetting ${flaggedElements.length} elements with data-var-applied flags`);
    flaggedElements.forEach(el => {
      delete el.dataset.varApplied;
    });

    console.log('✅ [LEGACY] Preview elements cleared (limited cleanup)');
    console.log('⚠️ NOTE: Intervals are NOT cleared in legacy mode - reload page if issues persist');
  }

  clearTestElements(variationNumber) {
    // Remove test elements for specific variation
    if (variationNumber) {
      document.querySelectorAll(`[data-convert-test="${variationNumber}"]`).forEach(el => el.remove());
    } else {
      // Remove all test elements
      document.querySelectorAll('[data-convert-test]').forEach(el => el.remove());
    }
  }

  checkPageErrors(variationNumber) {
    const errors = [];
    
    // Check for JavaScript console errors
    // Note: In a real implementation, you'd need to capture these during injection
    
    // Check for broken elements after injection
    const testElements = document.querySelectorAll(`[data-convert-test="${variationNumber}"]`);
    
    testElements.forEach((element, index) => {
      if (element.tagName === 'SCRIPT') {
        // Check if script element has any obvious issues
        if (!element.textContent && !element.src) {
          errors.push(`Empty script element ${index + 1}`);
        }
      }
      
      if (element.tagName === 'STYLE') {
        // Check if style element is properly attached
        if (!document.head.contains(element) && !document.body.contains(element)) {
          errors.push(`Detached style element ${index + 1}`);
        }
      }
    });
    
    // Check for missing target elements (if selectors are used in JS)
    const scriptElements = document.querySelectorAll(`script[data-convert-test="${variationNumber}"]`);
    scriptElements.forEach((script, index) => {
      const scriptContent = script.textContent || '';
      
      // Look for querySelector calls
      const selectorMatches = scriptContent.match(/querySelector\(['"`]([^'"`]+)['"`]\)/g);
      if (selectorMatches) {
        selectorMatches.forEach(match => {
          const selector = match.match(/querySelector\(['"`]([^'"`]+)['"`]\)/)[1];
          try {
            const element = document.querySelector(selector);
            if (!element) {
              errors.push(`Selector '${selector}' not found on page`);
            }
          } catch (e) {
            errors.push(`Invalid selector '${selector}': ${e.message}`);
          }
        });
      }
    });
    
    return {
      hasErrors: errors.length > 0,
      errors: errors
    };
  }
}

// Initialize page capture
const pageCapture = new PageCapture();

// Export for potential use by other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageCapture;
}
