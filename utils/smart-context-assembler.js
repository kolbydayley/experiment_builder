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
      console.warn('⚠️ [Smart Context] No element database in pageData (likely loaded experiment)');

      // For loaded experiments, reconstruct minimal element data from code selectors
      if (usedSelectors.length > 0) {
        console.log(`📝 [Smart Context] Reconstructing ${usedSelectors.length} elements from code selectors`);
        context.elementDatabase.elements = usedSelectors.map(selector => ({
          selector: selector,
          tag: selector.split(/[#.\s]/)[0] || 'div',
          id: selector.includes('#') ? selector.split('#')[1]?.split(/[.\s]/)[0] : null,
          classes: selector.match(/\.[a-zA-Z0-9_-]+/g)?.map(c => c.slice(1)) || [],
          text: '',
          metadata: { source: 'reconstructed_from_code' }
        }));
        context.elementDatabase.metadata.reconstructedFromCode = true;
      }

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
      // Strategy 2: Include used selectors + top 10 + PROXIMITY ELEMENTS (Phase 3.1)
      const usedElements = pageData.elementDatabase.elements.filter(el =>
        usedSelectors.includes(el.selector) ||
        usedSelectors.includes(`#${el.id}`) ||
        (el.classes && el.classes.some(c => usedSelectors.includes(`.${c}`)))
      );

      // Phase 3.1: Intelligent proximity expansion
      // For each used element, find nearby elements in the DOM
      const proximityElements = [];
      usedElements.forEach(usedEl => {
        // Extract container from selector (e.g., ".header" from ".header .btn")
        const selectorParts = usedEl.selector.split(/\s+/);
        const containerClass = selectorParts[0]; // First part is usually the container

        // Find all elements that share the same container or are structurally related
        pageData.elementDatabase.elements.forEach(candidate => {
          // Skip if already in usedElements
          if (usedElements.some(e => e.selector === candidate.selector)) return;

          // Include if:
          // 1. Shares same parent container
          // 2. Has high importance (>= 7)
          // 3. Not too far down in element list (within top 50)
          const candidateIndex = pageData.elementDatabase.elements.indexOf(candidate);
          const sharesContainer = candidate.selector.includes(containerClass) ||
                                 containerClass.includes(candidate.selector);
          const isImportant = candidate.importance >= 7;
          const isNearby = candidateIndex < 50;

          if ((sharesContainer || isImportant) && isNearby) {
            if (!proximityElements.some(e => e.selector === candidate.selector)) {
              proximityElements.push(candidate);
            }
          }
        });
      });

      // Add top 10 elements to allow for new additions
      const topElements = pageData.elementDatabase.elements.slice(0, 10);

      // Combine: used elements + proximity elements + top elements
      const combinedElements = [...usedElements];

      // Add proximity elements (Phase 3.1)
      proximityElements.forEach(el => {
        if (!combinedElements.some(existing => existing.selector === el.selector)) {
          combinedElements.push(el);
        }
      });

      // Add top elements
      topElements.forEach(el => {
        if (!combinedElements.some(existing => existing.selector === el.selector)) {
          combinedElements.push(el);
        }
      });

      // Limit to 50 elements max (still 70% smaller than full database)
      context.elementDatabase.elements = combinedElements.slice(0, 50);

      console.log(`📍 [Phase 3.1] Proximity expansion: ${usedElements.length} used + ${proximityElements.length} proximity + ${topElements.length} top = ${combinedElements.length} total (capped at 50)`);
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
    console.log(`  Proximity (Phase 3.1): Expanded from ~${usedSelectors.length + 10} to ${context.elementDatabase.elements.length} elements`);
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
      const cssCode = variation.css || '';
      const jsCode = variation.js || '';

      // Extract from CSS selectors (before { )
      const cssSelectors = cssCode.match(/([.#a-zA-Z][\w\-.:[\]='"\s>+~*()]+)\s*\{/g);
      if (cssSelectors) {
        cssSelectors.forEach(match => {
          const selector = match.replace(/\s*\{$/, '').trim();
          if (selector) selectors.add(selector);
        });
      }

      // Extract from JS querySelector/querySelectorAll calls
      const jsSelectors = jsCode.match(/querySelector(?:All)?\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      if (jsSelectors) {
        jsSelectors.forEach(match => {
          const selectorMatch = match.match(/['"`]([^'"`]+)['"`]/);
          if (selectorMatch) selectors.add(selectorMatch[1]);
        });
      }

      // Extract from waitForElement calls
      const waitForMatches = jsCode.match(/waitForElement\s*\(\s*['"`]([^'"`]+)['"`]/g);
      if (waitForMatches) {
        waitForMatches.forEach(match => {
          const selectorMatch = match.match(/['"`]([^'"`]+)['"`]/);
          if (selectorMatch) selectors.add(selectorMatch[1]);
        });
      }
    });

    return Array.from(selectors);
  }
}
