/**
 * DOM Dependency Analyzer - Tracks element relationships and predicts side effects
 *
 * Like LSP's "Find References" but for DOM elements.
 * Analyzes dependencies, cascade effects, and predicts impact of changes.
 */
class DOMDependencyAnalyzer {
  constructor() {
    this.dependencyGraph = new Map();
    this.elementRelationships = new Map();
    this.layoutGroups = new Map();
    this.statistics = {
      totalRelationships: 0,
      analyzedAt: null
    };
  }

  /**
   * Build dependency graph from page data
   */
  buildGraph(pageData) {
    console.log('🔗 [DOMDependency] Building dependency graph...');
    const startTime = Date.now();

    this.clear();

    const elements = pageData.elements || [];

    // Build relationships
    elements.forEach(element => {
      this.analyzeElementDependencies(element, elements);
    });

    // Identify layout groups
    this.identifyLayoutGroups(elements);

    // Build parent-child mappings
    this.buildParentChildMappings(elements);

    // Update statistics
    this.statistics = {
      totalRelationships: this.dependencyGraph.size,
      layoutGroups: this.layoutGroups.size,
      analyzedAt: Date.now(),
      analysisTime: Date.now() - startTime
    };

    console.log(`✅ [DOMDependency] Analyzed ${this.statistics.totalRelationships} relationships in ${this.statistics.analysisTime}ms`);

    return this.statistics;
  }

  /**
   * Analyze all dependencies for a single element
   */
  analyzeElementDependencies(element, allElements) {
    const dependencies = {
      selector: element.selector,

      // Direct relationships
      children: [],
      parents: element.parents || [],
      siblings: [],

      // Style relationships
      affectedByStyles: [],
      affectsStyles: [],

      // Layout relationships
      layoutGroup: null,
      layoutSiblings: [],

      // Interaction relationships
      triggeredBy: [],
      triggers: [],

      // Visual relationships
      overlaps: [],
      obscures: [],
      obscuredBy: []
    };

    // Find children (elements with this as parent)
    dependencies.children = allElements
      .filter(el => el.parents && el.parents.includes(element.selector))
      .map(el => el.selector);

    // Find siblings (elements with same parent)
    if (element.parents && element.parents.length > 0) {
      const directParent = element.parents[element.parents.length - 1];
      dependencies.siblings = allElements
        .filter(el => el.parents &&
                     el.parents.length > 0 &&
                     el.parents[el.parents.length - 1] === directParent &&
                     el.selector !== element.selector)
        .map(el => el.selector);
    }

    // Analyze style cascade
    if (element.visual) {
      dependencies.affectedByStyles = this.findStyleDependencies(element, allElements, 'inherited');
      dependencies.affectsStyles = this.findStyleDependencies(element, allElements, 'affects');
    }

    // Analyze layout relationships
    dependencies.layoutSiblings = this.findLayoutSiblings(element, allElements);

    // Analyze visual overlaps
    if (element.visual) {
      const overlaps = this.findOverlapping(element, allElements);
      dependencies.overlaps = overlaps.map(el => el.selector);

      // Check z-index to determine obscuring relationships
      overlaps.forEach(overlapping => {
        const elementZ = parseInt(element.visual.zIndex) || 0;
        const overlappingZ = parseInt(overlapping.visual?.zIndex) || 0;

        if (elementZ > overlappingZ) {
          dependencies.obscures.push(overlapping.selector);
        } else if (overlappingZ > elementZ) {
          dependencies.obscuredBy.push(overlapping.selector);
        }
      });
    }

    // Store in graph
    this.dependencyGraph.set(element.selector, dependencies);
    this.elementRelationships.set(element.selector, element);

    return dependencies;
  }

