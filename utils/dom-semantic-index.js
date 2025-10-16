/**
 * DOM Semantic Index - Indexes and semantically searches DOM structure
 *
 * Like Cursor's codebase indexing, but for DOM elements.
 * Enables intelligent element discovery and context-aware editing.
 */
class DOMSemanticIndex {
  constructor() {
    this.elementIndex = new Map();
    this.styleIndex = new Map();
    this.interactionIndex = new Map();
    this.categoryIndex = new Map();
    this.semanticGroups = {};
    this.statistics = {
      totalElements: 0,
      totalStyles: 0,
      indexedAt: null
    };
  }

  /**
   * Index the DOM "codebase" from captured page data
   */
  async indexPage(pageData) {
    console.log('🔍 [DOMIndex] Starting semantic indexing...');
    const startTime = Date.now();

    // Clear previous index
    this.clear();

    // Extract elements from various possible data structures
    let elements = null;

    if (pageData.elements && Array.isArray(pageData.elements)) {
      // Direct elements array
      elements = pageData.elements;
    } else if (pageData.elementDatabase && pageData.elementDatabase.elements) {
      // Element database structure
      elements = pageData.elementDatabase.elements;
    } else if (pageData.context && pageData.context.primary) {
      // Hierarchical context structure - combine all levels
      elements = [
        ...(pageData.context.primary || []),
        ...(pageData.context.proximity || []),
        ...(pageData.context.structure || [])
      ];
    } else {
      console.warn('⚠️ [DOMIndex] No elements found in page data:', {
        hasElements: !!pageData.elements,
        hasElementDatabase: !!pageData.elementDatabase,
        hasContext: !!pageData.context,
        pageDataKeys: Object.keys(pageData)
      });
      elements = [];
    }

    console.log(`📊 [DOMIndex] Found ${elements.length} elements to index`);

    if (elements.length === 0) {
      console.warn('⚠️ [DOMIndex] No elements to index, skipping...');
      this.statistics = {
        totalElements: 0,
        totalStyles: 0,
        indexedAt: Date.now(),
        indexingTime: Date.now() - startTime
      };
      return this.statistics;
    }

    // Index elements by semantic categories
    this.indexBySemantic(elements);

    // Index computed styles
    this.indexStyles(elements);

    // Index interactions
    this.indexInteractions(elements);

    // Build search optimizations
    this.buildSearchIndex();

    // Update statistics
    this.statistics = {
      totalElements: elements.length,
      totalStyles: this.styleIndex.size,
      indexedAt: Date.now(),
      indexingTime: Date.now() - startTime
    };

    console.log(`✅ [DOMIndex] Indexed ${this.statistics.totalElements} elements in ${this.statistics.indexingTime}ms`);

    return this.statistics;
  }

  /**
   * Index elements by semantic meaning
   */
  indexBySemantic(elements) {
    if (!elements || !Array.isArray(elements)) {
      console.warn('⚠️ [DOMIndex] indexBySemantic called with invalid elements:', typeof elements);
      return;
    }

    // Define semantic categories
    const semanticCategories = {
      navigation: ['nav', 'menu', 'navigation', 'navbar'],
      cta_buttons: ['button', 'btn', 'cta', 'action', 'primary'],
      headlines: ['h1', 'h2', 'h3', 'title', 'heading', 'headline'],
      forms: ['form', 'input', 'textarea', 'select', 'field'],
      content: ['main', 'article', 'content', 'body', 'text'],
      footer: ['footer', 'bottom'],
      header: ['header', 'top', 'banner'],
      sidebar: ['sidebar', 'aside', 'side'],
      cards: ['card', 'item', 'box'],
      modals: ['modal', 'dialog', 'popup', 'overlay'],
      images: ['img', 'image', 'picture', 'photo'],
      links: ['a', 'link'],
      lists: ['ul', 'ol', 'li', 'list']
    };

    elements.forEach(element => {
      // Store element in main index
      this.elementIndex.set(element.selector, element);

      // Categorize element
      const categories = this.categorizeElement(element, semanticCategories);

      categories.forEach(category => {
        if (!this.semanticGroups[category]) {
          this.semanticGroups[category] = [];
        }
        this.semanticGroups[category].push(element);

        // Add to category index for fast lookup
        if (!this.categoryIndex.has(category)) {
          this.categoryIndex.set(category, new Set());
        }
        this.categoryIndex.get(category).add(element.selector);
      });
    });

    console.log(`📊 [DOMIndex] Semantic groups:`, Object.keys(this.semanticGroups).map(k => `${k}(${this.semanticGroups[k].length})`).join(', '));
  }

