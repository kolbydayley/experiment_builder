/**
 * Intent Grounder - AI-Powered Element Disambiguation
 *
 * Two-stage pipeline for mapping natural language queries to DOM elements:
 * 1. Intent Understanding: What does the user want to do?
 * 2. Element Grounding: Which element(s) match that intent?
 *
 * Combines multiple approaches:
 * - Accessibility tree (semantic understanding)
 * - Set-of-Mark prompting (visual grounding)
 * - Generated code context (for refinements)
 * - Multi-modal inputs (text + screenshot)
 */

class IntentGrounder {
  constructor(options = {}) {
    this.axExtractor = options.axExtractor || new AccessibilityTreeExtractor();
    this.somGenerator = options.somGenerator || new SetOfMarks();
    this.useVisualGrounding = options.useVisualGrounding !== false; // Default true
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
  }

  /**
   * Ground a user's natural language query to specific DOM elements
   * @param {string} userQuery - Natural language query
   * @param {Object} context - Context object
   * @param {number} context.tabId - Chrome tab ID
   * @param {Array} context.domElements - Existing DOM elements (optional)
   * @param {Object} context.generatedCode - Previously generated code (optional)
   * @param {string} context.screenshot - Page screenshot (optional)
   * @returns {Promise<Object>} Grounding result
   */
  async groundIntent(userQuery, context) {
    console.log(`🎯 [IntentGrounder] Grounding query: "${userQuery}"`);

    try {
      // Step 1: Gather all available element sources
      const elements = await this.gatherElements(context);
      console.log(`📋 [IntentGrounder] Gathered ${elements.length} total elements`);

      if (elements.length === 0) {
        return {
          success: false,
          error: 'No elements found on page',
          elements: []
        };
      }

      // Step 2: Create visual grounding (SoM) if screenshot available
      let markedScreenshot = null;
      if (this.useVisualGrounding && context.screenshot) {
        markedScreenshot = await this.somGenerator.createMarkedScreenshot(
          context.screenshot,
          elements.filter(el => el.boundingRect)
        );
        console.log(`🏷️  [IntentGrounder] Created Set-of-Mark screenshot`);
      }

      // Step 3: Call AI to ground intent
      const aiResult = await this.callGroundingAI(userQuery, elements, markedScreenshot, context);

      // Step 4: Process and validate results
      const result = this.processAIResult(aiResult, elements);

      console.log(`✅ [IntentGrounder] Grounding complete:`, {
        interpretation: result.interpretation,
        confidence: result.confidence,
        candidates: result.selectedElements.length,
        needsDisambiguation: result.needsDisambiguation
      });

      return {
        success: true,
        ...result
      };

    } catch (error) {
      console.error(`❌ [IntentGrounder] Error grounding intent:`, error);
      return {
        success: false,
        error: error.message,
        elements: []
      };
    }
  }

  /**
   * Gather elements from all available sources
   * Priority: DOM Database > Accessibility Tree > Generated Code
   *
   * Why this order?
   * 1. DOM Database: Works on ALL sites, even with poor accessibility (divs with onClick)
   * 2. Accessibility Tree: Supplements with semantic roles/labels (when available)
   * 3. Generated Code: Handles refinements of previously created elements
   *
   * @param {Object} context - Context with tabId, domElements, generatedCode
   * @returns {Promise<Array>} Combined element list
   */
  async gatherElements(context) {
    const allElements = [];
    const seenSelectors = new Set();

    // Source 1: DOM elements (PRIMARY - works on all sites, even poor a11y)
    if (context.domElements && context.domElements.length > 0) {
      context.domElements.forEach(el => {
        if (el.selector && !seenSelectors.has(el.selector)) {
          allElements.push({
            ...el,
            source: 'dom_database',
            // Normalize property names for consistent AI processing
            role: el.role || 'element',
            name: el.text || el.name || '',
            boundingRect: el.visual?.position || el.boundingRect
          });
          seenSelectors.add(el.selector);
        }
      });
      console.log(`📊 [IntentGrounder] Added ${context.domElements.length} elements from DOM database (primary)`);
    }

    // Source 2: Accessibility tree (SUPPLEMENTAL - enriches with semantic info)
    if (context.tabId) {
      try {
        const axTree = await this.axExtractor.extractAccessibilityTree(context.tabId);
        let newElements = 0;
        let enrichedElements = 0;

        axTree.forEach(node => {
          if (node.selector) {
            if (!seenSelectors.has(node.selector)) {
              // New element not in DOM database (rare, but possible)
              allElements.push({
                ...node,
                source: 'accessibility_tree'
              });
              seenSelectors.add(node.selector);
              newElements++;
            } else {
              // Element already exists - enrich with a11y semantic data
              const existing = allElements.find(el => el.selector === node.selector);
              if (existing) {
                // Add semantic role if missing
                if (!existing.role || existing.role === 'element') {
                  existing.role = node.role;
                }
                // Add accessible name if better than text content
                if (node.name && (!existing.name || existing.name.length < node.name.length)) {
                  existing.name = node.name;
                }
                existing.a11yEnriched = true;
                enrichedElements++;
              }
            }
          }
        });
        console.log(`📊 [IntentGrounder] A11y tree: +${newElements} new, ~${enrichedElements} enriched`);
      } catch (error) {
        console.warn(`⚠️  [IntentGrounder] Could not extract a11y tree (continuing with DOM only):`, error);
      }
    }

    // Source 3: Elements from generated code (for refinements)
    if (context.generatedCode) {
      const codeElements = this.extractElementsFromCode(context.generatedCode);
      codeElements.forEach(el => {
        if (el.selector && !seenSelectors.has(el.selector)) {
          allElements.push({
            ...el,
            source: 'generated_code'
          });
          seenSelectors.add(el.selector);
        }
      });
      console.log(`📊 [IntentGrounder] Added ${codeElements.length} elements from generated code`);
    }

    return allElements;
  }

