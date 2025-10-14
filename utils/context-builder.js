// Context Builder - Intelligent page context extraction for AI
// Hierarchical approach: Primary targets → Proximity context → Page structure

class ContextBuilder {
  constructor() {
    this.maxTokens = 8000; // Conservative limit for prompts
    this.charsPerToken = 4; // Rough estimate
  }

  /**
   * Build hierarchical context based on capture mode
   * @param {Element|null} selectedElement - User-selected element (null for full page)
   * @param {Object} options - { rootElement, includeScreenshot, maxProximityElements, maxStructureElements }
   */
  buildContext(selectedElement = null, options = {}) {
    const defaults = {
      rootElement: null, // NEW: Scope all queries to this element
      includeScreenshot: true,
      maxProximityElements: 8,
      maxStructureElements: 12,
      proximityRadius: 300 // pixels
    };
    const opts = { ...defaults, ...options };

    const context = {
      mode: selectedElement ? 'element-focused' : (opts.rootElement ? 'scoped' : 'full-page'),
      primary: [],
      proximity: [],
      structure: [],
      metadata: this.captureMetadata()
    };

    // If rootElement is provided, scope ALL queries to that element
    const queryRoot = opts.rootElement || document;

    if (selectedElement) {
      // ELEMENT-FOCUSED MODE
      context.primary = [this.captureElementFull(selectedElement)];
      context.proximity = this.captureProximityElements(selectedElement, opts.proximityRadius, opts.maxProximityElements);
      context.structure = this.capturePageStructure(opts.maxStructureElements, queryRoot);
      context.metadata.focusPath = this.getElementPath(selectedElement);
    } else {
      // FULL-PAGE MODE (or SCOPED if rootElement provided)
      context.primary = this.captureTopInteractiveElements(15, queryRoot); // Top 15 interactive elements
      context.proximity = []; // Not needed in full page mode
      context.structure = this.capturePageStructure(opts.maxStructureElements, queryRoot);

      if (opts.rootElement) {
        context.metadata.scopedTo = this.generateSelector(opts.rootElement);
        console.log(`🎯 Database scoped to: ${context.metadata.scopedTo}`);
      }
    }

    // Add token usage estimate
    context.metadata.estimatedTokens = this.estimateTokens(context);

    console.log('📦 Context built:', {
      mode: context.mode,
      primary: context.primary.length,
      proximity: context.proximity.length,
      structure: context.structure.length,
      tokens: context.metadata.estimatedTokens
    });

    return context;
  }

  /**
   * Capture FULL detail for primary target element
   */
  captureElementFull(element) {
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);

    return {
      level: 'primary',
      selector: this.generateSelector(element),
      alternativeSelectors: this.generateAlternativeSelectors(element),

      // Basic info
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().substring(0, 200) || '',
      innerText: element.innerText?.substring(0, 200) || '',

      // HTML structure (limited)
      innerHTML: this.sanitizeHTML(element.innerHTML).substring(0, 1000),
      outerHTML: this.sanitizeHTML(element.outerHTML).substring(0, 1500),

      // Attributes
      attributes: this.extractAttributes(element),

      // Visual properties
      visual: {
        position: {
          x: Math.round(rect.x + window.scrollX),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        isAboveFold: rect.top < window.innerHeight,
        computedStyles: this.extractKeyStyles(computed)
      },

      // Context
      context: {
        parent: this.captureElementLight(element.parentElement),
        section: this.findSection(element),
        path: this.getElementPath(element),
        nearbyText: this.getNearbyText(element, 100)
      }
    };
  }

