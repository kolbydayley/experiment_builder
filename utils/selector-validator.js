// Pre-Generation Selector Validation
// Validates selectors exist and are reliable before sending to AI

class SelectorValidator {
  constructor() {
    this.validationCache = new Map();
  }

  /**
   * Validates all selectors in element database
   * Returns validated elements with confidence scores
   */
  validateElementDatabase(elementDatabase) {
    console.log('🔍 Validating element selectors...');

    const validatedElements = [];
    const failedSelectors = [];

    elementDatabase.elements.forEach(element => {
      const validation = this.validateSelector(element);

      if (validation.isValid && validation.confidence >= 0.6) {
        validatedElements.push({
          ...element,
          validation: {
            confidence: validation.confidence,
            matchCount: validation.matchCount,
            bestSelector: validation.bestSelector,
            alternativesAvailable: validation.alternativesAvailable
          }
        });
      } else {
        failedSelectors.push({
          id: element.id,
          selector: element.selector,
          reason: validation.reason,
          matchCount: validation.matchCount
        });
      }
    });

    const stats = {
      total: elementDatabase.elements.length,
      valid: validatedElements.length,
      failed: failedSelectors.length,
      avgConfidence: validatedElements.reduce((sum, el) => sum + el.validation.confidence, 0) / validatedElements.length || 0
    };

    console.log('✅ Selector Validation Complete:', stats);

    if (failedSelectors.length > 0) {
      console.warn('⚠️ Failed Selectors:', failedSelectors);
    }

    return {
      elements: validatedElements,
      metadata: {
        ...elementDatabase.metadata,
        validation: stats,
        failedSelectors
      }
    };
  }

  /**
   * Validates a single element and its selectors
   * Returns confidence score (0-1) and best selector
   */
  validateSelector(element) {
    const cacheKey = element.selector;

    // Check cache
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    // Test primary selector
    const primaryValidation = this.testSelector(element.selector, element.type);

    // Test alternatives
    let bestSelector = element.selector;
    let bestConfidence = primaryValidation.confidence;
    let bestMatchCount = primaryValidation.matchCount;

    if (element.alternativeSelectors && element.alternativeSelectors.length > 0) {
      element.alternativeSelectors.forEach(altSelector => {
        const altValidation = this.testSelector(altSelector, element.type);

        // Prefer selectors with 1 match (most specific)
        if (altValidation.matchCount === 1 && altValidation.confidence > bestConfidence) {
          bestSelector = altSelector;
          bestConfidence = altValidation.confidence;
          bestMatchCount = altValidation.matchCount;
        }
      });
    }

    const result = {
      isValid: bestConfidence >= 0.6,
      confidence: bestConfidence,
      bestSelector: bestSelector,
      matchCount: bestMatchCount,
      alternativesAvailable: element.alternativeSelectors?.length || 0,
      reason: bestConfidence < 0.6 ? this.getFailureReason(bestMatchCount) : null
    };

    this.validationCache.set(cacheKey, result);

    return result;
  }

  /**
   * Tests a selector and returns match count and confidence
   */
  testSelector(selector, expectedTag) {
    try {
      // Test if selector is valid
      const matches = document.querySelectorAll(selector);
      const matchCount = matches.length;

      if (matchCount === 0) {
        return { confidence: 0, matchCount: 0 };
      }

      // Calculate confidence score based on:
      // 1. Match count (1 is best, more is okay if reasonable, 0 is bad)
      // 2. Selector specificity
      // 3. Selector type (ID > class > tag)

      let confidence = 0;

      // Match count scoring
      if (matchCount === 1) {
        confidence += 0.5; // Perfect uniqueness
      } else if (matchCount <= 3) {
        confidence += 0.4; // Good enough
      } else if (matchCount <= 10) {
        confidence += 0.3; // Acceptable
      } else if (matchCount <= 50) {
        confidence += 0.2; // Weak
      } else {
        confidence += 0.1; // Very weak
      }

      // Selector type scoring
      if (selector.startsWith('#')) {
        confidence += 0.4; // ID selector (most reliable)
      } else if (selector.includes('[name=') || selector.includes('[data-')) {
        confidence += 0.35; // Attribute selector (very reliable)
      } else if (selector.match(/\.\w+/)) {
        confidence += 0.3; // Class selector (reliable)
      } else if (selector.includes('>')) {
        confidence += 0.2; // Path selector (less reliable)
      } else {
        confidence += 0.1; // Tag selector (least reliable)
      }

      // Bonus for short, simple selectors
      if (selector.length < 30) {
        confidence += 0.1;
      }

      // Cap confidence at 1.0
      confidence = Math.min(confidence, 1.0);

      return { confidence, matchCount };

    } catch (error) {
      console.warn('Selector validation error:', selector, error);
      return { confidence: 0, matchCount: 0 };
    }
  }