  /**
   * Categorize element based on tag, classes, and text
   */
  categorizeElement(element, categories) {
    const matches = [];

    // Build search text from all available properties
    const searchParts = [];

    // Add tag (might be 'tag' or 'tagName')
    if (element.tag) searchParts.push(element.tag);
    if (element.tagName) searchParts.push(element.tagName);

    // Add classes (might be array or string)
    if (Array.isArray(element.classes)) {
      searchParts.push(...element.classes);
    } else if (typeof element.classes === 'string') {
      searchParts.push(...element.classes.split(' '));
    } else if (element.className) {
      searchParts.push(...element.className.split(' '));
    }

    // Add ID
    if (element.id) searchParts.push(element.id);

    // Add text content
    if (element.text) searchParts.push(element.text.toLowerCase());
    if (element.textContent) searchParts.push(element.textContent.toLowerCase());

    // Add selector for matching (e.g., nav.primary-nav contains "nav")
    if (element.selector) searchParts.push(element.selector);

    const searchText = searchParts.join(' ').toLowerCase();

    // Debug first element to see structure
    if (!this._debuggedElement) {
      this._debuggedElement = true;
      console.log(`🔍 [DOMIndex] Element structure sample:`, {
        tag: element.tag,
        tagName: element.tagName,
        classes: element.classes,
        className: element.className,
        id: element.id,
        text: element.text?.substring(0, 50),
        textContent: element.textContent?.substring(0, 50),
        selector: element.selector,
        searchText: searchText.substring(0, 100)
      });
    }

    Object.entries(categories).forEach(([category, keywords]) => {
      if (keywords.some(keyword => searchText.includes(keyword))) {
        matches.push(category);
      }
    });

    // Fallback category
    if (matches.length === 0) {
      matches.push('other');
    }

    return matches;
  }

  /**
   * Index computed styles for each element
   */
  indexStyles(elements) {
    elements.forEach(element => {
      if (!element.visual) return;

      const styleProfile = {
        selector: element.selector,
        layout: this.extractLayoutStyles(element.visual),
        typography: this.extractTypographyStyles(element.visual),
        colors: this.extractColorScheme(element.visual),
        spacing: this.extractSpacing(element.visual),
        effects: this.extractEffects(element.visual),
        interactive: this.detectInteractivity(element)
      };

      this.styleIndex.set(element.selector, styleProfile);
    });
  }

  extractLayoutStyles(visual) {
    return {
      display: visual.display,
      position: visual.position,
      width: visual.width,
      height: visual.height,
      zIndex: visual.zIndex,
      top: visual.top,
      left: visual.left
    };
  }

  extractTypographyStyles(visual) {
    return {
      fontSize: visual.fontSize,
      fontWeight: visual.fontWeight,
      fontFamily: visual.fontFamily,
      lineHeight: visual.lineHeight,
      textAlign: visual.textAlign,
      textTransform: visual.textTransform
    };
  }

  extractColorScheme(visual) {
    return {
      backgroundColor: visual.backgroundColor,
      color: visual.color,
      borderColor: visual.borderColor,
      opacity: visual.opacity
    };
  }

  extractSpacing(visual) {
    return {
      padding: visual.padding,
      margin: visual.margin,
      gap: visual.gap
    };
  }

  extractEffects(visual) {
    return {
      boxShadow: visual.boxShadow,
      borderRadius: visual.borderRadius,
      transform: visual.transform,
      transition: visual.transition
    };
  }