  /**
   * Capture MEDIUM detail for proximity elements (parent, siblings, nearby)
   */
  captureProximityElements(targetElement, radius, maxCount) {
    const targetRect = targetElement.getBoundingClientRect();
    const proximityElements = [];
    const seen = new Set([targetElement]);

    // 1. Parent chain (up to 3 levels)
    let parent = targetElement.parentElement;
    let parentLevel = 0;
    while (parent && parentLevel < 3 && parent.tagName.toLowerCase() !== 'body') {
      if (!seen.has(parent)) {
        seen.add(parent);
        proximityElements.push({
          ...this.captureElementMedium(parent),
          proximityType: 'parent',
          parentLevel: parentLevel
        });
      }
      parent = parent.parentElement;
      parentLevel++;
    }

    // 2. Direct siblings
    if (targetElement.parentElement) {
      Array.from(targetElement.parentElement.children).forEach(sibling => {
        if (!seen.has(sibling) && sibling !== targetElement) {
          seen.add(sibling);
          proximityElements.push({
            ...this.captureElementMedium(sibling),
            proximityType: 'sibling'
          });
        }
      });
    }

    // 3. Spatial proximity (within radius pixels)
    const allElements = document.querySelectorAll('button, a, h1, h2, h3, input, [class*="cta"]');
    allElements.forEach(el => {
      if (seen.has(el) || proximityElements.length >= maxCount) return;

      const rect = el.getBoundingClientRect();
      const distance = this.calculateDistance(targetRect, rect);

      if (distance < radius && distance > 0) {
        seen.add(el);
        proximityElements.push({
          ...this.captureElementMedium(el),
          proximityType: 'nearby',
          distance: Math.round(distance)
        });
      }
    });

    // Sort by relevance: parents first, then siblings, then by proximity
    proximityElements.sort((a, b) => {
      const typeOrder = { parent: 0, sibling: 1, nearby: 2 };
      if (typeOrder[a.proximityType] !== typeOrder[b.proximityType]) {
        return typeOrder[a.proximityType] - typeOrder[b.proximityType];
      }
      return (a.distance || 0) - (b.distance || 0);
    });

    return proximityElements.slice(0, maxCount);
  }

  /**
   * Capture MEDIUM detail for element
   */
  captureElementMedium(element) {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);

