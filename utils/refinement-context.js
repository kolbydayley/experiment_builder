/**
 * RefinementContext - Manages stateful code refinement with validation
 *
 * Purpose: Prevent code degeneration during chat-based refinements by:
 * - Preserving element database across iterations
 * - Validating code before applying to page
 * - Automatically rolling back on failure
 * - Maintaining conversation context
 *
 * Key principle: User should NEVER see broken code
 */

class RefinementContext {
  constructor(options = {}) {
    // Immutable reference data (from initial page capture)
    this.elementDatabase = options.elementDatabase || null;
    this.pageData = options.pageData || null;
    this.tabId = options.tabId || null;

    // Working state (updated on successful refinement)
    this.workingCode = options.workingCode || null;
    this.lastValidatedCode = null; // Snapshot before each attempt

    // Tracking and history
    this.appliedSelectors = new Set();
    this.validationHistory = [];
    this.conversationHistory = options.conversationHistory || [];

    // Dependencies
    this.selectorResolver = null; // Will be initialized lazily

    // Constants
    this.MAX_VALIDATION_ATTEMPTS = 3;
    this.VALIDATION_TIMEOUT = 10000; // 10 seconds

    console.log('📦 [RefinementContext] Initialized', {
      hasElementDatabase: !!this.elementDatabase,
      hasWorkingCode: !!this.workingCode,
      elementCount: this.elementDatabase?.elements?.length || 0
    });

    // Extract selectors from working code
    if (this.workingCode) {
      this.extractAndTrackSelectors(this.workingCode);
    }
  }

  /**
   * Main entry point for code refinement
   */
  async refineCode(userRequest, options = {}) {
    console.log('🔄 [RefinementContext] Starting refinement:', userRequest.substring(0, 60) + '...');

    try {
      // Step 1: Verify selectors still exist on page
      const selectorCheck = await this.verifySelectorsStillExist();
      if (!selectorCheck.valid) {
        return {
          success: false,
          error: 'Page has changed since capture',
          details: selectorCheck,
          suggestion: 'Re-capture the page or update selectors'
        };
      }

      // Step 2: Analyze user intent (refinement vs. new feature vs. ambiguous)
      const intent = await this.analyzeRefinementIntent(userRequest, options);

      // Step 3: Handle based on intent
      if (intent.needsClarification) {
        return {
          needsClarification: true,
          question: intent.question
        };
      }

      // Step 4: Snapshot current working state (for rollback)
      this.snapshotWorkingState();

      // Step 5: Generate code with validation loop
      const result = await this.generateWithValidation(userRequest, intent, options);

      if (result.success) {
        // Update working code
        this.workingCode = result.code;
        this.extractAndTrackSelectors(result.code);

        // Clear validation history on success
        this.validationHistory = [];

        console.log('✅ [RefinementContext] Refinement successful');
        return {
          success: true,
          code: result.code,
          confidence: result.confidence || 0,
          metadata: result.metadata
        };
      } else {
        // Validation failed - rollback
        console.warn('⚠️ [RefinementContext] Validation failed, rolling back');
        this.rollback();

        return {
          success: false,
          error: result.error || 'Code validation failed',
          rolledBack: true,
          diagnostics: result.diagnostics,
          workingCodeRestored: true
        };
      }

    } catch (error) {
      console.error('❌ [RefinementContext] Refinement error:', error);

      // Automatic rollback on ANY error
      this.rollback();

      return {
        success: false,
        error: error.message,
        rolledBack: true,
        workingCodeRestored: true
      };
    }
  }

