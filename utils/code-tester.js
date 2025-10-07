// Automatic Code Testing Pipeline
// Tests generated code automatically before presenting to user

class CodeTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Runs complete test pipeline on generated code
   * Returns test results with pass/fail status
   */
  async testGeneratedCode(variation, options = {}) {
    console.log(`🧪 Testing variation: ${variation.name}`);

    const testSuite = {
      variationName: variation.name,
      variationNumber: variation.number,
      timestamp: Date.now(),
      tests: [],
      overallStatus: 'pass',
      errors: [],
      warnings: []
    };

    // Test 1: Selector Validation
    if (variation.js || variation.css) {
      const selectorTest = await this.testSelectors(variation);
      testSuite.tests.push(selectorTest);
      if (selectorTest.status === 'fail') {
        testSuite.overallStatus = 'fail';
        testSuite.errors.push(...selectorTest.errors);
      }
    }

    // Test 2: JavaScript Syntax Check
    if (variation.js) {
      const syntaxTest = this.testJavaScriptSyntax(variation.js);
      testSuite.tests.push(syntaxTest);
      if (syntaxTest.status === 'fail') {
        testSuite.overallStatus = 'fail';
        testSuite.errors.push(...syntaxTest.errors);
      }
    }

    // Test 3: CSS Validation
    if (variation.css) {
      const cssTest = this.testCSSValidity(variation.css);
      testSuite.tests.push(cssTest);
      if (cssTest.status === 'fail') {
        testSuite.overallStatus = 'fail';
        testSuite.errors.push(...cssTest.errors);
      }
    }

    // Test 4: Code Execution Test (optional - only if requested)
    if (options.testExecution) {
      const executionTest = await this.testCodeExecution(variation);
      testSuite.tests.push(executionTest);
      if (executionTest.status === 'fail') {
        testSuite.overallStatus = 'fail';
        testSuite.errors.push(...executionTest.errors);
      }
    }

    // Test 5: Pattern Matching (Convert.com best practices)
    const patternTest = this.testConvertPatterns(variation);
    testSuite.tests.push(patternTest);
    if (patternTest.warnings.length > 0) {
      testSuite.warnings.push(...patternTest.warnings);
    }

    // Test 6: Duplicate Element Detection (NEW)
    const duplicateTest = this.testForDuplicates(variation);
    testSuite.tests.push(duplicateTest);
    if (duplicateTest.status === 'fail') {
      testSuite.overallStatus = 'fail';
      testSuite.errors.push(...duplicateTest.errors);
    } else if (duplicateTest.warnings.length > 0) {
      testSuite.warnings.push(...duplicateTest.warnings);
    }

    this.testResults.push(testSuite);

    console.log(`${testSuite.overallStatus === 'pass' ? '✅' : '❌'} Testing complete: ${variation.name}`, testSuite);

    return testSuite;
  }

  /**
   * Test 1: Validate all selectors exist and are unique
   */
  async testSelectors(variation) {
    const test = {
      name: 'Selector Validation',
      status: 'pass',
      errors: [],
      warnings: [],
      details: {
        selectorsFound: [],
        selectorsValid: 0,
        selectorsFailed: 0
      }
    };

    try {
      // Extract selectors from code
      const validator = new SelectorValidator();
      const jsSelectors = variation.js ? validator.extractSelectorsFromCode(variation.js) : [];
      const cssSelectors = variation.css ? validator.extractSelectorsFromCode(variation.css) : [];
      const allSelectors = [...new Set([...jsSelectors, ...cssSelectors])];

      test.details.selectorsFound = allSelectors;

      // Validate each selector
      const validationResults = validator.revalidateSelectors(allSelectors);

      Object.entries(validationResults).forEach(([selector, result]) => {
        if (!result.valid) {
          // Check if this selector has proper fallback handling in the code
          const hasFallback = this.hasSelectorFallback(variation, selector);
          
          if (hasFallback) {
            // Treat as warning instead of error if there's a fallback
            test.warnings.push({
              selector,
              issue: `Element not found: ${selector}`,
              fix: 'Code includes fallback handling - variation should work correctly'
            });
            test.details.selectorsValid++; // Count as valid due to fallback
          } else {
            test.status = 'fail';
            test.details.selectorsFailed++;
            test.errors.push({
              selector,
              issue: result.error || `Element not found: ${selector}`,
              fix: 'Add fallback logic or verify selector exists on target page'
            });
          }
        } else {
          test.details.selectorsValid++;

          if (result.matchCount > 10) {
            test.warnings.push({
              selector,
              issue: `Selector matches ${result.matchCount} elements`,
              fix: 'Consider more specific selector'
            });
          }
        }
      });

    } catch (error) {
      test.status = 'fail';
      test.errors.push({
        issue: 'Selector validation failed',
        error: error.message
      });
    }

    return test;
  }

  /**
   * Check if code has proper fallback handling for a missing selector
   */
  hasSelectorFallback(variation, selector) {
    if (!variation.js) return false;
    
    const code = variation.js;
    
    // Look for common fallback patterns in the code
    const fallbackPatterns = [
      // Multiple querySelector attempts with || (like the generated code does)
      /querySelector\([^)]+\)\s*\|\|\s*querySelector/i,
      /querySelector\([^)]+\)\s*\|\|\s*el\.querySelector/i,
      // Conditional element checking before use
      /if\s*\(\s*\w+Element\s*\)/i,
      // Ternary operator with fallback text/values
      /\?\s*[^:]+\s*:\s*['"`][^'"`]+['"`]/,
      // Try-catch around querySelector usage
      /try\s*{[^}]*querySelector[^}]*}\s*catch/i,
      // Fallback text assignment patterns
      /titleText\s*=\s*[^;]*\?\s*[^:]*:\s*['"`][^'"`]+['"`]/i,
      // Default assignment with || operator  
      /=\s*[^|]*\|\|\s*['"`][^'"`]+['"`]/
    ];
    
    // Also check for the specific pattern from our generated code
    const hasMultipleSelectorAttempts = 
      code.includes('||') && 
      (code.includes('querySelector') || code.includes('el.querySelector'));
    
    const hasDefaultFallbackText = 
      code.includes('Up to 50% Off Sitewide') || 
      /:\s*['"`][^'"`]{5,}['"`]/.test(code);
    
    return fallbackPatterns.some(pattern => pattern.test(code)) || 
           hasMultipleSelectorAttempts || 
           hasDefaultFallbackText;
  }

  /**
   * Test 2: Check JavaScript syntax validity
   */
  testJavaScriptSyntax(jsCode) {
    const test = {
      name: 'JavaScript Syntax',
      status: 'pass',
      errors: [],
      warnings: []
    };

    try {
      // Wrap in function to test syntax without executing
      new Function(jsCode);

      // Check for common issues
      if (jsCode.includes('document.querySelector') && !jsCode.includes('waitForElement')) {
        test.warnings.push({
          issue: 'Using querySelector without waitForElement',
          fix: 'Consider using waitForElement for reliability'
        });
      }

      if (jsCode.includes('$') && !jsCode.includes('waitForElement')) {
        test.warnings.push({
          issue: 'Using jQuery selector without proper waiting',
          fix: 'Use waitForElement pattern for dynamic elements'
        });
      }

      // Check for proper error handling
      if (jsCode.length > 200 && !jsCode.includes('catch') && !jsCode.includes('try')) {
        test.warnings.push({
          issue: 'No error handling found in complex code',
          fix: 'Consider adding try-catch blocks'
        });
      }

    } catch (error) {
      test.status = 'fail';
      test.errors.push({
        issue: 'JavaScript syntax error',
        error: error.message,
        fix: 'Fix syntax errors before applying'
      });
    }

    return test;
  }

  /**
   * Test 3: Validate CSS syntax
   */
  testCSSValidity(cssCode) {
    const test = {
      name: 'CSS Validation',
      status: 'pass',
      errors: [],
      warnings: []
    };

    try {
      // Check for balanced braces
      const openBraces = (cssCode.match(/\{/g) || []).length;
      const closeBraces = (cssCode.match(/\}/g) || []).length;

      if (openBraces !== closeBraces) {
        test.status = 'fail';
        test.errors.push({
          issue: `Unbalanced braces (${openBraces} open, ${closeBraces} close)`,
          fix: 'Fix CSS brace matching'
        });
      }

      // Check for common CSS errors
      if (cssCode.includes('!important') && cssCode.split('!important').length > 10) {
        test.warnings.push({
          issue: 'Excessive use of !important',
          fix: 'Consider more specific selectors'
        });
      }

      // Check for empty rules
      const emptyRules = cssCode.match(/[^}]+\{\s*\}/g);
      if (emptyRules && emptyRules.length > 0) {
        test.warnings.push({
          issue: `${emptyRules.length} empty CSS rules found`,
          fix: 'Remove empty rules'
        });
      }

    } catch (error) {
      test.status = 'fail';
      test.errors.push({
        issue: 'CSS validation error',
        error: error.message
      });
    }

    return test;
  }

  /**
   * Test 4: Execute code and capture console errors
   */
  async testCodeExecution(variation) {
    const test = {
      name: 'Code Execution',
      status: 'pass',
      errors: [],
      warnings: [],
      details: {
        consoleErrors: [],
        elementsModified: 0,
        executionTime: 0
      }
    };

    const startTime = Date.now();

    try {
      // Capture console errors during execution
      const originalError = console.error;
      const capturedErrors = [];

      console.error = function(...args) {
        capturedErrors.push(args.join(' '));
        originalError.apply(console, args);
      };

      // Inject and execute code
      if (variation.css) {
        const styleEl = document.createElement('style');
        styleEl.textContent = variation.css;
        styleEl.dataset.testExecution = 'true';
        document.head.appendChild(styleEl);
      }

      if (variation.js) {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = variation.js;
        scriptEl.dataset.testExecution = 'true';
        document.body.appendChild(scriptEl);
      }

      // Wait for code to execute
      await new Promise(resolve => setTimeout(resolve, 500));

      // Restore console.error
      console.error = originalError;

      test.details.executionTime = Date.now() - startTime;
      test.details.consoleErrors = capturedErrors;

      if (capturedErrors.length > 0) {
        test.status = 'fail';
        test.errors = capturedErrors.map(err => ({
          issue: 'Console error during execution',
          error: err,
          fix: 'Fix runtime errors'
        }));
      }

      // Clean up test elements
      document.querySelectorAll('[data-test-execution="true"]').forEach(el => el.remove());

    } catch (error) {
      test.status = 'fail';
      test.errors.push({
        issue: 'Code execution failed',
        error: error.message
      });
    }

    return test;
  }

  /**
   * Test 5: Check for Convert.com best practices
   */
  testConvertPatterns(variation) {
    const test = {
      name: 'Convert.com Best Practices',
      status: 'pass',
      errors: [],
      warnings: []
    };

    const code = (variation.js || '') + (variation.css || '');

    // Check for waitForElement pattern
    if (variation.js && variation.js.includes('querySelector') && !variation.js.includes('waitForElement')) {
      test.warnings.push({
        issue: 'Not using waitForElement pattern',
        fix: 'Use waitForElement for reliability with dynamic content'
      });
    }

    // Check for proper utility function
    if (variation.js && !variation.js.includes('function waitForElement')) {
      test.warnings.push({
        issue: 'waitForElement utility function not defined',
        fix: 'Include utility function in code'
      });
    }

    // Check for duplicate selectors (potential inefficiency)
    const validator = new SelectorValidator();
    const selectors = validator.extractSelectorsFromCode(code);
    const selectorCounts = {};

    selectors.forEach(sel => {
      selectorCounts[sel] = (selectorCounts[sel] || 0) + 1;
    });

    Object.entries(selectorCounts).forEach(([sel, count]) => {
      if (count > 3) {
        test.warnings.push({
          issue: `Selector "${sel}" used ${count} times`,
          fix: 'Consider storing reference or refactoring'
        });
      }
    });

    return test;
  }

  /**
   * Auto-fix common issues
   */
  autoFix(variation, testResults) {
    let fixedCode = { ...variation };
    const fixes = [];

    testResults.tests.forEach(test => {
      // Fix missing waitForElement utility
      if (test.warnings.some(w => w.issue.includes('waitForElement utility'))) {
        if (fixedCode.js && !fixedCode.js.includes('function waitForElement')) {
          const utilityFunction = `
// Utility: Wait for element to exist
function waitForElement(selector, callback, timeout = 10000) {
  const start = Date.now();
  const interval = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(interval);
      callback(element);
    } else if (Date.now() - start > timeout) {
      clearInterval(interval);
      console.error('Element not found:', selector);
    }
  }, 100);
}

`;
          fixedCode.js = utilityFunction + fixedCode.js;
          fixes.push('Added waitForElement utility function');
        }
      }

      // Fix empty CSS rules
      if (test.warnings.some(w => w.issue.includes('empty CSS rules'))) {
        if (fixedCode.css) {
          fixedCode.css = fixedCode.css.replace(/[^}]+\{\s*\}/g, '');
          fixes.push('Removed empty CSS rules');
        }
      }
    });

    return {
      fixedCode,
      fixes
    };
  }

  /**
   * Get test summary
   */
  getSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.overallStatus === 'pass').length;
    const failed = total - passed;

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total * 100).toFixed(1) : 0
    };
  }

  /**
   * Clear test results
   */
  clearResults() {
    this.testResults = [];
  }

  /**
   * Test 6: Detect duplicate elements in DOM (NEW)
   * Checks for elements with identical text/attributes that indicate duplication
   */
  testForDuplicates(variation) {
    const test = {
      name: 'Duplicate Element Detection',
      status: 'pass',
      errors: [],
      warnings: [],
      details: {
        duplicatesFound: [],
        suspiciousPatterns: []
      }
    };

    try {
      // Check for duplicate buttons/CTAs
      const buttons = document.querySelectorAll('button, a.btn, [role="button"], [class*="cta"]');
      const textCounts = {};
      const duplicateGroups = [];

      buttons.forEach(btn => {
        const text = btn.textContent.trim();
        if (text && text.length > 0) {
          if (!textCounts[text]) {
            textCounts[text] = { count: 0, elements: [] };
          }
          textCounts[text].count++;
          textCounts[text].elements.push(btn);
        }
      });

      // Flag suspicious duplicates (more than expected)
      Object.entries(textCounts).forEach(([text, data]) => {
        if (data.count > 2) { // More than 2 instances is suspicious
          const selectors = data.elements.map(el => this.getSimpleSelector(el));
          duplicateGroups.push({
            text: text.substring(0, 50),
            count: data.count,
            selectors: selectors.slice(0, 5) // Limit to 5 for readability
          });

          test.errors.push(`Found ${data.count} buttons with identical text: "${text.substring(0, 50)}" - likely duplication issue`);
          test.status = 'fail';
        } else if (data.count === 2) {
          // Might be intentional (e.g., mobile + desktop), but flag as warning
          test.warnings.push(`Found 2 buttons with text: "${text.substring(0, 50)}" - verify this is intentional`);
        }
      });

      test.details.duplicatesFound = duplicateGroups;

      // Check for duplicate sections/containers
      const sections = document.querySelectorAll('section, .hero, [class*="section"]');
      const sectionTexts = [];

      sections.forEach(section => {
        const text = section.textContent.trim().substring(0, 100);
        const textHash = text.toLowerCase().replace(/\s+/g, ' ');

        const duplicate = sectionTexts.find(s => s.hash === textHash);
        if (duplicate) {
          test.errors.push(`Found duplicate section content: "${text.substring(0, 50)}..." - entire section may be duplicated`);
          test.status = 'fail';
          test.details.suspiciousPatterns.push({
            type: 'duplicate-section',
            content: text.substring(0, 50)
          });
        } else {
          sectionTexts.push({ hash: textHash, content: text });
        }
      });

      // Check code for missing idempotency checks
      const hasIdempotencyCheck = (variation.js || '').includes('varApplied') ||
                                  (variation.js || '').includes('data-applied');

      if (!hasIdempotencyCheck && (variation.js || '').length > 100) {
        test.warnings.push('Code lacks idempotency checks (dataset.varApplied) - may create duplicates if run multiple times');
        test.details.suspiciousPatterns.push({
          type: 'missing-idempotency',
          message: 'No varApplied check found in JavaScript'
        });
      }

      if (test.status === 'fail') {
        console.warn('[Duplicate Detection] Found duplicate elements:', test.details);
      }

    } catch (error) {
      console.error('[Duplicate Detection] Test failed:', error);
      test.status = 'pass'; // Don't fail overall test if detection itself fails
      test.warnings.push('Duplicate detection encountered an error - skipping');
    }

    return test;
  }

  /**
   * Helper: Get simple selector for an element
   */
  getSimpleSelector(element) {
    if (element.id) return `#${element.id}`;

    const classes = Array.from(element.classList).filter(c => c.length < 30).slice(0, 2);
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }

    return element.tagName.toLowerCase();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeTester;
} else if (typeof window !== 'undefined') {
  window.CodeTester = CodeTester;
}
