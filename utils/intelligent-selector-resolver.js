/**
 * IntelligentSelectorResolver - Determines refinement vs. new feature intent
 *
 * Purpose: Analyze whether user wants to:
 * - REFINE existing elements (preserve selectors)
 * - ADD new features (use element database)
 * - AMBIGUOUS (ask for clarification)
 *
 * Key principle: AI should be flexible enough to handle course changes,
 * but smart enough to preserve selectors when refining.
 */

class IntelligentSelectorResolver {
  constructor() {
    this.INTENT_TYPES = {
      REFINEMENT: 'REFINEMENT',
      NEW_FEATURE: 'NEW_FEATURE',
      COURSE_REVERSAL: 'COURSE_REVERSAL',
      AMBIGUOUS: 'AMBIGUOUS'
    };

    this.REFINEMENT_TYPES = {
      INCREMENTAL: 'incremental',    // Add to existing code
      FULL_REWRITE: 'full_rewrite'   // Replace existing code
    };
  }

  /**
   * Main entry point: Resolve user intent
   */
  async resolveUserIntent(params) {
    const {
      userRequest,
      workingCode,
      elementDatabase,
      conversationHistory = []
    } = params;

    console.log('🔍 [SelectorResolver] Analyzing user intent...');

    try {
      // Analyze intent using AI
      const analysis = await this.analyzeIntent(
        userRequest,
        workingCode,
        conversationHistory
      );

      console.log('✅ [SelectorResolver] Intent analyzed:', {
        type: analysis.type,
        confidence: analysis.confidence,
        refinementType: analysis.refinementType
      });

      // Convert analysis to strategy
      return this.convertToStrategy(analysis, workingCode, elementDatabase);

    } catch (error) {
      console.error('❌ [SelectorResolver] Analysis failed:', error);

      // Fallback: Safe default strategy
      return this.getFallbackStrategy(workingCode);
    }
  }

  /**
   * Analyze intent using AI
   */
  async analyzeIntent(userRequest, workingCode, conversationHistory) {
    const prompt = this.buildIntentPrompt(userRequest, workingCode, conversationHistory);

    try {
      const response = await this.callAI(prompt);
      const parsed = this.parseIntentResponse(response);

      return parsed;

    } catch (error) {
      console.error('❌ Intent analysis failed:', error);
      throw error;
    }
  }

  /**
   * Build intent analysis prompt
   */
  buildIntentPrompt(userRequest, workingCode, conversationHistory) {
    const currentSelectors = this.extractSelectorsFromCode(workingCode);
    const recentHistory = conversationHistory.slice(-3).map(msg =>
      `${msg.role.toUpperCase()}: ${msg.content.substring(0, 100)}`
    ).join('\n');

    const prompt = `Analyze this user request and determine their intent.

CURRENT CODE USES THESE SELECTORS: ${currentSelectors.join(', ')}

RECENT CONVERSATION:
${recentHistory || 'No previous conversation'}

NEW REQUEST: "${userRequest}"

Classify this request:

1. REFINEMENT (modifying existing code):
   Examples:
   - "Make it darker" → modifying existing color
   - "Change text to X" → modifying existing text
   - "Move it 10px down" → modifying existing position
   - "Also add Y" → adding to existing element

2. NEW_FEATURE (adding something new):
   Examples:
   - "Add a countdown timer above the form"
   - "Hide the footer"
   - "Show social proof badges"
   - User mentions elements NOT in current selectors

3. COURSE_REVERSAL (explicitly abandoning previous work):
   Examples:
   - "Forget the button, add a banner instead"
   - "Actually, redo this completely different"
   - "Start over with X"
   - "Completely change approach"

4. AMBIGUOUS (could be either):
   Examples:
   - "Change the button" (which button?)
   - "Make it bigger" (what is "it"?)
   - Unclear references

Also determine refinement type:
- INCREMENTAL: User wants to ADD to existing code (most common)
- FULL_REWRITE: User explicitly wants to REPLACE existing code

Respond with JSON ONLY (no markdown):
{
  "type": "REFINEMENT|NEW_FEATURE|COURSE_REVERSAL|AMBIGUOUS",
  "confidence": 0-100,
  "refinementType": "incremental|full_rewrite",
  "referencedElements": ["button", "headline"],
  "reasoning": "Brief explanation",
  "clarificationNeeded": {
    "question": "Which button do you mean?",
    "options": ["The CTA button I modified", "A different button"]
  }
}

Guidelines:
- confidence > 80: Proceed without clarification
- confidence 50-80: Consider clarification if high-risk
- confidence < 50: MUST ask for clarification
- Default to "incremental" unless user explicitly requests rewrite
- If "it", "this", "that" without clear antecedent → AMBIGUOUS
`;

    return prompt;
  }

  /**
   * Call AI for intent analysis
   */
  async callAI(prompt) {
    // Get API settings
    const settings = await chrome.storage.local.get(['settings']);
    const apiKey = settings.settings?.anthropicApiKey;

    if (!apiKey) {
      throw new Error('No API key configured');
    }

    // Use fast model for intent analysis
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Fast, cheap model
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`AI call failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse AI intent response
   */
  parseIntentResponse(responseText) {
    try {
      let cleaned = responseText.trim();

      // Remove markdown code blocks
      if (cleaned.includes('```')) {
        const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (match) {
          cleaned = match[1].trim();
        }
      }

      // Extract JSON
      const startIndex = cleaned.indexOf('{');
      const lastIndex = cleaned.lastIndexOf('}');

      if (startIndex !== -1 && lastIndex !== -1) {
        cleaned = cleaned.substring(startIndex, lastIndex + 1);
      }