  detectInteractivity(element) {
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
    const interactiveRoles = ['button', 'link', 'tab', 'menuitem'];

    return {
      isInteractive: interactiveTags.includes(element.tag) ||
                     (element.classes || []).some(c => c.includes('btn') || c.includes('button') || c.includes('link')),
      hasClickHandler: element.tag === 'button' || element.tag === 'a',
      isFocusable: element.tabindex !== undefined || interactiveTags.includes(element.tag)
    };
  }

  /**
   * Index interaction patterns
   */
  indexInteractions(elements) {
    elements.forEach(element => {
      const interactive = this.detectInteractivity(element);

      if (interactive.isInteractive) {
        this.interactionIndex.set(element.selector, {
          type: element.tag,
          clickable: interactive.hasClickHandler,
          focusable: interactive.isFocusable,
          keyboardAccessible: interactive.isFocusable
        });
      }
    });
  }

  /**
   * Build search optimization structures
   */
  buildSearchIndex() {
    // Build text search index
    this.textSearchIndex = new Map();

    this.elementIndex.forEach((element, selector) => {
      const searchableText = [
        element.text || '',
        element.tag,
        ...(element.classes || []),
        element.id || ''
      ].join(' ').toLowerCase();

      // Tokenize for search
      const tokens = searchableText.split(/\s+/).filter(t => t.length > 2);

      tokens.forEach(token => {
        if (!this.textSearchIndex.has(token)) {
          this.textSearchIndex.set(token, new Set());
        }
        this.textSearchIndex.get(token).add(selector);
      });
    });
  }

  /**
   * Semantic search by user intent
   * This is the main entry point for conversational DOM navigation
   */
  searchByIntent(userQuery) {
    console.log(`🔍 [DOMIndex] Searching for: "${userQuery}"`);

    // Parse user intent
    const intent = this.parseIntent(userQuery);
    console.log(`📋 [DOMIndex] Parsed intent:`, intent);

    // Find candidates
    const candidates = this.findCandidates(intent);

    // Rank by relevance
    const ranked = this.rankByRelevance(candidates, intent);

    // Get top results with context
    const results = ranked.slice(0, 5).map(candidate => ({
      element: candidate.element,
      score: candidate.score,
      context: this.gatherContext(candidate.element),
      relatedElements: this.findRelated(candidate.element)
    }));

    console.log(`✅ [DOMIndex] Found ${results.length} matches`);

    return {
      query: userQuery,
      intent,
      results,
      totalMatches: candidates.length
    };
  }

  /**
   * Parse user intent from natural language
   */
  parseIntent(query) {
    const lowerQuery = query.toLowerCase();

    return {
      action: this.extractAction(lowerQuery),
      targetType: this.extractTargetType(lowerQuery),
      targetIdentifier: this.extractTargetIdentifier(query),
      properties: this.extractProperties(lowerQuery),
      location: this.extractLocation(lowerQuery),
      originalQuery: query
    };
  }

  extractAction(query) {
    const actionKeywords = {
      change: ['change', 'modify', 'update', 'edit', 'alter'],
      add: ['add', 'insert', 'create', 'append'],
      remove: ['remove', 'delete', 'hide', 'eliminate'],
      style: ['style', 'color', 'make', 'set'],
      move: ['move', 'reposition', 'relocate'],
      replace: ['replace', 'swap', 'substitute']
    };

    for (const [action, keywords] of Object.entries(actionKeywords)) {
      if (keywords.some(kw => query.includes(kw))) {
        return action;
      }
    }

    return 'change'; // default
  }

  extractTargetType(query) {
    // Check semantic categories (exact match first)
    for (const [category, elements] of Object.entries(this.semanticGroups)) {
      if (query.includes(category.replace('_', ' ')) ||
          query.includes(category)) {
        return category;
      }
    }

    // Fuzzy match: check if query contains words in category names
    for (const [category, elements] of Object.entries(this.semanticGroups)) {
      const categoryWords = category.split('_');
      if (categoryWords.some(word => query.includes(word))) {
        console.log(`🎯 [DOMIndex] Fuzzy matched "${query}" to category "${category}"`);
        return category;
      }
    }

    // Check common element types
    const types = ['button', 'link', 'form', 'input', 'heading', 'image', 'text', 'menu', 'card', 'modal'];
    const foundType = types.find(type => query.includes(type));

    return foundType || 'element';
  }

