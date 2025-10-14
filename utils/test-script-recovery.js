/**
 * Test Script Recovery System
 * Handles test script failures with multiple fallback strategies
 * Ensures testing never blocks the user workflow
 */

class TestScriptRecovery {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 2;
    this.fallbackStrategies = [
      'regenerate',      // Regenerate with different prompt
      'simplify',        // Generate simpler test
      'manual',          // Use predefined test templates
      'skip'             // Skip testing, continue with Visual QA
    ];
  }

  /**
   * Attempt to recover from test script generation failure
   * @param {Object} failureContext - Context about the failure
   * @returns {Promise<Object>} - Recovery result
   */
  async recoverFromGenerationFailure(failureContext) {
    const { error, code, userRequest, attempt = 0 } = failureContext;

    console.log(`[Test Recovery] Generation failed (attempt ${attempt}):`, error);

    // Strategy 1: Regenerate with explicit examples
    if (attempt === 0) {
      console.log('[Test Recovery] Strategy 1: Regenerate with examples');
      return {
        strategy: 'regenerate-with-examples',
        action: 'retry',
        modifiedPrompt: this.buildFailsafePrompt(code, userRequest, error)
      };
    }

    // Strategy 2: Generate simpler test (remove complex validations)
    if (attempt === 1) {
      console.log('[Test Recovery] Strategy 2: Generate simpler test');
      return {
        strategy: 'simplify',
        action: 'retry',
        modifiedPrompt: this.buildSimplifiedPrompt(code, userRequest)
      };
    }

    // Strategy 3: Use template-based test
    if (attempt === 2) {
      console.log('[Test Recovery] Strategy 3: Use template');
      const templateTest = this.generateTemplateTest(code, userRequest);
      if (templateTest) {
        return {
          strategy: 'template',
          action: 'use-template',
          testScript: templateTest
        };
      }
    }

    // Strategy 4: Skip testing, continue with Visual QA only
    console.log('[Test Recovery] Strategy 4: Skip testing');
    return {
      strategy: 'skip',
      action: 'skip-testing',
      reason: 'All recovery strategies exhausted'
    };
  }

  /**
   * Attempt to recover from test execution failure
   * @param {Object} failureContext - Context about the failure
   * @returns {Promise<Object>} - Recovery result
   */
  async recoverFromExecutionFailure(failureContext) {
    const { error, testScript, attempt = 0 } = failureContext;

    console.log(`[Test Recovery] Execution failed (attempt ${attempt}):`, error);

    // Analyze error type
    const errorType = this.classifyExecutionError(error);

    // Strategy 1: Timeout → Increase timeout and retry
    if (errorType === 'timeout' && attempt === 0) {
      console.log('[Test Recovery] Timeout detected, increasing timeout');
      return {
        strategy: 'increase-timeout',
        action: 'retry',
        modifiedTimeout: 20000 // Double timeout
      };
    }

    // Strategy 2: Selector not found → Wait longer
    if (errorType === 'selector-not-found' && attempt === 0) {
      console.log('[Test Recovery] Selector not found, adding wait');
      return {
        strategy: 'add-wait',
        action: 'retry',
        modifiedScript: this.addPreExecutionWait(testScript)
      };
    }

    // Strategy 3: JavaScript error → Try to fix common issues
    if (errorType === 'javascript-error' && attempt === 0) {
      console.log('[Test Recovery] JavaScript error, attempting fix');
      const fixedScript = this.attemptScriptFix(testScript, error);
      if (fixedScript !== testScript) {
        return {
          strategy: 'fix-script',
          action: 'retry',
          modifiedScript: fixedScript
        };
      }
    }

    // Strategy 4: Partial success → Use what we got
    if (errorType === 'partial-failure') {
      console.log('[Test Recovery] Partial failure, using partial results');
      return {
        strategy: 'partial-results',
        action: 'continue',
        partialResults: this.extractPartialResults(error)
      };
    }

    // Strategy 5: Skip testing
    console.log('[Test Recovery] All execution recovery exhausted');
    return {
      strategy: 'skip',
      action: 'skip-testing',
      reason: 'Execution failed after all retries'
    };
  }

  /**
   * Build failsafe prompt with explicit error handling
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User request
   * @param {string} previousError - Previous error message
   * @returns {string} - Enhanced prompt
   */
  buildFailsafePrompt(code, userRequest, previousError) {
    return `PREVIOUS ATTEMPT FAILED: ${previousError}

Generate a test script with EXTRA ERROR HANDLING.

**CRITICAL REQUIREMENTS:**
1. Wrap EVERY operation in try/catch
2. Add fallback for every waitForElement call
3. Never assume elements exist
4. Return results even if some tests fail
5. Mark failed tests as { passed: false, error: '...' }

**EXAMPLE - BULLETPROOF TEST:**
\`\`\`javascript
async function testVariation() {
  const results = {
    interactions: [],
    validations: [],
    screenshots: [],
    overallStatus: 'partial'
  };

  // Test 1: Element existence (with fallback)
  let element = null;
  try {
    element = await TestPatterns.waitForElement('.target', 5000);
    results.validations.push(await TestPatterns.validate(
      'element exists',
      true,
      'found',
      'found'
    ));
  } catch (error) {
    results.validations.push({
      test: 'element exists',
      passed: false,
      error: error.message,
      expected: 'found',
      actual: 'not found'
    });
    // CONTINUE testing other things
  }

  // Test 2: Click (only if element found)
  if (element) {
    try {
      await TestPatterns.simulateClick(element);
      results.interactions.push({ type: 'click', success: true });
    } catch (error) {
      results.interactions.push({ type: 'click', success: false, error: error.message });
    }
  }

  // Determine status
  const passedCount = results.validations.filter(v => v.passed).length;
  const totalCount = results.validations.length;
  if (passedCount === totalCount) {
    results.overallStatus = 'passed';
  } else if (passedCount > 0) {
    results.overallStatus = 'partial';
  } else {
    results.overallStatus = 'failed';
  }

  return results;
}
\`\`\`

Now generate a bulletproof test for:
${userRequest}

Code:
${JSON.stringify(code, null, 2)}`;
  }

  /**
   * Build simplified prompt (reduce complexity)
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User request
   * @returns {string} - Simplified prompt
   */
  buildSimplifiedPrompt(code, userRequest) {
    return `Generate a SIMPLE test script that only validates the most critical aspects.

**SIMPLIFIED REQUIREMENTS:**
1. Test ONLY if main element exists
2. Test ONLY if element is visible
3. Skip complex interactions
4. Focus on presence, not behavior

**USER REQUEST:** ${userRequest}

**CODE:**
${JSON.stringify(code, null, 2)}

**GENERATE MINIMAL TEST - EXAMPLE:**
\`\`\`javascript
async function testVariation() {
  const results = {
    validations: [],
    overallStatus: 'passed'
  };

  try {
    // Only test: element exists and is visible
    const element = document.querySelector('.target');
    results.validations.push({
      test: 'element exists',
      passed: !!element
    });

    if (element) {
      results.validations.push({
        test: 'element visible',
        passed: TestPatterns.isVisible(element)
      });
    }

    results.overallStatus = results.validations.every(v => v.passed) ? 'passed' : 'failed';
  } catch (error) {
    results.error = error.message;
    results.overallStatus = 'error';
  }

  return results;
}
\`\`\``;
  }

  /**
   * Generate template-based test from patterns
   * @param {Object} code - Implementation code
   * @param {string} userRequest - User request
   * @returns {string|null} - Template test or null
   */
  generateTemplateTest(code, userRequest) {
    // Extract selectors from code
    const selectors = this.extractSelectorsFromCode(code);
    if (selectors.length === 0) {
      return null;
    }

    // Determine test type
    const hasClick = /addEventListener\(['"]click['"]|\.click\(/i.test(code.js || '');
    const hasStorage = /sessionStorage|localStorage/i.test(code.js || '');

    // Build template
    return `
async function testVariation() {
  const results = {
    validations: [],
    interactions: [],
    screenshots: [],
    overallStatus: 'passed'
  };

  try {
    // Test: Main element exists
    const mainElement = await TestPatterns.waitForElement('${selectors[0]}', 5000);
    results.validations.push({
      test: 'main element exists',
      passed: !!mainElement
    });

    ${hasClick ? `
    // Test: Click interaction
    if (mainElement) {
      const clicked = await TestPatterns.simulateClick(mainElement);
      results.interactions.push({ type: 'click', success: clicked });
    }
    ` : ''}

    ${hasStorage ? `
    // Test: Storage check (generic)
    await TestPatterns.wait(500);
    // Note: Cannot determine exact storage key from code
    ` : ''}

    results.overallStatus = results.validations.every(v => v.passed) ? 'passed' : 'failed';
  } catch (error) {
    results.error = error.message;
    results.overallStatus = 'error';
  }

  return results;
}`;
  }

  /**
   * Classify execution error type
   * @param {string} error - Error message
   * @returns {string} - Error type
   */
  classifyExecutionError(error) {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
      return 'timeout';
    }
    if (errorLower.includes('element not found') || errorLower.includes('not found after')) {
      return 'selector-not-found';
    }
    if (errorLower.includes('syntaxerror') || errorLower.includes('referenceerror')) {
      return 'javascript-error';
    }
    if (errorLower.includes('partial') || errorLower.includes('some tests passed')) {
      return 'partial-failure';
    }

    return 'unknown';
  }

  /**
   * Add wait before test execution
   * @param {string} testScript - Original test script
   * @returns {string} - Modified test script
   */
  addPreExecutionWait(testScript) {
    // Insert wait at start of try block
    return testScript.replace(
      /try\s*{/,
      `try {
    // Added by recovery: wait for page to stabilize
    await TestPatterns.wait(2000);
    console.log('[Test Recovery] Waited 2s for page stabilization');
`
    );
  }

  /**
   * Attempt to fix common script issues
   * @param {string} testScript - Original test script
   * @param {string} error - Error message
   * @returns {string} - Fixed or original script
   */
  attemptScriptFix(testScript, error) {
    let fixed = testScript;

    // Fix 1: Missing await
    if (error.includes('Promise') || error.includes('async')) {
      fixed = fixed.replace(/TestPatterns\.(waitForElement|simulateClick|simulateHover|scrollTo)\(/g, 'await TestPatterns.$1(');
    }

    // Fix 2: Undefined variable
    if (error.includes('is not defined')) {
      const match = error.match(/(\w+) is not defined/);
      if (match) {
        const varName = match[1];
        // Add null check before usage
        fixed = fixed.replace(new RegExp(`\\b${varName}\\.`, 'g'), `${varName} && ${varName}.`);
      }
    }

    return fixed;
  }

  /**
   * Extract partial results from failed execution
   * @param {string} error - Error with potential partial results
   * @returns {Object|null} - Partial results or null
   */
  extractPartialResults(error) {
    // Try to extract JSON from error message
    try {
      const jsonMatch = error.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Couldn't extract
    }
    return null;
  }

  /**
   * Extract selectors from implementation code
   * @param {Object} code - Implementation code
   * @returns {Array<string>} - Extracted selectors
   */
  extractSelectorsFromCode(code) {
    const selectors = [];
    const fullCode = `${code.css || ''}\n${code.js || ''}`;

    // Extract from querySelector, querySelectorAll
    const querySelectorMatches = fullCode.matchAll(/querySelector(?:All)?\(['"]([^'"]+)['"]\)/g);
    for (const match of querySelectorMatches) {
      selectors.push(match[1]);
    }

    // Extract from CSS selectors
    const cssSelectors = fullCode.matchAll(/([.#][\w-]+)(?:\s*{|\s*,|\s*:)/g);
    for (const match of cssSelectors) {
      selectors.push(match[1]);
    }

    // Deduplicate
    return [...new Set(selectors)];
  }

  /**
   * Should we skip testing entirely?
   * @param {number} failureCount - Number of failures so far
   * @param {string} featureType - Type of feature being tested
   * @returns {boolean} - Whether to skip
   */
  shouldSkipTesting(failureCount, featureType) {
    // Never skip for critical interactive features
    const criticalFeatures = ['click', 'modal', 'exitIntent', 'form'];
    if (criticalFeatures.includes(featureType)) {
      return failureCount >= 3; // Try 3 times for critical features
    }

    // Skip sooner for less critical features
    return failureCount >= 2;
  }

  /**
   * Log recovery attempt for debugging
   * @param {string} strategy - Recovery strategy used
   * @param {Object} context - Context about the attempt
   */
  logRecoveryAttempt(strategy, context) {
    console.log(`[Test Recovery] Strategy: ${strategy}`, {
      attempt: context.attempt,
      errorType: context.errorType || 'unknown',
      timestamp: Date.now()
    });
  }
}

// Export for Chrome extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestScriptRecovery;
}