      // Parse JSON
      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.type || !parsed.confidence) {
        throw new Error('Invalid response structure');
      }

      // Default refinementType if missing
      if (!parsed.refinementType) {
        parsed.refinementType = this.REFINEMENT_TYPES.INCREMENTAL;
      }

      return parsed;

    } catch (error) {
      console.error('❌ Failed to parse intent response:', error);
      console.error('Response:', responseText.substring(0, 300));
      throw new Error('Failed to parse intent analysis');
    }
  }

  /**
   * Convert analysis to actionable strategy
   */
  convertToStrategy(analysis, workingCode, elementDatabase) {
    const {
      type,
      confidence,
      refinementType,
      referencedElements,
      clarificationNeeded,
      reasoning
    } = analysis;

    // Check if clarification needed
    if (type === this.INTENT_TYPES.AMBIGUOUS || confidence < 50) {
      return {
        needsClarification: true,
        question: this.buildClarificationQuestion(analysis, workingCode)
      };
    }

    // Course reversal: Start fresh
    if (type === this.INTENT_TYPES.COURSE_REVERSAL) {
      return {
        strategy: 'USE_ELEMENT_DATABASE',
        refinementType: this.REFINEMENT_TYPES.FULL_REWRITE,
        targetElements: [],
        reasoning: reasoning || 'User requested course reversal',
        needsClarification: false
      };
    }

    // New feature: Use element database
    if (type === this.INTENT_TYPES.NEW_FEATURE) {
      return {
        strategy: 'USE_ELEMENT_DATABASE',
        refinementType: this.REFINEMENT_TYPES.INCREMENTAL,
        targetElements: referencedElements || [],
        reasoning: reasoning || 'User adding new features',
        needsClarification: false
      };
    }

    // Refinement: Preserve selectors
    if (type === this.INTENT_TYPES.REFINEMENT) {
      return {
        strategy: 'PRESERVE_SELECTORS',
        refinementType: refinementType || this.REFINEMENT_TYPES.INCREMENTAL,
        targetElements: this.extractSelectorsFromCode(workingCode),
        reasoning: reasoning || 'User refining existing code',
        needsClarification: false
      };
    }

    // Fallback
    return this.getFallbackStrategy(workingCode);
  }

  /**
   * Build clarification question for UI
   */
  buildClarificationQuestion(analysis, workingCode) {
    const currentSelectors = this.extractSelectorsFromCode(workingCode);

    // Use AI's clarification if available
    if (analysis.clarificationNeeded && analysis.clarificationNeeded.question) {
      return {
        message: analysis.clarificationNeeded.question,
        options: analysis.clarificationNeeded.options || [
          'Modify existing elements',
          'Work with different elements'
        ]
      };
    }

    // Generate generic clarification
    const currentElements = this.formatSelectorsForDisplay(currentSelectors);

    return {
      message: `I want to make sure I understand correctly:`,
      options: [
        {
          label: `Modify the existing ${currentElements} that I already changed`,
          value: 'REFINEMENT',
          context: 'Will preserve existing selectors and only update what you mentioned'
        },
        {
          label: `Work with a different element on the page`,
          value: 'NEW_FEATURE',
          context: 'Will search the page for new elements matching your description'
        }
      ]
    };
  }

  /**
   * Get fallback strategy when analysis fails
   */
  getFallbackStrategy(workingCode) {
    const selectors = this.extractSelectorsFromCode(workingCode);

    if (selectors.length > 0) {
      // Default to preserving selectors (safest)
      return {
        strategy: 'PRESERVE_SELECTORS',
        refinementType: this.REFINEMENT_TYPES.INCREMENTAL,
        targetElements: selectors,
        reasoning: 'Fallback: Preserving existing selectors',
        needsClarification: false
      };
    } else {
      // No existing code, use element database
      return {
        strategy: 'USE_ELEMENT_DATABASE',
        refinementType: this.REFINEMENT_TYPES.INCREMENTAL,
        targetElements: [],
        reasoning: 'Fallback: No existing code to preserve',
        needsClarification: false
      };
    }
  }

  /**
   * Extract selectors from code
   */
  extractSelectorsFromCode(code) {
    const selectors = new Set();

    if (!code || !code.variations) {
      return Array.from(selectors);
    }

    code.variations.forEach(variation => {
      const fullCode = (variation.css || '') + (variation.js || '');

      // Match CSS selectors
      const cssMatches = fullCode.match(/([.#][\w-]+(?:[.#][\w-]+)*)/g) || [];
      cssMatches.forEach(s => selectors.add(s));

      // Match querySelector calls
      const jsMatches = fullCode.match(/querySelector(?:All)?\(['"`]([^'"`]+)['"`]\)/g) || [];
      jsMatches.forEach(match => {
        const selector = match.match(/['"`]([^'"`]+)['"`]/)[1];
        selectors.add(selector);
      });
    });

    return Array.from(selectors);
  }

  /**
   * Format selectors for user-friendly display
   */
  formatSelectorsForDisplay(selectors) {
    if (selectors.length === 0) {
      return 'elements';
    }

    if (selectors.length === 1) {
      return this.simplifySelector(selectors[0]);
    }

    return `${selectors.length} elements`;
  }

  /**
   * Simplify selector for display
   */
  simplifySelector(selector) {
    // Remove complex parts, keep meaningful identifiers
    if (selector.includes('#')) {
      return selector.split('#')[1].split('.')[0].split('[')[0];
    }

    if (selector.includes('.')) {
      return selector.split('.').slice(-1)[0].split('[')[0];
    }

    return selector;
  }

  /**
   * Extract element descriptions from working code
   */
  extractElementDescriptions(workingCode) {
    const selectors = this.extractSelectorsFromCode(workingCode);
    return selectors.map(s => this.simplifySelector(s));
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.IntelligentSelectorResolver = IntelligentSelectorResolver;
}
