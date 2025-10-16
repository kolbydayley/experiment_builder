/**
 * Intent Analyzer - Lightweight AI service for understanding user requests
 *
 * Purpose: Analyze user messages to determine:
 * - What type of change is requested
 * - What page data is needed
 * - What elements to target
 * - What context to include
 *
 * This dramatically reduces request size by only fetching necessary data.
 */
class IntentAnalyzer {
  constructor() {
    this.INTENT_TYPES = {
      CHANGE_TEXT: 'change_text',
      CHANGE_COLOR: 'change_color',
      CHANGE_STYLE: 'change_style',
      HIDE_ELEMENT: 'hide_element',
      SHOW_ELEMENT: 'show_element',
      ADD_ELEMENT: 'add_element',
      REMOVE_ELEMENT: 'remove_element',
      LAYOUT_CHANGE: 'layout_change',
      INTERACTIVE: 'interactive',
      MULTIPLE: 'multiple',
      UNCLEAR: 'unclear'
    };

    this.CONTEXT_RADIUS = {
      SELF: 'self',           // Just the target element
      DESCENDANTS: 'descendants',  // Element + children
      SIBLINGS: 'siblings',     // Element + adjacent elements
      ANCESTORS: 'ancestors',   // Element + parent chain
      SECTION: 'section',      // Element + surrounding section
      GLOBAL: 'global'         // Full page context
    };

    this.PAGE_CONTEXT = {
      MINIMAL: 'minimal',      // Just selectors
      MODERATE: 'moderate',    // Selectors + key properties
      FULL: 'full'            // All element data
    };
  }

  /**
   * Analyze user intent for initial request
   */
  async analyzeIntent(params) {
    const {
      message,
      workflowState,
      elementAttachment,
      pageDataAvailable
    } = params;

    console.log('🔍 [Intent Analyzer] Analyzing user intent...');
    console.log(`  Message: "${message.substring(0, 60)}..."`);
    console.log(`  State: ${workflowState}`);
    console.log(`  Has element: ${!!elementAttachment}`);

    // Build lightweight prompt
    const prompt = this.buildIntentPrompt(message, elementAttachment, pageDataAvailable);

    try {
      // Call AI with minimal context
      const response = await this.callAI(prompt);

      // Parse and validate response
      const analysis = this.parseIntentResponse(response);

      console.log('✅ [Intent Analyzer] Analysis complete:', {
        intent: analysis.intent,
        needsScreenshot: analysis.scope.needsScreenshot,
        targetElements: analysis.scope.targetElements.length,
        contextRadius: analysis.scope.contextRadius
      });

      return analysis;
    } catch (error) {
      console.error('❌ [Intent Analyzer] Failed:', error);

      // Fallback to safe defaults
      return this.getDefaultAnalysis(message, elementAttachment);
    }
  }

  /**
   * Analyze refinement request (chat-initiated changes)
   */
  async analyzeRefinement(params) {
    const {
      message,
      elementAttachment,
      currentCode,
      chatHistory
    } = params;

    console.log('🔄 [Intent Analyzer] Analyzing refinement request...');

    // Extract current selectors from code
    const currentSelectors = this.extractSelectorsFromCode(currentCode);

    // Build refinement-specific prompt
    const prompt = this.buildRefinementPrompt(
      message,
      elementAttachment,
      currentSelectors,
      chatHistory
    );

    try {
      const response = await this.callAI(prompt);
      const analysis = this.parseIntentResponse(response);

      // For refinements, default to minimal context
      analysis.scope.needsScreenshot = false;
      analysis.dataRequirements.pageContext = this.PAGE_CONTEXT.MINIMAL;

      // Phase 2.1: Ensure refinementType is set (default to incremental if missing)
      if (!analysis.refinementType) {
        analysis.refinementType = 'incremental';
        console.log('⚠️ [Intent Analyzer] refinementType missing, defaulting to incremental');
      }

      // Visual QA check: Ensure needsVisualQA is set (default to false for simple refinements)
      if (analysis.needsVisualQA === undefined) {
        analysis.needsVisualQA = false;
        console.log('⚠️ [Intent Analyzer] needsVisualQA missing, defaulting to false (skip Visual QA)');
      }

      console.log('✅ [Intent Analyzer] Refinement analysis:', {
        intent: analysis.intent,
        refinementType: analysis.refinementType,
        needsVisualQA: analysis.needsVisualQA,
        targetElements: analysis.scope.targetElements
      });

      return analysis;
    } catch (error) {
      console.error('❌ [Intent Analyzer] Refinement analysis failed:', error);

      // Fallback: assume modifying current selectors
      return {
        intent: this.INTENT_TYPES.MULTIPLE,
        refinementType: 'incremental', // Phase 2.1: Default to incremental
        needsVisualQA: false, // Visual QA: Skip for simple refinements
        scope: {
          needsScreenshot: false,
          needsVisuals: false,
          targetElements: currentSelectors,
          contextRadius: this.CONTEXT_RADIUS.SELF
        },
        dataRequirements: {
          elementProperties: ['selector'],
          pageContext: this.PAGE_CONTEXT.MINIMAL
        },
        reasoning: 'Refinement - modifying existing code'
      };
    }
  }