  /**
   * Validate code before applying (retry up to MAX_VALIDATION_ATTEMPTS)
   */
  async generateWithValidation(userRequest, intent, options = {}) {
    let prompt = this.buildRefinementPrompt(userRequest, intent, options);
    let lastError = null;

    for (let attempt = 1; attempt <= this.MAX_VALIDATION_ATTEMPTS; attempt++) {
      console.log(`🔄 [RefinementContext] Validation attempt ${attempt}/${this.MAX_VALIDATION_ATTEMPTS}`);

      try {
        // Generate code
        const generated = await this.callAI(prompt, options);

        // Validate before returning
        const validation = await this.validateCode(generated.code);

        if (validation.passed) {
          console.log(`✅ [RefinementContext] Validation passed on attempt ${attempt}`);

          return {
            success: true,
            code: generated.code,
            confidence: generated.confidence || validation.confidence || 0,
            metadata: {
              attempts: attempt,
              validationPassed: true,
              usage: generated.usage
            }
          };
        }

        // Validation failed - log and retry
        console.warn(`⚠️ [RefinementContext] Validation failed on attempt ${attempt}:`, validation.errors);

        this.validationHistory.push({
          attempt,
          errors: validation.errors,
          warnings: validation.warnings,
          timestamp: Date.now()
        });

        lastError = validation;

        // Don't retry on last attempt
        if (attempt === this.MAX_VALIDATION_ATTEMPTS) {
          break;
        }

        // Feed errors back to AI for auto-correction
        prompt = this.buildCorrectionPrompt(prompt, validation);

      } catch (error) {
        console.error(`❌ [RefinementContext] Generation attempt ${attempt} failed:`, error);
        lastError = { errors: [error.message] };

        // Don't retry on last attempt
        if (attempt === this.MAX_VALIDATION_ATTEMPTS) {
          break;
        }
      }
    }

    // All attempts failed
    console.error('❌ [RefinementContext] All validation attempts failed');

    return {
      success: false,
      error: 'Code validation failed after ' + this.MAX_VALIDATION_ATTEMPTS + ' attempts',
      diagnostics: this.validationHistory,
      lastError: lastError
    };
  }

  /**
   * Validate generated code
   */
  async validateCode(code) {
    console.log('🔍 [RefinementContext] Validating generated code...');

    const errors = [];
    const warnings = [];

    try {
      // Validation 1: Check all selectors exist in element database
      const selectorValidation = this.validateSelectors(code);
      errors.push(...selectorValidation.errors);
      warnings.push(...selectorValidation.warnings);

      // Validation 2: Syntax check
      const syntaxValidation = this.validateSyntax(code);
      errors.push(...syntaxValidation.errors);

      // Validation 3: Check for conflicts with existing code
      const conflictValidation = this.validateNoConflicts(code);
      warnings.push(...conflictValidation.warnings);

      // Validation 4: Runtime test (if tabId available)
      if (this.tabId) {
        try {
          const runtimeValidation = await this.validateRuntime(code);
          errors.push(...runtimeValidation.errors);
          warnings.push(...runtimeValidation.warnings);
        } catch (error) {
          console.warn('⚠️ Runtime validation failed:', error.message);
          warnings.push({
            type: 'RUNTIME_VALIDATION_FAILED',
            message: 'Could not test code execution: ' + error.message
          });
        }
      }

      const passed = errors.length === 0;
      const confidence = passed ? Math.max(0, 100 - warnings.length * 5) : 0;

      console.log(`🔍 [RefinementContext] Validation result: ${passed ? 'PASSED' : 'FAILED'}`, {
        errors: errors.length,
        warnings: warnings.length,
        confidence
      });

      return {
        passed,
        errors,
        warnings,
        confidence
      };

    } catch (error) {
      console.error('❌ [RefinementContext] Validation error:', error);

      return {
        passed: false,
        errors: [{
          type: 'VALIDATION_ERROR',
          message: error.message
        }],
        warnings: [],
        confidence: 0
      };
    }
  }