    return {
      level: 'proximity',
      selector: this.generateSelector(element),
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().substring(0, 100) || '',
      classes: Array.from(element.classList),
      id: element.id || null,

      visual: {
        dimensions: {
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y)
        },
        styles: {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          fontSize: computed.fontSize,
          display: computed.display
        }
      }
    };
  }

  /**
   * Capture LOW detail for page structure (landmarks)
   * @param {number} maxCount - Maximum number of elements to capture
   * @param {Element|Document} queryRoot - Root element to scope queries (default: document)
   */
  capturePageStructure(maxCount, queryRoot = document) {
    const structure = [];

    // Semantic landmarks
    const landmarks = [
      { selector: 'header', role: 'header' },
      { selector: 'nav', role: 'navigation' },
      { selector: 'main', role: 'main' },
      { selector: 'aside', role: 'sidebar' },
      { selector: 'footer', role: 'footer' },
      { selector: 'article', role: 'article' },
      { selector: 'section', role: 'section' },
      { selector: '[role="banner"]', role: 'banner' },
      { selector: '[role="navigation"]', role: 'navigation' },
      { selector: '[role="main"]', role: 'main' }
    ];

    landmarks.forEach(({ selector, role }) => {
      queryRoot.querySelectorAll(selector).forEach((el, index) => {
        if (structure.length >= maxCount) return;

        structure.push(this.captureElementLight(el, role, index));
      });
    });

    return structure.slice(0, maxCount);
  }

  /**
   * Capture TOP interactive elements for full page mode
   * @param {number} maxCount - Maximum number of elements to capture
   * @param {Element|Document} queryRoot - Root element to scope queries (default: document)
   */
  captureTopInteractiveElements(maxCount, queryRoot = document) {
    const interactiveSelectors = [
      'button',
      'a[href]',
      'input[type="submit"]',
      'input[type="button"]',
      '[role="button"]',
      '[class*="btn"]',
      '[class*="cta"]'
    ];

    const elements = [];
    const seen = new Set();

    interactiveSelectors.forEach(selector => {
      queryRoot.querySelectorAll(selector).forEach(el => {
        if (seen.has(el) || elements.length >= maxCount) return;
        if (!el.offsetParent) return; // Skip hidden

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        seen.add(el);
        elements.push({
          ...this.captureElementMedium(el),
          level: 'primary',
          importance: this.calculateImportance(el)
        });
      });
    });

    // Sort by importance
    elements.sort((a, b) => b.importance - a.importance);

    const result = elements.slice(0, maxCount);
    console.log(`📦 Captured ${result.length} interactive elements from ${queryRoot === document ? 'document' : 'scoped root'}`);

    return result;
  }

  /**
   * Capture LIGHT detail for structure/reference
   */
  captureElementLight(element, role = null, index = 0) {
    if (!element) return null;

    return {
      level: 'structure',
      selector: this.generateSelector(element),
      tag: element.tagName.toLowerCase(),
      role: role || element.getAttribute('role') || null,
      id: element.id || null,
      classes: Array.from(element.classList).slice(0, 3),
      index: index
    };
  }

  /**
   * Extract key CSS properties
   */
  extractKeyStyles(computed) {
    return {
      // Layout
      display: computed.display,
      position: computed.position,

      // Box model
      width: computed.width,
      height: computed.height,
      padding: computed.padding,
      margin: computed.margin,

      // Visual
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      border: computed.border,
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,

      // Typography
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontFamily: computed.fontFamily,
      lineHeight: computed.lineHeight,
      textAlign: computed.textAlign
    };
  }

  /**
   * Helper to escape CSS identifiers
   */
  escapeCSSIdentifier(str) {
    if (!str) return '';
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(str);
    }
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~])/g, '\\$1');
  }

  /**
   * Generate reliable CSS selector
   */
  generateSelector(element) {
    // ID is most reliable
    if (element.id) {
      return `#${this.escapeCSSIdentifier(element.id)}`;
    }

    // Try to build from classes and tag
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList)
      .filter(c => !c.match(/^(active|hover|focus|selected|js-)/) && c.length < 30)
      .slice(0, 3) // Use up to 3 classes for better specificity
      .map(c => this.escapeCSSIdentifier(c))
      .join('.');

    if (classes) {
      const selector = `${tag}.${classes}`;
      try {
        // Verify uniqueness - MUST be exactly 1 match
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) {
          return selector;
        }

        // If not unique, try adding more context or use nth-child
        console.log(`⚠️ Selector "${selector}" matches ${matches.length} elements - using nth-child for uniqueness`);
      } catch (e) {
        // Invalid selector, fall through to nth-child
      }
    }

    // Fall back to nth-child for guaranteed uniqueness
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = this.generateSelector(parent);
      return `${parentSelector} > ${tag}:nth-child(${index})`;
    }

    return tag;
  }

  /**
   * Generate alternative selectors for reliability
   */
  generateAlternativeSelectors(element) {
    const alternatives = [];

    // By ID
    if (element.id) alternatives.push(`#${this.escapeCSSIdentifier(element.id)}`);

    // By test ID
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
    if (testId) alternatives.push(`[data-testid="${testId}"]`);

    // By aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) alternatives.push(`[aria-label="${ariaLabel}"]`);

    // By unique class combination
    const uniqueClass = Array.from(element.classList).find(c => {
      try {
        return document.querySelectorAll(`.${this.escapeCSSIdentifier(c)}`).length === 1;
      } catch (e) {
        return false;
      }
    });
    if (uniqueClass) alternatives.push(`.${this.escapeCSSIdentifier(uniqueClass)}`);

    return alternatives.slice(0, 3);
  }

  /**
   * Calculate distance between two rectangles
   */
  calculateDistance(rect1, rect2) {
    const centerX1 = rect1.x + rect1.width / 2;
    const centerY1 = rect1.y + rect1.height / 2;
    const centerX2 = rect2.x + rect2.width / 2;
    const centerY2 = rect2.y + rect2.height / 2;

    return Math.sqrt(
      Math.pow(centerX2 - centerX1, 2) +
      Math.pow(centerY2 - centerY1, 2)
    );
  }

  /**
   * Calculate element importance (for sorting)
   */
  calculateImportance(element) {
    let score = 0;

    // Above fold = more important
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) score += 10;

    // Larger elements = more important
    const area = rect.width * rect.height;
    score += Math.min(area / 1000, 10);

    // Certain classes = more important
    const classStr = element.className.toLowerCase();
    if (classStr.includes('cta') || classStr.includes('primary')) score += 15;
    if (classStr.includes('hero') || classStr.includes('main')) score += 10;
    if (classStr.includes('btn') || classStr.includes('button')) score += 5;

    // Buttons and links = more important
    const tag = element.tagName.toLowerCase();
    if (tag === 'button') score += 8;
    if (tag === 'a') score += 5;

    return score;
  }

  /**
   * Get element path (breadcrumb)
   */
  getElementPath(element) {
    const path = [];
    let current = element;

    while (current && current.tagName.toLowerCase() !== 'body') {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : '';
      const classes = Array.from(current.classList).slice(0, 2).join('.');

      path.unshift(`${tag}${id}${classes ? '.' + classes : ''}`);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Find semantic section containing element
   */
  findSection(element) {
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      if (['header', 'nav', 'main', 'article', 'section', 'aside', 'footer'].includes(tag)) {
        return {
          tag: tag,
          id: current.id || null,
          classes: Array.from(current.classList).slice(0, 2)
        };
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Extract nearby text for context
   */
  getNearbyText(element, maxLength) {
    const texts = [];

    // Previous sibling text
    let prev = element.previousElementSibling;
    if (prev) texts.push(prev.textContent?.trim().substring(0, 50));

    // Parent text (excluding children)
    if (element.parentElement) {
      const parentText = Array.from(element.parentElement.childNodes)
        .filter(n => n.nodeType === 3) // Text nodes
        .map(n => n.textContent.trim())
        .join(' ')
        .substring(0, 50);
      if (parentText) texts.push(parentText);
    }

    // Next sibling text
    let next = element.nextElementSibling;
    if (next) texts.push(next.textContent?.trim().substring(0, 50));

    return texts.join(' | ').substring(0, maxLength);
  }

  /**
   * Extract element attributes
   */
  extractAttributes(element) {
    const attrs = {};
    ['id', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder', 'aria-label', 'role', 'data-testid'].forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) attrs[attr] = value;
    });
    return attrs;
  }

  /**
   * Sanitize HTML (remove scripts, styles)
   */
  sanitizeHTML(html) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Capture page metadata
   */
  captureMetadata() {
    // Extract color scheme
    const bodyStyles = window.getComputedStyle(document.body);

    // Extract fonts
    const fonts = new Set();
    document.querySelectorAll('*').forEach(el => {
      const font = window.getComputedStyle(el).fontFamily;
      if (font) fonts.add(font.split(',')[0].trim().replace(/['"]/g, ''));
    });

    return {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      colorScheme: {
        background: bodyStyles.backgroundColor,
        text: bodyStyles.color,
        primary: this.extractPrimaryColor()
      },
      fontFamilies: Array.from(fonts).slice(0, 3),
      timestamp: Date.now()
    };
  }

  /**
   * Extract primary brand color (heuristic)
   */
  extractPrimaryColor() {
    // Look for buttons, links
    const candidates = document.querySelectorAll('button, .btn, .button, a[href]');
    const colors = new Map();

    candidates.forEach(el => {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        colors.set(bg, (colors.get(bg) || 0) + 1);
      }
    });

    // Return most common color
    let maxCount = 0;
    let primaryColor = null;
    colors.forEach((count, color) => {
      if (count > maxCount) {
        maxCount = count;
        primaryColor = color;
      }
    });

    return primaryColor;
  }

  /**
   * Estimate token count
   */
  estimateTokens(context) {
    const json = JSON.stringify(context);
    return Math.ceil(json.length / this.charsPerToken);
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ContextBuilder = ContextBuilder;
}