  /**
   * Build intent analysis prompt
   */
  buildIntentPrompt(message, elementAttachment, pageDataAvailable) {
    let prompt = `Analyze this user request and determine what page data is needed to fulfill it.

USER REQUEST: "${message}"
`;

    if (elementAttachment) {
      prompt += `\nSELECTED ELEMENT: ${elementAttachment.tag}${elementAttachment.id ? '#' + elementAttachment.id : ''}${elementAttachment.classes ? '.' + elementAttachment.classes[0] : ''}
TEXT: "${elementAttachment.text?.substring(0, 50) || 'none'}"
`;
    }

    if (!pageDataAvailable) {
      prompt += `\nNOTE: No page data captured yet - this is a generic request.
`;
    }

    prompt += `
Respond with JSON ONLY (no markdown, no explanation):
{
  "intent": "change_text|change_color|change_style|hide_element|show_element|add_element|remove_element|layout_change|interactive|multiple|unclear",
  "scope": {
    "needsScreenshot": true/false,
    "needsVisuals": true/false,
    "targetElements": ["selector1", "selector2"],
    "contextRadius": "self|descendants|siblings|ancestors|section|global"
  },
  "dataRequirements": {
    "elementProperties": ["selector", "text", "color", "size", "position", "background", "structure"],
    "pageContext": "minimal|moderate|full"
  },
  "reasoning": "Brief explanation"
}

Guidelines:
- "needsScreenshot": true ONLY for brand/design matching (e.g., "match the page style")
- "needsVisuals": true if color/visual info needed, false for text-only changes
- "targetElements": Specific selectors mentioned or implied (use element attachment if provided)
- "contextRadius": How much surrounding context is needed
- "elementProperties": Only properties needed for this change
- "pageContext": minimal for simple changes, moderate for complex, full for major redesigns

Examples:
"Change the button to blue" → needsScreenshot: false, targetElements: [button selector], properties: ["selector", "color"]
"Make it match the page design" → needsScreenshot: true, contextRadius: "global"
"Hide the popup" → needsScreenshot: false, targetElements: [popup selector], properties: ["selector"]
`;

    return prompt;
  }

  /**
   * Build refinement-specific prompt
   */
  buildRefinementPrompt(message, elementAttachment, currentSelectors, chatHistory) {
    const recentHistory = chatHistory.slice(-3).map(msg =>
      `${msg.role.toUpperCase()}: ${msg.content.substring(0, 100)}`
    ).join('\n');

    let prompt = `This is a REFINEMENT to existing code. Analyze what needs to change.

CURRENT CODE USES THESE SELECTORS: ${currentSelectors.join(', ')}

RECENT CONVERSATION:
${recentHistory}

NEW REQUEST: "${message}"
`;

    if (elementAttachment) {
      prompt += `\nNEW ELEMENT SELECTED: ${elementAttachment.selector || elementAttachment.tag}
`;
    }

    prompt += `
🔴 PHASE 2.1: DETECT REFINEMENT TYPE

Analyze whether this is an INCREMENTAL change or FULL REWRITE:

INCREMENTAL (most common):
- "add this"
- "make it more prominent"
- "change the color to X"
- "also add Y"
- User wants to KEEP existing code and ADD new changes

FULL REWRITE (explicit user intent):
- "completely redo this"
- "start over with X"
- "rebuild from scratch"
- "totally change the approach"
- "forget everything and do Y instead"
- User explicitly wants to REPLACE existing code

🔍 VISUAL QA ANALYSIS:

Does this refinement require new Visual QA (element selection with screenshot)?

**REQUIRES Visual QA (needsVisualQA: true):**
- Adding NEW elements not in current code (e.g., "add a banner above the button")
- Modifying DIFFERENT element than existing code targets
- User explicitly mentions selecting/targeting a new element
- Complex layout changes affecting multiple new elements

**SKIP Visual QA (needsVisualQA: false):**
- Modifying SAME elements already in code (e.g., "make button bigger", "change color")
- Pure CSS changes (colors, sizes, spacing, fonts)
- Text content changes to existing elements
- Simple style refinements to existing elements

Respond with JSON ONLY:
{
  "intent": "change_text|change_color|...",
  "refinementType": "incremental" or "full_rewrite",
  "needsVisualQA": true or false,
  "scope": {
    "needsScreenshot": false,
    "needsVisuals": true/false,
    "targetElements": ["selector1"],
    "contextRadius": "self"
  },
  "dataRequirements": {
    "elementProperties": ["selector"],
    "pageContext": "minimal"
  },
  "reasoning": "What changed, why incremental/full_rewrite, and why Visual QA is/isn't needed"
}

For refinements:
- needsScreenshot is always false (we already have page screenshot)
- needsVisualQA should be FALSE for simple refinements to existing elements
- refinementType defaults to "incremental" unless user EXPLICITLY requests rewrite
- targetElements should be from current selectors OR new element if different
- contextRadius is usually "self" unless layout changes
- pageContext is usually "minimal"
`;

    return prompt;
  }