  extractTargetIdentifier(query) {
    // Extract quoted text as explicit identifier
    const quoted = query.match(/"([^"]+)"/);
    if (quoted) {
      return quoted[1];
    }

    // Extract words that might be identifiers (capitalized, specific)
    const words = query.split(' ').filter(w => w.length > 3);
    return words.length > 0 ? words : null;
  }

  extractProperties(query) {
    const properties = [];

    // Color mentions
    const colors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'black', 'white', 'gray'];
    colors.forEach(color => {
      if (query.includes(color)) {
        properties.push({ type: 'color', value: color });
      }
    });

    // Size mentions
    if (query.includes('bigger') || query.includes('larger')) {
      properties.push({ type: 'size', value: 'increase' });
    }
    if (query.includes('smaller') || query.includes('reduce')) {
      properties.push({ type: 'size', value: 'decrease' });
    }

    // Position mentions
    const positions = ['top', 'bottom', 'left', 'right', 'center'];
    positions.forEach(pos => {
      if (query.includes(pos)) {
        properties.push({ type: 'position', value: pos });
      }
    });

    return properties;
  }

  extractLocation(query) {
    const locations = ['header', 'footer', 'sidebar', 'main', 'hero', 'navigation', 'top', 'bottom'];
    return locations.find(loc => query.includes(loc)) || null;
  }

  /**
   * Find candidate elements matching intent
   */
  findCandidates(intent) {
    let candidates = [];

    console.log(`🔎 [DOMIndex] Finding candidates for intent:`, {
      targetType: intent.targetType,
      targetIdentifier: intent.targetIdentifier,
      semanticGroupsAvailable: Object.keys(this.semanticGroups),
      elementIndexSize: this.elementIndex.size
    });

    // Strategy 1: Semantic category match
    if (this.semanticGroups[intent.targetType] && this.semanticGroups[intent.targetType].length > 0) {
      const matches = this.semanticGroups[intent.targetType];
      console.log(`✅ [Strategy 1] Semantic category "${intent.targetType}": ${matches.length} elements`);
      candidates.push(...matches.map(el => ({
        element: el,
        matchMethod: 'semantic_category',
        confidence: 0.8
      })));
    } else {
      console.log(`⚠️ [Strategy 1] No semantic group for "${intent.targetType}"`);
    }

    // Strategy 2: Text content match
    if (intent.targetIdentifier) {
      const identifiers = Array.isArray(intent.targetIdentifier) ? intent.targetIdentifier : [intent.targetIdentifier];
      console.log(`🔍 [Strategy 2] Text matching with identifiers:`, identifiers);

      let textMatches = 0;
      identifiers.forEach(identifier => {
        this.elementIndex.forEach((element, selector) => {
          if (element.text && element.text.toLowerCase().includes(identifier.toLowerCase())) {
            candidates.push({
              element,
              matchMethod: 'text_match',
              confidence: 0.9
            });
            textMatches++;
          }
        });
      });
      console.log(`✅ [Strategy 2] Text matches: ${textMatches}`);
    }

    // Strategy 3: Tag/class match
    console.log(`🔍 [Strategy 3] Tag/class matching for "${intent.targetType}"`);
    let tagClassMatches = 0;
    this.elementIndex.forEach((element, selector) => {
      const searchText = [element.tag, ...(element.classes || [])].join(' ').toLowerCase();

      if (searchText.includes(intent.targetType)) {
        candidates.push({
          element,
          matchMethod: 'tag_class',
          confidence: 0.7
        });
        tagClassMatches++;
      }
    });
    console.log(`✅ [Strategy 3] Tag/class matches: ${tagClassMatches}`);

    // Strategy 4: Location filter
    if (intent.location) {
      candidates = candidates.filter(c => {
        const inLocation = this.isInLocation(c.element, intent.location);
        if (inLocation) {
          c.confidence += 0.1; // Boost confidence
        }
        return inLocation || !intent.location; // Keep all if no location specified
      });
    }

    // Remove duplicates
    const uniqueCandidates = [];
    const seen = new Set();

    candidates.forEach(c => {
      if (!seen.has(c.element.selector)) {
        seen.add(c.element.selector);
        uniqueCandidates.push(c);
      }
    });

    return uniqueCandidates;
  }

  isInLocation(element, location) {
    // Check if element is in the specified page location
    const parents = element.parents || [];
    const elementContext = [element.tag, ...(element.classes || []), ...parents].join(' ').toLowerCase();

    return elementContext.includes(location);
  }

  /**
   * Rank candidates by relevance to intent
   */
  rankByRelevance(candidates, intent) {
    return candidates
      .map(candidate => {
        let score = candidate.confidence;

        // Boost for exact text match
        if (intent.targetIdentifier && candidate.element.text) {
          const identifiers = Array.isArray(intent.targetIdentifier) ? intent.targetIdentifier : [intent.targetIdentifier];
          if (identifiers.some(id => candidate.element.text.toLowerCase().includes(id.toLowerCase()))) {
            score += 0.2;
          }
        }

        // Boost for interactive elements (buttons, links)
        if (intent.action === 'change' && candidate.element.tag === 'button') {
          score += 0.1;
        }

        // Boost for visibility
        if (candidate.element.importance !== undefined && candidate.element.importance > 7) {
          score += 0.1;
        }

        // Penalty for deeply nested elements
        if ((candidate.element.parents || []).length > 5) {
          score -= 0.05;
        }

        return {
          ...candidate,
          score: Math.min(score, 1.0) // Cap at 1.0
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Gather context for an element
   */
  gatherContext(element) {
    const styles = this.styleIndex.get(element.selector) || {};

    return {
      selector: element.selector,
      tag: element.tag,
      text: element.text,
      classes: element.classes,
      currentStyles: styles,
      position: element.visual?.position,
      dimensions: {
        width: element.visual?.width,
        height: element.visual?.height
      },
      visibility: {
        display: element.visual?.display,
        opacity: element.visual?.opacity,
        zIndex: element.visual?.zIndex
      },
      isInteractive: this.interactionIndex.has(element.selector),
      importance: element.importance
    };
  }

  /**
   * Find related elements (siblings, parents, children)
   */
  findRelated(element) {
    const related = {
      siblings: [],
      children: [],
      parents: element.parents || []
    };

    // Find elements with similar characteristics
    const targetStyles = this.styleIndex.get(element.selector);

    if (targetStyles) {
      this.elementIndex.forEach((el, selector) => {
        if (selector === element.selector) return;

        const elStyles = this.styleIndex.get(selector);

        // Similar styling = likely related
        if (this.stylesAreSimilar(targetStyles, elStyles)) {
          related.siblings.push(el);
        }
      });
    }

    return related;
  }

  stylesAreSimilar(styles1, styles2) {
    if (!styles1 || !styles2) return false;

    // Compare key style properties
    const colorMatch = styles1.colors?.backgroundColor === styles2.colors?.backgroundColor;
    const fontMatch = styles1.typography?.fontSize === styles2.typography?.fontSize;
    const layoutMatch = styles1.layout?.display === styles2.layout?.display;

    return colorMatch || fontMatch || layoutMatch;
  }

  /**
   * Get elements by semantic category
   */
  getByCategory(category) {
    return this.semanticGroups[category] || [];
  }

  /**
   * Get all categories
   */
  getCategories() {
    return Object.keys(this.semanticGroups).map(category => ({
      name: category,
      count: this.semanticGroups[category].length
    }));
  }

  /**
   * Get element by selector
   */
  getElement(selector) {
    return this.elementIndex.get(selector);
  }

  /**
   * Get style profile for element
   */
  getStyles(selector) {
    return this.styleIndex.get(selector);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      categories: this.getCategories(),
      interactiveElements: this.interactionIndex.size
    };
  }

  /**
   * Clear index
   */
  clear() {
    this.elementIndex.clear();
    this.styleIndex.clear();
    this.interactionIndex.clear();
    this.categoryIndex.clear();
    this.semanticGroups = {};
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMSemanticIndex;
}