  /**
   * Find style dependencies (inherited or affecting others)
   */
  findStyleDependencies(element, allElements, direction) {
    const dependencies = [];

    if (direction === 'inherited') {
      // Find elements whose styles cascade to this one
      // (parent elements with inheritable properties)
      element.parents?.forEach(parentSelector => {
        const parent = allElements.find(el => el.selector === parentSelector);
        if (parent && parent.visual) {
          dependencies.push({
            selector: parentSelector,
            properties: this.getInheritableProperties(parent.visual)
          });
        }
      });
    } else if (direction === 'affects') {
      // Find elements that inherit styles from this one (children)
      const childSelectors = allElements
        .filter(el => el.parents && el.parents.includes(element.selector))
        .map(el => el.selector);

      dependencies.push(...childSelectors);
    }

    return dependencies;
  }

  /**
   * Get inheritable CSS properties
   */
  getInheritableProperties(visual) {
    const inheritable = [
      'color',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'textAlign',
      'textTransform'
    ];

    return inheritable
      .filter(prop => visual[prop] !== undefined)
      .reduce((obj, prop) => {
        obj[prop] = visual[prop];
        return obj;
      }, {});
  }

  /**
   * Find layout siblings (elements in same layout context)
   */
  findLayoutSiblings(element, allElements) {
    if (!element.visual || !element.parents || element.parents.length === 0) {
      return [];
    }

    const directParent = element.parents[element.parents.length - 1];
    const parent = allElements.find(el => el.selector === directParent);

    if (!parent || !parent.visual) {
      return [];
    }

    // Check if parent is a flex or grid container
    const isFlex = parent.visual.display?.includes('flex');
    const isGrid = parent.visual.display?.includes('grid');

    if (!isFlex && !isGrid) {
      return [];
    }

    // Find other children of this flex/grid container
    return allElements
      .filter(el => el.parents &&
                   el.parents.length > 0 &&
                   el.parents[el.parents.length - 1] === directParent &&
                   el.selector !== element.selector)
      .map(el => ({
        selector: el.selector,
        layoutType: isFlex ? 'flex' : 'grid',
        parentSelector: directParent
      }));
  }

  /**
   * Find overlapping elements
   */
  findOverlapping(element, allElements) {
    if (!element.visual || !element.visual.left || !element.visual.top ||
        !element.visual.width || !element.visual.height) {
      return [];
    }

    const elementBounds = {
      left: parseFloat(element.visual.left),
      top: parseFloat(element.visual.top),
      right: parseFloat(element.visual.left) + parseFloat(element.visual.width),
      bottom: parseFloat(element.visual.top) + parseFloat(element.visual.height)
    };

    return allElements.filter(el => {
      if (el.selector === element.selector) return false;
      if (!el.visual || !el.visual.left || !el.visual.top ||
          !el.visual.width || !el.visual.height) return false;

      const elBounds = {
        left: parseFloat(el.visual.left),
        top: parseFloat(el.visual.top),
        right: parseFloat(el.visual.left) + parseFloat(el.visual.width),
        bottom: parseFloat(el.visual.top) + parseFloat(el.visual.height)
      };

      // Check for overlap
      return !(elementBounds.right < elBounds.left ||
               elementBounds.left > elBounds.right ||
               elementBounds.bottom < elBounds.top ||
               elementBounds.top > elBounds.bottom);
    });
  }

  /**
   * Identify layout groups (flex/grid containers)
   */
  identifyLayoutGroups(elements) {
    elements.forEach(element => {
      if (!element.visual || !element.visual.display) return;

      const display = element.visual.display.toLowerCase();

      if (display.includes('flex') || display.includes('grid')) {
        // Find children
        const children = elements.filter(el =>
          el.parents && el.parents.includes(element.selector)
        );

        this.layoutGroups.set(element.selector, {
          type: display.includes('flex') ? 'flex' : 'grid',
          parent: element.selector,
          children: children.map(el => el.selector),
          properties: this.extractLayoutProperties(element.visual, display)
        });
      }
    });
  }