  /**
   * Call AI with minimal prompt (fast model)
   */
  async callAI(prompt) {
    // Get API settings
    const settings = await chrome.storage.local.get(['settings']);
    const apiKey = settings.settings?.anthropicApiKey;

    if (!apiKey) {
      throw new Error('No API key configured');
    }

    // Use fast, cheap model for intent analysis
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
      throw new Error(`API call failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse AI response into structured analysis
   */
  parseIntentResponse(responseText) {
    try {
      let cleaned = responseText.trim();

      // STEP 1: Try to extract from markdown code blocks first
      let extractedFromCodeBlock = false;
      if (cleaned.includes('```')) {
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          cleaned = codeBlockMatch[1].trim();
          console.log('📦 [Intent Analyzer] Extracted JSON from code block');
          extractedFromCodeBlock = true;
        }
      }

      // STEP 2: If no code block, extract JSON object from text
      // Find first '{' and last MATCHING '}' to extract just the JSON portion
      // This handles cases where AI adds explanatory text before or after JSON
      if (!extractedFromCodeBlock) {
        const startIndex = cleaned.indexOf('{');
        if (startIndex === -1) {
          throw new Error('No JSON object found in response');
        }

        // Find matching closing brace
        let braceCount = 0;
        let endIndex = -1;
        for (let i = startIndex; i < cleaned.length; i++) {
          if (cleaned[i] === '{') braceCount++;
          if (cleaned[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }

        if (endIndex === -1) {
          throw new Error('Malformed JSON - no matching closing brace');
        }

        // Only extract if there's text before or after the JSON
        if (startIndex > 0 || endIndex < cleaned.length - 1) {
          const extractedJSON = cleaned.substring(startIndex, endIndex + 1);
          console.log(`🔪 [Intent Analyzer] Extracted JSON from position ${startIndex} to ${endIndex} (removed ${startIndex + (cleaned.length - endIndex - 1)} extra chars)`);
          cleaned = extractedJSON;
        }
      }

      // STEP 3: Fix unescaped newlines in JSON strings
      // AI sometimes puts literal newlines in strings which breaks JSON.parse
      cleaned = cleaned.replace(/"([^"]*(?:\n[^"]*)*)"(?=\s*[,}:])/g, (match, content) => {
        return `"${content.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}"`;
      });

      // STEP 3.5: Remove trailing commas (AI sometimes adds them)
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

      // STEP 4: Parse JSON
      const analysis = JSON.parse(cleaned);

      // STEP 5: Validate structure
      if (!analysis.intent || !analysis.scope || !analysis.dataRequirements) {
        throw new Error('Invalid response structure - missing required fields');
      }

      console.log('✅ [Intent Analyzer] Successfully parsed intent response');
      return analysis;
    } catch (error) {
      console.error('[Intent Analyzer] Parse error:', error);
      console.error('Response text:', responseText);
      console.error('First 200 chars:', responseText.substring(0, 200));
      console.error('Last 200 chars:', responseText.substring(Math.max(0, responseText.length - 200)));
      throw new Error('Failed to parse intent analysis');
    }
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

  /**
   * Get default analysis when AI fails
   */
  getDefaultAnalysis(message, elementAttachment) {
    const hasElement = !!elementAttachment;

    return {
      intent: this.INTENT_TYPES.UNCLEAR,
      scope: {
        needsScreenshot: !hasElement, // Need screenshot if no specific element
        needsVisuals: true,
        targetElements: hasElement ? [elementAttachment.selector] : [],
        contextRadius: hasElement ? this.CONTEXT_RADIUS.DESCENDANTS : this.CONTEXT_RADIUS.GLOBAL
      },
      dataRequirements: {
        elementProperties: ['selector', 'text', 'color', 'background', 'size', 'position'],
        pageContext: this.PAGE_CONTEXT.MODERATE
      },
      reasoning: 'Fallback analysis - using safe defaults'
    };
  }
}