  /**
   * Validate selectors exist in element database
   */
  validateSelectors(code) {
    const errors = [];
    const warnings = [];

    if (!this.elementDatabase || !this.elementDatabase.elements) {
      warnings.push({
        type: 'NO_ELEMENT_DATABASE',
        message: 'No element database available for validation'
      });
      return { errors, warnings };
    }

    // Extract all selectors from code
    const selectorsInCode = this.extractSelectorsFromCode(code);
    const validSelectors = new Set(
      this.elementDatabase.elements.map(el => el.selector)
    );

    console.log('🔍 [RefinementContext] Validating selectors:', {
      found: selectorsInCode.length,
      valid: validSelectors.size
    });

    for (const selector of selectorsInCode) {
      if (!validSelectors.has(selector)) {
        // Check if it's a close match (typo)
        const closestMatch = this.findClosestSelector(selector, Array.from(validSelectors));

        errors.push({
          type: 'SELECTOR_NOT_FOUND',
          selector: selector,
          message: `Selector "${selector}" not found in element database`,
          suggestion: closestMatch ? `Did you mean "${closestMatch}"?` : 'Check element database for valid selectors'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate syntax (basic checks)
   */
  validateSyntax(code) {
    const errors = [];

    // Validate CSS syntax
    if (code.variations) {
      code.variations.forEach((variation, idx) => {
        if (variation.css) {
          const cssErrors = this.validateCSSSyntax(variation.css);
          cssErrors.forEach(err => {
            errors.push({
              type: 'CSS_SYNTAX_ERROR',
              variation: idx + 1,
              ...err
            });
          });
        }

        // Validate JS syntax
        if (variation.js) {
          const jsErrors = this.validateJSSyntax(variation.js);
          jsErrors.forEach(err => {
            errors.push({
              type: 'JS_SYNTAX_ERROR',
              variation: idx + 1,
              ...err
            });
          });
        }
      });
    }

    return { errors };
  }

  /**
   * Validate CSS syntax
   */
  validateCSSSyntax(css) {
    const errors = [];

    // Basic brace matching
    const openBraces = (css.match(/{/g) || []).length;
    const closeBraces = (css.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      errors.push({
        message: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
        line: 0
      });
    }

    return errors;
  }

  /**
   * Validate JS syntax
   */
  validateJSSyntax(js) {
    const errors = [];

    try {
      // Use Function constructor to check syntax (doesn't execute)
      new Function(js);
    } catch (error) {
      errors.push({
        message: error.message,
        line: 0 // TODO: Parse line number from error
      });
    }

    return errors;
  }

  /**
   * Check for conflicts with existing code
   */
  validateNoConflicts(code) {
    const warnings = [];

    if (!this.workingCode) {
      return { warnings };
    }

    // Check for duplicate selectors
    const newSelectors = this.extractSelectorsFromCode(code);
    const existingSelectors = this.extractSelectorsFromCode(this.workingCode);

    const duplicates = newSelectors.filter(s => existingSelectors.includes(s));

    if (duplicates.length > 0) {
      warnings.push({
        type: 'DUPLICATE_SELECTORS',
        selectors: duplicates,
        message: `These selectors appear in both old and new code: ${duplicates.join(', ')}`,
        suggestion: 'This may cause conflicts. Review carefully.'
      });
    }

    return { warnings };
  }

  /**
   * Validate code execution at runtime
   */
  async validateRuntime(code) {
    const errors = [];
    const warnings = [];

    try {
      // Send test execution message to content script
      const response = await chrome.tabs.sendMessage(this.tabId, {
        type: 'TEST_CODE_VALIDATION',
        code: code,
        timeout: this.VALIDATION_TIMEOUT
      });

      if (response.errors && response.errors.length > 0) {
        response.errors.forEach(err => {
          errors.push({
            type: 'RUNTIME_ERROR',
            message: err.message || err,
            stack: err.stack
          });
        });
      }

      if (response.warnings && response.warnings.length > 0) {
        warnings.push(...response.warnings);
      }

    } catch (error) {
      console.warn('⚠️ Runtime validation skipped:', error.message);
      // Don't add to errors - runtime validation is optional
    }

    return { errors, warnings };
  }

  /**
   * Analyze refinement intent
   */
  async analyzeRefinementIntent(userRequest, options = {}) {
    console.log('🔍 [RefinementContext] Analyzing refinement intent...');

    // Lazy-load IntelligentSelectorResolver if not already initialized
    if (!this.selectorResolver) {
      if (typeof IntelligentSelectorResolver !== 'undefined') {
        this.selectorResolver = new IntelligentSelectorResolver();
      } else {
        console.warn('⚠️ IntelligentSelectorResolver not available, using fallback');
        return this.getFallbackIntent(userRequest);
      }
    }

    try {
      const intent = await this.selectorResolver.resolveUserIntent({
        userRequest,
        workingCode: this.workingCode,
        elementDatabase: this.elementDatabase,
        conversationHistory: this.conversationHistory
      });

      return intent;

    } catch (error) {
      console.error('❌ Intent analysis failed:', error);
      return this.getFallbackIntent(userRequest);
    }
  }

  /**
   * Get fallback intent when analysis fails
   */
  getFallbackIntent(userRequest) {
    return {
      strategy: 'PRESERVE_SELECTORS',
      refinementType: 'incremental',
      targetElements: Array.from(this.appliedSelectors),
      needsClarification: false
    };
  }

  /**
   * Build refinement prompt
   */
  buildRefinementPrompt(userRequest, intent, options = {}) {
    let prompt = `You are refining existing Convert.com A/B test code.

CURRENT WORKING CODE:
${this.formatCodeForPrompt(this.workingCode)}

ELEMENT DATABASE (valid selectors):
${this.formatElementDatabaseForPrompt()}

USER REQUEST: "${userRequest}"

REFINEMENT STRATEGY: ${intent.strategy || 'PRESERVE_SELECTORS'}
`;

    if (intent.strategy === 'PRESERVE_SELECTORS') {
      prompt += `
CRITICAL RULES FOR REFINEMENT:
1. Use the SAME selectors already in the working code
2. Only modify what the user requested (e.g., color value, text content)
3. Do NOT change selector syntax
4. Do NOT add new elements unless explicitly requested

Working selectors you MUST preserve:
${Array.from(this.appliedSelectors).map(s => `- "${s}"`).join('\n')}
`;
    } else if (intent.strategy === 'USE_ELEMENT_DATABASE') {
      prompt += `
CRITICAL RULES FOR NEW FEATURE:
1. Use element database to find selectors for new elements
2. Do NOT modify existing working code unless explicitly requested
3. Add new code alongside existing code
4. Verify new selectors exist in element database before using them
`;
    }

    // Add validation history if we have previous failures
    if (this.validationHistory.length > 0) {
      prompt += `\n\nPREVIOUS VALIDATION ERRORS (avoid these):\n`;
      this.validationHistory.forEach((entry, idx) => {
        prompt += `\nAttempt ${entry.attempt}:\n`;
        entry.errors.forEach(err => {
          prompt += `- ${err.message || err}\n`;
        });
      });
    }

    prompt += `\n\nGenerate ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "variations": [
    {
      "number": 1,
      "name": "Variation 1",
      "css": "/* CSS code */",
      "js": "/* JavaScript code */"
    }
  ],
  "globalCSS": "",
  "globalJS": "",
  "confidence": 95
}`;

    return prompt;
  }

  /**
   * Build correction prompt after validation failure
   */
  buildCorrectionPrompt(originalPrompt, validation) {
    let correctionPrompt = originalPrompt;

    correctionPrompt += `\n\n❌ YOUR PREVIOUS CODE FAILED VALIDATION:\n\n`;

    validation.errors.forEach((error, idx) => {
      correctionPrompt += `ERROR ${idx + 1}: ${error.type}\n`;
      correctionPrompt += `  ${error.message}\n`;
      if (error.suggestion) {
        correctionPrompt += `  FIX: ${error.suggestion}\n`;
      }
      correctionPrompt += `\n`;
    });

    correctionPrompt += `\nRegenerate the code fixing these specific errors. Return ONLY valid JSON.`;

    return correctionPrompt;
  }

  /**
   * Call AI to generate code
   */
  async callAI(prompt, options = {}) {
    // Get API settings
    const settings = await chrome.storage.local.get(['settings']);
    const apiKey = settings.settings?.anthropicApiKey;

    if (!apiKey) {
      throw new Error('No API key configured');
    }

    const model = settings.settings?.model || 'claude-3-7-sonnet-20250219';

    console.log('🤖 [RefinementContext] Calling AI:', { model, promptLength: prompt.length });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API call failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON response
    const parsed = this.parseAIResponse(content);

    return {
      code: parsed,
      usage: data.usage,
      confidence: parsed.confidence || 0
    };
  }

  /**
   * Parse AI response (handle JSON extraction)
   */
  parseAIResponse(responseText) {
    try {
      let cleaned = responseText.trim();

      // Remove markdown code blocks
      if (cleaned.includes('```')) {
        const match = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (match) {
          cleaned = match[1].trim();
        }
      }

      // Extract JSON object
      const startIndex = cleaned.indexOf('{');
      const lastIndex = cleaned.lastIndexOf('}');

      if (startIndex !== -1 && lastIndex !== -1) {
        cleaned = cleaned.substring(startIndex, lastIndex + 1);
      }

      // Parse JSON
      const parsed = JSON.parse(cleaned);

      return parsed;

    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      console.error('Response:', responseText.substring(0, 500));
      throw new Error('Failed to parse AI response: ' + error.message);
    }
  }

  /**
   * Verify selectors still exist on page
   */
  async verifySelectorsStillExist() {
    if (!this.tabId || this.appliedSelectors.size === 0) {
      return { valid: true };
    }

    try {
      const selectors = Array.from(this.appliedSelectors);

      const response = await chrome.tabs.sendMessage(this.tabId, {
        type: 'VERIFY_SELECTORS',
        selectors: selectors
      });

      const missing = selectors.filter(s => !response.exists[s]);

      if (missing.length > 0) {
        console.warn('⚠️ Some selectors no longer exist:', missing);
        return {
          valid: false,
          missing: missing,
          suggestion: 'Page changed since capture. Re-capture or update selectors.'
        };
      }

      return { valid: true };

    } catch (error) {
      console.warn('⚠️ Could not verify selectors:', error.message);
      // Don't fail validation - just warn
      return { valid: true, warning: error.message };
    }
  }

  /**
   * Snapshot current working state for rollback
   */
  snapshotWorkingState() {
    this.lastValidatedCode = JSON.parse(JSON.stringify(this.workingCode));
    console.log('📸 [RefinementContext] Snapshot taken');
  }

  /**
   * Rollback to last validated code
   */
  rollback() {
    if (this.lastValidatedCode) {
      this.workingCode = this.lastValidatedCode;
      this.extractAndTrackSelectors(this.workingCode);
      console.log('⏮️ [RefinementContext] Rolled back to last validated code');
    } else {
      console.warn('⚠️ No snapshot available for rollback');
    }
  }

  /**
   * Extract selectors from code and track them
   */
  extractAndTrackSelectors(code) {
    const selectors = this.extractSelectorsFromCode(code);
    this.appliedSelectors = new Set(selectors);
    console.log('📊 [RefinementContext] Tracked selectors:', selectors.length);
  }

  /**
   * Extract all selectors from code
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
   * Format code for prompt
   */
  formatCodeForPrompt(code) {
    if (!code || !code.variations) {
      return 'No code yet';
    }

    let formatted = '';

    code.variations.forEach((v, idx) => {
      formatted += `\n// VARIATION ${v.number || idx + 1} - ${v.name}\n`;
      if (v.css) {
        formatted += `\n// CSS:\n${v.css}\n`;
      }
      if (v.js) {
        formatted += `\n// JavaScript:\n${v.js}\n`;
      }
    });

    if (code.globalCSS) {
      formatted += `\n// GLOBAL CSS:\n${code.globalCSS}\n`;
    }

    if (code.globalJS) {
      formatted += `\n// GLOBAL JS:\n${code.globalJS}\n`;
    }

    return formatted;
  }

  /**
   * Format element database for prompt
   */
  formatElementDatabaseForPrompt() {
    if (!this.elementDatabase || !this.elementDatabase.elements) {
      return 'No element database available';
    }

    const elements = this.elementDatabase.elements.slice(0, 50); // Limit to 50 for prompt size

    return elements.map((el, idx) => {
      return `${idx + 1}. "${el.selector}" - ${el.tag} "${el.text?.substring(0, 30) || ''}"`;
    }).join('\n');
  }

  /**
   * Find closest matching selector (for typo suggestions)
   */
  findClosestSelector(target, validSelectors) {
    if (!validSelectors || validSelectors.length === 0) {
      return null;
    }

    // Simple Levenshtein distance check
    let closest = null;
    let minDistance = Infinity;

    validSelectors.forEach(selector => {
      const distance = this.levenshteinDistance(target, selector);
      if (distance < minDistance && distance < target.length * 0.5) {
        minDistance = distance;
        closest = selector;
      }
    });

    return closest;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.RefinementContext = RefinementContext;
}