  /**
   * Extract layout properties
   */
  extractLayoutProperties(visual, display) {
    if (display.includes('flex')) {
      return {
        flexDirection: visual.flexDirection,
        justifyContent: visual.justifyContent,
        alignItems: visual.alignItems,
        flexWrap: visual.flexWrap,
        gap: visual.gap
      };
    } else if (display.includes('grid')) {
      return {
        gridTemplateColumns: visual.gridTemplateColumns,
        gridTemplateRows: visual.gridTemplateRows,
        gap: visual.gap,
        justifyItems: visual.justifyItems,
        alignItems: visual.alignItems
      };
    }
    return {};
  }

  /**
   * Build parent-child mappings for quick traversal
   */
  buildParentChildMappings(elements) {
    this.parentChildMap = new Map();

    elements.forEach(element => {
      if (!element.parents || element.parents.length === 0) return;

      element.parents.forEach(parentSelector => {
        if (!this.parentChildMap.has(parentSelector)) {
          this.parentChildMap.set(parentSelector, []);
        }
        this.parentChildMap.get(parentSelector).push(element.selector);
      });
    });
  }

  /**
   * Analyze impact of editing an element
   */
  analyzeImpact(targetSelector) {
    const dependencies = this.dependencyGraph.get(targetSelector);

    if (!dependencies) {
      console.warn(`[DOMDependency] No dependencies found for ${targetSelector}`);
      return { warnings: [], suggestions: [] };
    }

    return {
      dependencies,
      warnings: this.generateWarnings(dependencies),
      suggestions: this.generateSuggestions(dependencies),
      affectedCount: this.countAffectedElements(dependencies)
    };
  }

  /**
   * Generate warnings for potential side effects
   */
  generateWarnings(dependencies) {
    const warnings = [];

    // Layout group warning
    if (dependencies.layoutSiblings && dependencies.layoutSiblings.length > 5) {
      warnings.push({
        type: 'layout_impact',
        severity: 'warning',
        message: `⚠️ Changing this will affect ${dependencies.layoutSiblings.length} sibling elements in ${dependencies.layoutSiblings[0]?.layoutType || 'layout'} container`,
        affectedElements: dependencies.layoutSiblings.map(s => s.selector)
      });
    }

    // Z-index warning
    if (dependencies.overlaps && dependencies.overlaps.length > 0) {
      warnings.push({
        type: 'overlap',
        severity: 'warning',
        message: `⚠️ Z-index change may affect ${dependencies.overlaps.length} overlapping elements`,
        affectedElements: dependencies.overlaps
      });
    }

    // Children warning
    if (dependencies.children && dependencies.children.length > 10) {
      warnings.push({
        type: 'children_impact',
        severity: 'info',
        message: `ℹ️ This element has ${dependencies.children.length} children that may be affected`,
        affectedElements: dependencies.children
      });
    }

    // Style inheritance warning
    if (dependencies.affectsStyles && dependencies.affectsStyles.length > 0) {
      warnings.push({
        type: 'style_inheritance',
        severity: 'info',
        message: `ℹ️ Style changes will cascade to ${dependencies.affectsStyles.length} child elements`,
        affectedElements: dependencies.affectsStyles
      });
    }

    return warnings;
  }

  /**
   * Generate suggestions for better edits
   */
  generateSuggestions(dependencies) {
    const suggestions = [];

    // Suggest parent-level changes
    if (dependencies.layoutSiblings && dependencies.layoutSiblings.length > 3) {
      suggestions.push({
        type: 'parent_change',
        message: `💡 Consider changing parent container (${dependencies.layoutSiblings[0]?.parentSelector}) instead to affect all siblings`,
        targetSelector: dependencies.layoutSiblings[0]?.parentSelector
      });
    }

    // Suggest class-based changes
    if (dependencies.siblings && dependencies.siblings.length > 2) {
      suggestions.push({
        type: 'class_based',
        message: '💡 Use CSS class to avoid specificity issues and make future changes easier'
      });
    }

    // Suggest avoiding overlaps
    if (dependencies.obscuredBy && dependencies.obscuredBy.length > 0) {
      suggestions.push({
        type: 'visibility',
        message: `💡 Element is obscured by ${dependencies.obscuredBy.length} elements. Consider adjusting z-index or positioning`,
        obscuredBy: dependencies.obscuredBy
      });
    }

    return suggestions;
  }