  /**
   * Extract element references from generated code
   * @param {Object} generatedCode - Code object with variations
   * @returns {Array} Extracted elements
   */
  extractElementsFromCode(generatedCode) {
    const elements = [];
    const selectorPattern = /(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    const classPattern = /class\s*=\s*['"`]([^'"`]+)['"`]/g;
    const idPattern = /id\s*=\s*['"`]([^'"`]+)['"`]/g;
    const cssPattern = /(#[\w-]+|\.[\w-]+)/g;

    if (!generatedCode.variations) return elements;

    generatedCode.variations.forEach(variation => {
      const code = (variation.css || '') + ' ' + (variation.js || '');

      // Extract CSS selectors
      const cssMatches = code.match(cssPattern) || [];
      cssMatches.forEach(selector => {
        elements.push({
          selector: selector.trim(),
          name: selector.replace(/^[#.]/, ''),
          role: selector.startsWith('#') ? 'unique' : 'element',
          source: 'generated_code',
          fromCSS: true
        });
      });

      // Extract JS querySelector calls
      let match;
      while ((match = selectorPattern.exec(code)) !== null) {
        elements.push({
          selector: match[1],
          name: match[1],
          role: 'element',
          source: 'generated_code',
          fromJS: true
        });
      }
    });

    // Deduplicate
    const uniqueElements = Array.from(
      new Map(elements.map(el => [el.selector, el])).values()
    );

    return uniqueElements;
  }

  /**
   * Call AI to perform intent grounding
   * @param {string} userQuery - User's query
   * @param {Array} elements - Available elements
   * @param {string} markedScreenshot - SoM screenshot (optional)
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} AI response
   */
  async callGroundingAI(userQuery, elements, markedScreenshot, context) {
    // Create prompt using Set-of-Mark format
    const prompt = this.somGenerator.createPrompt(userQuery, elements, markedScreenshot);

    // Add context about generated code if refinement
    let contextSection = '';
    if (context.generatedCode) {
      contextSection = `\n\nCONTEXT: This is a refinement request. The user is modifying previously generated code. Elements marked with (generated_code) were created by that code and may not exist in the original DOM.`;
    }

    const fullPrompt = prompt.text + contextSection;

    console.log(`🤖 [IntentGrounder] Calling AI for grounding...`);
    console.log(`📝 [IntentGrounder] Prompt length: ${fullPrompt.length} chars`);
    console.log(`🖼️  [IntentGrounder] Has screenshot: ${!!prompt.image}`);

    // Send message to service worker to call AI
    const response = await chrome.runtime.sendMessage({
      type: 'CALL_AI_FOR_GROUNDING',
      prompt: fullPrompt,
      screenshot: prompt.image,
      hasScreenshot: prompt.hasImage
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'AI grounding call failed');
    }

    return response.result;
  }

  /**
   * Process AI result and validate
   * @param {Object} aiResult - Raw AI response
   * @param {Array} elements - Original elements array
   * @returns {Object} Processed result
   */
  processAIResult(aiResult, elements) {
    // Parse SoM response
    const parsed = this.somGenerator.parseResponse(aiResult, elements);

    // Validate confidence threshold
    const needsDisambiguation = parsed.needsDisambiguation ||
                                 parsed.confidence < this.confidenceThreshold ||
                                 (parsed.selectedElements.length > 1 && parsed.confidence < 0.9);

    return {
      interpretation: parsed.interpretation,
      confidence: parsed.confidence,
      selectedElements: parsed.selectedElements,
      needsDisambiguation,
      reasoning: parsed.reasoning,
      allCandidates: parsed.selectedElements // For disambiguation UI
    };
  }

  /**
   * Set confidence threshold
   * @param {number} threshold - 0.0-1.0
   */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
    console.log(`⚙️  [IntentGrounder] Confidence threshold set to ${this.confidenceThreshold}`);
  }

  /**
   * Clear cache (call when page changes)
   * @param {number} tabId - Optional tab ID
   */
  clearCache(tabId = null) {
    this.axExtractor.clearCache(tabId);
  }
}

// Export
if (typeof window !== 'undefined') {
  window.IntentGrounder = IntentGrounder;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntentGrounder;
}
