/**
 * Test Script Generator
 * Analyzes implementation code and generates AI-powered test scripts
 * to validate interactive features and behavioral changes
 */

class TestScriptGenerator {
  constructor() {
    this.interactionPatterns = {
      click: /addEventListener\(['"]click['"]|\.click\(|onclick=/gi,
      hover: /addEventListener\(['"]mouse(enter|over)['"]|:hover/gi,
      scroll: /addEventListener\(['"]scroll['"]|window\.scrollTo|scrollIntoView/gi,
      exitIntent: /mouseout|mouse.*leave|clientY.*-/gi,
      session: /sessionStorage\.(get|set)Item/gi,
      local: /localStorage\.(get|set)Item/gi,
      modal: /modal|popup|overlay|\.show\(|\.open\(/gi,
      form: /input|textarea|select|form|\.value\s*=/gi,
      timer: /setTimeout|setInterval|Date\(\)/gi,
      animation: /animate|transition|transform|@keyframes/gi
    };
  }

  /**
   * Analyze implementation code to detect interaction requirements
   * @param {Object} code - Implementation code { css, js }
   * @param {string} userRequest - Original user request
   * @returns {Object} - Interaction analysis
   */
  analyzeInteractionRequirements(code, userRequest) {
    const requirements = {
      hasInteractions: false,
      types: [],
      complexity: 'simple', // simple, medium, complex
      suggestedDuration: 3000 // milliseconds
    };

    const fullCode = `${code.css || ''}\n${code.js || ''}`;
    const requestLower = userRequest.toLowerCase();

    // Detect interaction types
    for (const [type, pattern] of Object.entries(this.interactionPatterns)) {
      if (pattern.test(fullCode) || requestLower.includes(type)) {
        requirements.types.push(type);
        requirements.hasInteractions = true;
      }
    }

    // Determine complexity
    if (requirements.types.length === 0) {
      requirements.complexity = 'simple';
      requirements.suggestedDuration = 1000;
    } else if (requirements.types.length <= 2) {
      requirements.complexity = 'medium';
      requirements.suggestedDuration = 3000;
    } else {
      requirements.complexity = 'complex';
      requirements.suggestedDuration = 5000;
    }

    // Adjust duration based on specific types
    if (requirements.types.includes('timer')) {
      requirements.suggestedDuration = Math.max(requirements.suggestedDuration, 3000);
    }
    if (requirements.types.includes('animation')) {
      requirements.suggestedDuration = Math.max(requirements.suggestedDuration, 2000);
    }
    if (requirements.types.includes('exitIntent')) {
      requirements.suggestedDuration = Math.max(requirements.suggestedDuration, 1500);
    }

    console.log('[Test Script Generator] Analysis:', requirements);
    return requirements;
  }

  /**
   * Build AI prompt for test script generation
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User's original request
   * @param {Object} requirements - Interaction requirements
   * @returns {string} - AI prompt
   */
  buildTestScriptPrompt(code, userRequest, requirements) {
    const interactionTypes = requirements.types.join(', ') || 'static';

    return `Generate a test script to validate this A/B test implementation.

**USER REQUEST:** ${userRequest}

**IMPLEMENTATION CODE:**
CSS:
\`\`\`css
${code.css || '/* No CSS */'}
\`\`\`

JavaScript:
\`\`\`javascript
${code.js || '/* No JavaScript */'}
\`\`\`

**DETECTED INTERACTIONS:** ${interactionTypes}
**SUGGESTED TEST DURATION:** ${requirements.suggestedDuration}ms

**YOUR TASK:**
Generate a JavaScript test function that:
1. Simulates user interactions (${requirements.types.join(', ') || 'validates static changes'})
2. Validates expected outcomes
3. Captures state at key moments
4. Returns structured test results

**AVAILABLE TEST UTILITIES:**
You have access to \`window.TestPatterns\` with these methods:
- \`await waitForElement(selector, timeout)\` - Wait for element
- \`await simulateClick(selector)\` - Click element
- \`await simulateHover(selector)\` - Hover over element
- \`await simulateExitIntent()\` - Trigger exit intent
- \`await scrollTo(yPosition)\` - Scroll to position
- \`await scrollToElement(selector)\` - Scroll to element
- \`await fillInput(selector, value)\` - Fill form input
- \`isVisible(selector)\` - Check if element visible
- \`exists(selector)\` - Check if element exists
- \`getStyle(selector, property)\` - Get computed style
- \`getSessionStorage(key)\` - Get sessionStorage value
- \`getLocalStorage(key)\` - Get localStorage value
- \`countElements(selector)\` - Count matching elements
- \`getText(selector)\` - Get element text
- \`captureState(label)\` - Capture DOM state
- \`await validate(name, condition, expected, actual)\` - Run validation

**TEST SCRIPT REQUIREMENTS:**
1. **Use TestPatterns utilities** - Don't redefine them
2. **Handle errors gracefully** - Use try/catch
3. **Return structured results** - Follow format below
4. **Be specific** - Validate exact expected outcomes
5. **Capture screenshots** - Mark key moments for screenshots

**EXAMPLE OUTPUT FORMAT:**
\`\`\`javascript
async function testVariation() {
  const results = {
    interactions: [],
    validations: [],
    screenshots: [],
    states: []
  };

  try {
    // Test 1: Wait for element
    await TestPatterns.waitForElement('.my-button', 3000);
    results.screenshots.push({ label: 'initial-state', capture: true });

    // Test 2: Click interaction
    const clicked = await TestPatterns.simulateClick('.my-button');
    results.interactions.push({
      type: 'click',
      target: '.my-button',
      success: clicked
    });
    results.screenshots.push({ label: 'after-click', capture: true });

    // Test 3: Validate outcome
    const validation = await TestPatterns.validate(
      'button hidden after click',
      !TestPatterns.isVisible('.my-button'),
      'button hidden',
      TestPatterns.isVisible('.my-button') ? 'button visible' : 'button hidden'
    );
    results.validations.push(validation);

    // Test 4: Check storage
    const storageValue = TestPatterns.getSessionStorage('buttonClicked');
    results.validations.push(await TestPatterns.validate(
      'sessionStorage set correctly',
      storageValue === 'true',
      'true',
      storageValue
    ));

    results.overallStatus = results.validations.every(v => v.passed) ? 'passed' : 'failed';
  } catch (error) {
    results.error = error.message;
    results.overallStatus = 'error';
  }

  return results;
}
\`\`\`

**CRITICAL RULES:**
✅ Return ONLY the function definition (no explanations)
✅ Function MUST be named \`testVariation\`
✅ Function MUST be async
✅ Function MUST return results object
✅ Use TestPatterns.* for ALL utilities
✅ Add screenshots at key moments
✅ Validate ALL aspects of the user request

❌ Do NOT add text before or after the function
❌ Do NOT use console.log for validations (use TestPatterns.validate)
❌ Do NOT assume elements exist (use waitForElement)
❌ Do NOT skip error handling

Generate the test function now:`;
  }

  /**
   * Generate test script using AI
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User's original request
   * @param {Object} settings - AI settings (provider, model, key)
   * @returns {Promise<Object>} - Test script result
   */
  async generateTestScript(code, userRequest, settings) {
    console.log('[Test Script Generator] Generating test script...');

    // Step 1: Analyze requirements
    const requirements = this.analyzeInteractionRequirements(code, userRequest);

    // Step 2: Skip if no interactions needed
    if (!requirements.hasInteractions && !userRequest.toLowerCase().includes('test')) {
      console.log('[Test Script Generator] No interactions detected, skipping test generation');
      return {
        testScript: null,
        requirements,
        reason: 'No interactive features detected'
      };
    }

    // Step 3: Build prompt
    const prompt = this.buildTestScriptPrompt(code, userRequest, requirements);

    // Step 4: Call AI
    try {
      const response = await this.callAI(prompt, settings);
      const testScript = this.parseTestScriptResponse(response);

      return {
        testScript,
        requirements,
        suggestedDuration: requirements.suggestedDuration
      };
    } catch (error) {
      console.error('[Test Script Generator] Generation failed:', error);
      return {
        testScript: null,
        requirements,
        error: error.message
      };
    }
  }

  /**
   * Call AI API for test script generation
   * @param {string} prompt - Test script prompt
   * @param {Object} settings - AI settings
   * @returns {Promise<string>} - AI response
   */
  async callAI(prompt, settings) {
    const { provider, model, authToken } = settings;

    if (provider === 'anthropic') {
      return await this.callClaude(prompt, model, authToken);
    } else {
      return await this.callOpenAI(prompt, model, authToken);
    }
  }

  /**
   * Call Claude API
   * @param {string} prompt - Prompt
   * @param {string} model - Model name
   * @param {string} authToken - API key
   * @returns {Promise<string>} - Response content
   */
  async callClaude(prompt, model, authToken) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': authToken
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.3, // Lower temperature for consistent test generation
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Call OpenAI API
   * @param {string} prompt - Prompt
   * @param {string} model - Model name
   * @param {string} authToken - API key
   * @returns {Promise<string>} - Response content
   */
  async callOpenAI(prompt, model, authToken) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini', // Use cheaper model for test generation
        messages: [{
          role: 'system',
          content: 'You are an expert test engineer. Generate ONLY the test function code with no additional text.'
        }, {
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Parse AI response to extract test function
   * @param {string} response - AI response
   * @returns {string} - Extracted test function
   */
  parseTestScriptResponse(response) {
    let cleaned = response.trim();

    // Remove markdown code blocks
    if (cleaned.includes('```')) {
      const codeBlockMatch = cleaned.match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
    }

    // Remove any explanatory text before the function
    const functionStart = cleaned.indexOf('async function testVariation');
    if (functionStart > 0) {
      cleaned = cleaned.substring(functionStart);
    }

    // Validate function structure
    if (!cleaned.includes('async function testVariation')) {
      throw new Error('Generated script does not contain required function: async function testVariation');
    }

    console.log('[Test Script Generator] Test script extracted successfully');
    return cleaned;
  }
}

// Export for Chrome extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestScriptGenerator;
}