  /**
   * Count total affected elements
   */
  countAffectedElements(dependencies) {
    const affected = new Set();

    // Add all related elements
    [
      ...(dependencies.children || []),
      ...(dependencies.siblings || []),
      ...(dependencies.layoutSiblings?.map(s => s.selector) || []),
      ...(dependencies.overlaps || []),
      ...(dependencies.affectsStyles || [])
    ].forEach(selector => affected.add(selector));

    return affected.size;
  }

  /**
   * Predict side effects of an edit
   */
  predictSideEffects(edit) {
    const impact = this.analyzeImpact(edit.target);
    const sideEffects = [];

    // Check for layout shifts
    if (edit.css && (edit.css.includes('display:') || edit.css.includes('position:'))) {
      const dependencies = this.dependencyGraph.get(edit.target);

      if (dependencies && dependencies.layoutSiblings && dependencies.layoutSiblings.length > 0) {
        sideEffects.push({
          type: 'layout_shift',
          severity: 'warning',
          message: 'Display/position change may cause layout shift',
          affected: dependencies.layoutSiblings.map(s => s.selector)
        });
      }
    }

    // Check for removal side effects
    if (edit.action === 'remove' || (edit.css && edit.css.includes('display: none'))) {
      const dependencies = this.dependencyGraph.get(edit.target);

      if (dependencies && dependencies.children && dependencies.children.length > 0) {
        sideEffects.push({
          type: 'cascade_removal',
          severity: 'error',
          message: `Removing/hiding this element will also affect ${dependencies.children.length} children`,
          affected: dependencies.children
        });
      }
    }

    // Check for color contrast issues
    if (edit.css && edit.css.includes('color') && !edit.css.includes('background')) {
      sideEffects.push({
        type: 'contrast_warning',
        severity: 'warning',
        message: 'Changing text color without background may cause contrast issues'
      });
    }

    return {
      ...impact,
      sideEffects
    };
  }

  /**
   * Get relationship between two elements
   */
  getRelationship(selector1, selector2) {
    const deps1 = this.dependencyGraph.get(selector1);
    const deps2 = this.dependencyGraph.get(selector2);

    if (!deps1 || !deps2) return null;

    // Check direct relationships
    if (deps1.children.includes(selector2)) return 'parent';
    if (deps1.parents.includes(selector2)) return 'child';
    if (deps1.siblings.includes(selector2)) return 'sibling';
    if (deps1.layoutSiblings?.some(s => s.selector === selector2)) return 'layout_sibling';
    if (deps1.overlaps.includes(selector2)) return 'overlapping';

    return 'unrelated';
  }

  /**
   * Find common parent
   */
  findCommonParent(selector1, selector2) {
    const deps1 = this.dependencyGraph.get(selector1);
    const deps2 = this.dependencyGraph.get(selector2);

    if (!deps1 || !deps2) return null;

    const parents1 = deps1.parents || [];
    const parents2 = deps2.parents || [];

    // Find first common parent (closest)
    for (let i = parents1.length - 1; i >= 0; i--) {
      if (parents2.includes(parents1[i])) {
        return parents1[i];
      }
    }

    return null;
  }

  /**
   * Get layout group for element
   */
  getLayoutGroup(selector) {
    const dependencies = this.dependencyGraph.get(selector);

    if (!dependencies || !dependencies.layoutSiblings || dependencies.layoutSiblings.length === 0) {
      return null;
    }

    const parentSelector = dependencies.layoutSiblings[0].parentSelector;
    return this.layoutGroups.get(parentSelector);
  }

  /**
   * Get all dependencies for element
   */
  getDependencies(selector) {
    return this.dependencyGraph.get(selector);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      elementsAnalyzed: this.dependencyGraph.size
    };
  }

  /**
   * Clear analyzer
   */
  clear() {
    this.dependencyGraph.clear();
    this.elementRelationships.clear();
    this.layoutGroups.clear();
    this.parentChildMap = new Map();
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMDependencyAnalyzer;
}
