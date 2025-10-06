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
        this.capturePageData()
          .then(data => sendResponse({ success: true, data }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
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
          const result = this.applyVariation(payload);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return false; // Synchronous response
      }
    });

    this.isInitialized = true;
  }

  clearInjectedAssets(prefix) {
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
  }

  applyVariation({ css, js, key }) {
    const variationKey = key || `convert-ai-${Date.now()}`;
    try {
      this.clearInjectedAssets(variationKey);

      if (css) {
        // Clean CSS: remove comments and extra whitespace
        const cleanCSS = css
          .replace(/\/\/.*$/gm, '')           // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
          .replace(/\n\s*\n/g, '\n')          // Remove empty lines
          .trim();
        
        const style = document.createElement('style');
        style.dataset.convertAiStyle = variationKey;
        style.textContent = cleanCSS;
        document.head.appendChild(style);
        
        // Clean CSS and debug selector matching
        let debugCSS = css.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const cssRules = debugCSS.match(/([^{]+)\s*{/g);
        if (cssRules) {
          cssRules.forEach(rule => {
            const selector = rule.replace('{', '').trim();
            try {
              const matchingElements = document.querySelectorAll(selector);
              const firstElement = matchingElements[0];
              const computedStyle = firstElement ? window.getComputedStyle(firstElement) : null;
              
              console.log(`[Convert CSS Debug] Selector "${selector}" matches ${matchingElements.length} elements`, {
                selector,
                matchCount: matchingElements.length,
                elements: Array.from(matchingElements).slice(0, 3).map(el => ({
                  tagName: el.tagName,
                  classes: el.className,
                  id: el.id,
                  text: el.textContent?.substring(0, 50),
                  currentBackgroundColor: window.getComputedStyle(el).backgroundColor
                })),
                firstElementCurrentBg: computedStyle?.backgroundColor,
                expectedChange: 'Should change to red'
              });
            } catch (e) {
              console.error(`[Convert CSS Debug] Invalid selector "${selector}":`, e.message);
            }
          });
        }
        
        console.log('[Convert Variation] CSS applied', {
          key: variationKey,
          length: css.length,
          totalStyles: document.querySelectorAll('[data-convert-ai-style]').length,
          cssContent: css
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
        styleCount: document.querySelectorAll('[data-convert-ai-style]').length
      };
    } catch (error) {
      console.error('[Convert Variation] CSS injection failed', {
        key: variationKey,
        error: error?.message,
        stack: error?.stack
      });
      return { success: false, error: error.message };
    }
  }

  async capturePageData() {
    try {
      // Build element database - this is the NEW approach!
      const elementDatabase = this.buildElementDatabase();
      
      const pageData = {
        url: window.location.href,
        title: document.title,
        elementDatabase: elementDatabase, // NEW: Structured element data
        viewport: this.getViewportInfo(),
        timestamp: Date.now(),
        
        // Keep for backwards compatibility (deprecated)
        html: null,
        css: null,
        elements: null
      };

      return pageData;
    } catch (error) {
      console.error('Page capture failed:', error);
      throw error;
    }
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

  generateUniqueSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try unique class combination (prefer simpler selectors)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(cls => cls.length > 0);
      if (classes.length > 0) {
        // Try single class first, then progressively more specific
        for (let i = 1; i <= Math.min(classes.length, 3); i++) {
          const classSelector = element.tagName.toLowerCase() + '.' + classes.slice(0, i).join('.');
          const matchingElements = document.querySelectorAll(classSelector);
          if (matchingElements.length <= 3 && matchingElements.length > 0) {
            return classSelector;
          }
        }
        
        // Fallback to all classes if needed
        const fullClassSelector = `.${classes.join('.')}`;
        const matchingElements = document.querySelectorAll(fullClassSelector);
        if (matchingElements.length <= 5) {
          return fullClassSelector;
        }
      }
    }

    // Generate path-based selector
    const path = [];
    let currentElement = element;
    
    while (currentElement && currentElement !== document.body) {
      let selector = currentElement.tagName.toLowerCase();
      
      if (currentElement.id) {
        selector += `#${currentElement.id}`;
        path.unshift(selector);
        break;
      }
      
      if (currentElement.className && typeof currentElement.className === 'string') {
        const classes = currentElement.className.trim().split(/\s+/);
        if (classes.length > 0) {
          selector += `.${classes[0]}`;
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
    
    return database;
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
}

// Initialize page capture
const pageCapture = new PageCapture();

// Export for potential use by other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageCapture;
}
