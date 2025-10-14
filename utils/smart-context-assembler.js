/**
 * Smart Context Assembler - Builds minimal, targeted context based on intent analysis
 *
 * Purpose: Reduce AI request size by 70-95%
 * - Fetches only necessary elements
 * - Filters element properties
 * - Conditionally includes screenshots
 * - Works with Intent Analyzer output
 */
class SmartContextAssembler {
  constructor() {
    this.ELEMENT_PROPERTIES = {
      MINIMAL: ['selector', 'tag', 'id', 'classes'],
      MODERATE: ['selector', 'tag', 'id', 'classes', 'text', 'visual'],
      FULL: ['selector', 'tag', 'id', 'classes', 'text', 'visual', 'attributes', 'innerHTML', 'metadata']
    };
  }

  /**
   * Build optimized context based on intent analysis
   */
  async assembleContext(intentAnalysis, pageData, currentCode = null) {
    console.log('🏗️ [Smart Context] Assembling optimized context...');

    // CRITICAL: Check if pageData has element database
    if (!pageData || !pageData.elementDatabase || !pageData.elementDatabase.elements || pageData.elementDatabase.elements.length === 0) {
      console.error('❌ [Smart Context] No element database available in pageData!');
      console.error('  pageData:', !!pageData);
      console.error('  elementDatabase:', !!pageData?.elementDatabase);
      console.error('  elements:', pageData?.elementDatabase?.elements?.length || 0);

      // Return empty context - this will cause the generation to fail with clear error
      return {
        elementDatabase: {
          elements: [],
          metadata: {
            mode: 'error',
            error: 'No element database available'
          }
        },
        screenshot: null
      };
    }

    const context = {
      elementDatabase: {
        elements: [],
        metadata: {
          mode: 'optimized',
          intentDriven: true,
          originalElementCount: pageData.elementDatabase.elements.length,
          filteredElementCount: 0
        }
      },
      screenshot: null
    };

    // 1. Get target elements with context radius
    if (intentAnalysis.scope.targetElements.length > 0) {
      context.elementDatabase.elements = this.getElementsWithRadius(
        pageData.elementDatabase,
        intentAnalysis.scope.targetElements,
        intentAnalysis.scope.contextRadius
      );
    } else if (intentAnalysis.scope.contextRadius === 'global') {
      // Global context - use all elements
      context.elementDatabase.elements = pageData.elementDatabase.elements.slice(0, 50); // Cap at 50
    } else {
      // No specific targets - use top elements
      context.elementDatabase.elements = pageData.elementDatabase.elements.slice(0, 20);
    }

    // CRITICAL: If we ended up with 0 elements, use top 20 as fallback
    if (context.elementDatabase.elements.length === 0) {
      console.warn('⚠️ [Smart Context] 0 elements after initial assembly, using top 20 as fallback');
      context.elementDatabase.elements = pageData.elementDatabase.elements.slice(0, 20);
    }

    // 2. Filter element properties based on requirements
    context.elementDatabase.elements = this.filterElementProperties(
      context.elementDatabase.elements,
      intentAnalysis.dataRequirements.elementProperties
    );

    // 3. Add screenshot only if needed
    if (intentAnalysis.scope.needsScreenshot && pageData.screenshot) {
      context.screenshot = pageData.screenshot;
      console.log('📸 [Smart Context] Including full page screenshot');
    } else if (intentAnalysis.scope.needsVisuals) {
      // Add element-level visual data
      context.elementDatabase.elements = context.elementDatabase.elements.map(el => ({
        ...el,
        visual: el.visual || null
      }));
      console.log('🎨 [Smart Context] Including element visual data');
    } else {
      // Remove all visual data to minimize size
      context.elementDatabase.elements = context.elementDatabase.elements.map(el => {
        const { screenshot, visual, ...rest } = el;
        return rest;
      });
      console.log('📉 [Smart Context] Stripped visual data for minimal size');
    }

    context.elementDatabase.metadata.filteredElementCount = context.elementDatabase.elements.length;

    // Log size reduction
    const originalSize = JSON.stringify(pageData.elementDatabase).length;
    const filteredSize = JSON.stringify(context.elementDatabase.elements).length;
    const reduction = Math.round((1 - filteredSize / originalSize) * 100);

    console.log(`✅ [Smart Context] Context assembled:`);
    console.log(`  Elements: ${context.elementDatabase.metadata.originalElementCount} → ${context.elementDatabase.metadata.filteredElementCount}`);
    console.log(`  Size: ${(originalSize / 1024).toFixed(1)}KB → ${(filteredSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);
    console.log(`  Screenshot: ${context.screenshot ? 'included' : 'excluded'}`);

    return context;
  }

  /**
   * Get elements with specified context radius
   */
  getElementsWithRadius(database, targetSelectors, radius) {
    if (!database || !database.elements) {
      return [];
    }

    const elements = database.elements;
    const result = new Set();

    targetSelectors.forEach(targetSelector => {
      // Find the target element
      const targetElement = elements.find(el =>
        el.selector === targetSelector ||
        `#${el.id}` === targetSelector ||
        (el.classes && `.${el.classes[0]}` === targetSelector)
      );

      if (!targetElement) {
        // If exact match not found, try fuzzy matching
        const fuzzyMatch = elements.find(el =>
          el.selector?.includes(targetSelector.replace(/[.#]/, ''))
        );
        if (fuzzyMatch) {
          result.add(fuzzyMatch);
        }
        return;
      }

      result.add(targetElement);

      // Add elements based on radius
      switch (radius) {
        case 'self':
          // Just the target
          break;

        case 'descendants':
          // Target + children
          this.addDescendants(targetElement, elements, result);
          break;

        case 'siblings':
          // Target + adjacent elements
          this.addSiblings(targetElement, elements, result);
          break;

        case 'ancestors':
          // Target + parent chain
          this.addAncestors(targetElement, elements, result);
          break;

        case 'section':
          // Target + surrounding section
          this.addSection(targetElement, elements, result);
          break;

        case 'global':
          // All elements (handled by caller)
          break;
      }
    });

    return Array.from(result);
  }

  /**
   * Add descendant elements
   */
  addDescendants(targetElement, allElements, resultSet) {
    const targetSelector = targetElement.selector;

    allElements.forEach(el => {
      // Check if element selector suggests it's a descendant
      if (el.selector && el.selector.includes(targetSelector)) {
        resultSet.add(el);
      }
    });
  }

  /**
   * Add sibling elements
   */
  addSiblings(targetElement, allElements, resultSet) {
    // Find elements with similar parent or position
    const targetIndex = allElements.indexOf(targetElement);

    if (targetIndex >= 0) {
      // Add previous and next elements
      if (targetIndex > 0) resultSet.add(allElements[targetIndex - 1]);
      if (targetIndex < allElements.length - 1) resultSet.add(allElements[targetIndex + 1]);
    }
  }

  /**
   * Add ancestor elements
   */
  addAncestors(targetElement, allElements, resultSet) {
    // Find elements that are likely parents based on selector structure
    const parts = targetElement.selector.split(/[\s>]/);

    allElements.forEach(el => {
      if (parts.some(part => el.selector === part.trim())) {
        resultSet.add(el);
      }
    });
  }

  /**
   * Add section elements (broader context)
   */
  addSection(targetElement, allElements, resultSet) {
    // Add descendants and nearby elements
    this.addDescendants(targetElement, allElements, resultSet);
    this.addSiblings(targetElement, allElements, resultSet);

    // Add some context elements (top 10)
    allElements.slice(0, 10).forEach(el => resultSet.add(el));
  }

  /**
   * Filter element properties based on requirements
   */
  filterElementProperties(elements, requiredProperties) {
    if (!requiredProperties || requiredProperties.length === 0) {
      // Default to minimal properties
      requiredProperties = this.ELEMENT_PROPERTIES.MINIMAL;
    }

    return elements.map(element => {
      const filtered = {};

      requiredProperties.forEach(prop => {
        if (element.hasOwnProperty(prop)) {
          filtered[prop] = element[prop];
        }
      });

      // Always include selector (critical)
      if (!filtered.selector && element.selector) {
        filtered.selector = element.selector;
      }

      return filtered;
    });
  }

  /**
   * Build refinement context (smart balancing)
   */
  assembleRefinementContext(intentAnalysis, pageData, currentCode) {
    console.log('🔄 [Smart Context] Assembling refinement context...');

    // For refinements, we need a balance:
    // - Include elements from current code (to avoid duplicates)
    // - Include NEW elements if the refinement requests them
    // - Keep it minimal to reduce request size

    const usedSelectors = this.extractSelectorsFromCode(currentCode);
    const targetSelectors = intentAnalysis?.scope?.targetElements || [];

    const context = {
      elementDatabase: {
        elements: [],
        metadata: {
          mode: 'refinement',
          isRefinement: true,
          selectorsFromCode: usedSelectors.length,
          targetSelectors: targetSelectors.length
        }
      },
      screenshot: null // Never include screenshot for refinements
    };

    if (!pageData?.elementDatabase?.elements) {
      console.warn('⚠️ [Smart Context] No element database in pageData!');
      return context;
    }

    // Strategy 1: If intent specified target elements, prioritize those
    if (targetSelectors.length > 0) {
      // Get target elements + used selectors
      const allNeededSelectors = new Set([...usedSelectors, ...targetSelectors]);

      context.elementDatabase.elements = pageData.elementDatabase.elements.filter(el =>
        allNeededSelectors.has(el.selector) ||
        allNeededSelectors.has(`#${el.id}`) ||
        (el.classes && el.classes.some(c => allNeededSelectors.has(`.${c}`)))
      );
    } else {
      // Strategy 2: Include used selectors + top 10 elements for new additions
      const usedElements = pageData.elementDatabase.elements.filter(el =>
        usedSelectors.includes(el.selector) ||
        usedSelectors.includes(`#${el.id}`) ||
        (el.classes && el.classes.some(c => usedSelectors.includes(`.${c}`)))
      );

      // Add top 10 elements to allow for new additions
      const topElements = pageData.elementDatabase.elements.slice(0, 10);

      // Combine and deduplicate
      const combinedElements = [...usedElements];
      topElements.forEach(el => {
        if (!combinedElements.some(existing => existing.selector === el.selector)) {
          combinedElements.push(el);
        }
      });

      context.elementDatabase.elements = combinedElements;
    }

    // If we end up with NO elements, fallback to top 20
    if (context.elementDatabase.elements.length === 0) {
      console.warn('⚠️ [Smart Context] Refinement context had 0 elements, using top 20 as fallback');
      context.elementDatabase.elements = pageData.elementDatabase.elements.slice(0, 20);
    }

    // Filter to minimal properties for size reduction
    context.elementDatabase.elements = this.filterElementProperties(
      context.elementDatabase.elements,
      ['selector', 'tag', 'id', 'classes', 'text']
    );

    console.log(`✅ [Smart Context] Refinement context assembled:`);
    console.log(`  Elements: ${context.elementDatabase.elements.length}`);
    console.log(`  From code: ${usedSelectors.length} selectors`);
    console.log(`  Targets: ${targetSelectors.length} elements`);
    console.log(`  Size: ${(JSON.stringify(context.elementDatabase.elements).length / 1024).toFixed(1)}KB`);

    return context;
  }

  /**
   * Extract selectors from generated code
   */
  extractSelectorsFromCode(codeResult) {
    const selectors = new Set();

    if (!codeResult || !codeResult.variations) {
      return Array.from(selectors);
    }

    codeResult.variations.forEach(variation => {
      const code = (variation.css || '') + (variation.js || '');

      // Match selector patterns
      const matches = code.match(/['"`]([.#][\w-]+[^'"`]*?)['"`]/g);

      if (matches) {
        matches.forEach(match => {
          const selector = match.replace(/['"`]/g, '');
          selectors.add(selector);
        });
      }
    });

    return Array.from(selectors);
  }
}