  /**
   * Gets human-readable failure reason
   */
  getFailureReason(matchCount) {
    if (matchCount === 0) {
      return 'Selector matches no elements on page';
    } else if (matchCount > 50) {
      return `Selector too broad (matches ${matchCount} elements)`;
    } else {
      return 'Selector confidence too low';
    }
  }

  /**
   * Suggests fixes for failed selectors
   */
  suggestFix(element, validation) {
    if (!validation.isValid) {
      if (validation.matchCount === 0) {
        return {
          action: 'remove',
          reason: 'Element no longer exists on page',
          suggestion: 'Skip this element or re-capture page data'
        };
      } else if (validation.matchCount > 50) {
        return {
          action: 'refine',
          reason: 'Selector matches too many elements',
          suggestion: 'Use more specific selector from alternatives or add context'
        };
      }
    }

    return null;
  }

  /**
   * Filters element database to only high-confidence selectors
   */
  filterHighConfidence(validatedDatabase, minConfidence = 0.7) {
    const filtered = validatedDatabase.elements.filter(el =>
      el.validation.confidence >= minConfidence
    );

    console.log(`📊 Filtered to high-confidence: ${filtered.length}/${validatedDatabase.elements.length} elements`);

    return {
      ...validatedDatabase,
      elements: filtered,
      metadata: {
        ...validatedDatabase.metadata,
        filtered: {
          minConfidence,
          originalCount: validatedDatabase.elements.length,
          filteredCount: filtered.length
        }
      }
    };
  }

  /**
   * Validates selectors are still valid (for use before applying variation)
   */
  revalidateSelectors(selectors) {
    const results = {};

    selectors.forEach(selector => {
      try {
        const matches = document.querySelectorAll(selector);
        results[selector] = {
          valid: matches.length > 0,
          matchCount: matches.length,
          warning: matches.length > 10 ? 'Selector matches many elements' : null
        };
      } catch (error) {
        results[selector] = {
          valid: false,
          matchCount: 0,
          error: error.message
        };
      }
    });

    return results;
  }

  /**
   * Extracts all unique selectors from generated code
   */
  extractSelectorsFromCode(code) {
    const selectors = new Set();

    // NEW: Find selectors that are for dynamically created elements (skip validation)
    const dynamicSelectors = this.extractDynamicSelectors(code);

    // Match querySelector, querySelectorAll, waitForElement patterns
    const patterns = [
      /querySelector\(['"`]([^'"`]+)['"`]\)/g,
      /querySelectorAll\(['"`]([^'"`]+)['"`]\)/g,
      /waitForElement\(['"`]([^'"`]+)['"`]/g,
      /document\.querySelector\(['"`]([^'"`]+)['"`]\)/g
    ];

    // Also match CSS selectors
    const cssPattern = /([.#\[\w-]+(?:[\s>+~][.#\[\w-]+)*)\s*\{/g;

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const selector = match[1];
        // Skip if this selector is for a dynamically created element
        if (!dynamicSelectors.has(selector)) {
          selectors.add(selector);
        }
      }
    });

    // Extract from CSS
    let cssMatch;
    while ((cssMatch = cssPattern.exec(code)) !== null) {
      const selector = cssMatch[1].trim();
      // Skip @media, @keyframes, etc.
      if (!selector.startsWith('@') && !dynamicSelectors.has(selector)) {
        selectors.add(selector);
      }
    }

    return Array.from(selectors);
  }

  /**
   * Extract selectors for dynamically created elements
   * These don't need validation since they're created by the code
   */
  extractDynamicSelectors(code) {
    const dynamicSelectors = new Set();

    // Find elements created with createElement
    const createElementPattern = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement/g;
    const classNameAssignments = /(\w+)\.className\s*=\s*['"]([^'"]+)['"]/g;

    // Track created element variables
    const createdVars = new Set();
    let match;
    while ((match = createElementPattern.exec(code)) !== null) {
      createdVars.add(match[1]);
    }

    // Find class names assigned to created elements
    while ((match = classNameAssignments.exec(code)) !== null) {
      const varName = match[1];
      const className = match[2];

      if (createdVars.has(varName)) {
        // This className is for a dynamically created element
        className.split(' ').forEach(cls => {
          if (cls.trim()) {
            dynamicSelectors.add(`.${cls.trim()}`);
          }
        });
      }
    }

    // Common patterns for dynamically created containers
    const commonDynamicClasses = [
      '.button-container',
      '.btn-wrapper-created',
      '.cta-container',
      '.dynamic-wrapper'
    ];

    // If code creates these elements, mark them as dynamic
    commonDynamicClasses.forEach(selector => {
      if (code.includes(selector.substring(1))) { // Remove the '.' to check className
        dynamicSelectors.add(selector);
      }
    });

    return dynamicSelectors;
  }

  /**
   * Clears validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectorValidator;
} else if (typeof window !== 'undefined') {
  window.SelectorValidator = SelectorValidator;
}
