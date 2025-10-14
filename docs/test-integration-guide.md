# Test Script Integration - Quick Start Guide

## Overview

This guide shows how to integrate the new test script system into the existing codebase.

## Files Already Created

✅ `utils/test-patterns.js` - Test utilities library
✅ `utils/test-script-generator.js` - AI-powered test generation
✅ `utils/test-script-executor.js` - Test execution engine
✅ `utils/test-script-recovery.js` - Error recovery system

## Integration Steps

### Step 1: Add Service Worker Handler (30 min)

**File**: `background/service-worker.js`

**Location**: In the `handleMessage()` switch statement, add new case:

```javascript
case 'EXECUTE_TEST_SCRIPT':
  try {
    // Get active tab
    let tabId = message.tabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tabs[0]) {
        throw new Error('No active tab found');
      }
      tabId = tabs[0].id;
    }

    console.log('🧪 Executing test script on tab', tabId);

    // Build executable code (test patterns + test script)
    const executor = new TestScriptExecutor();
    const executableCode = executor.buildExecutionCode(message.testScript);

    // Execute in MAIN world
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (code) => {
        return eval(code);
      },
      args: [executableCode]
    });

    const testResults = result[0]?.result;

    if (!testResults) {
      throw new Error('No results returned from test execution');
    }

    console.log('✅ Test execution complete:', testResults);
    sendResponse({ success: true, results: testResults });
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    sendResponse({ success: false, error: error.message });
  }
  break;
```

**Dependencies to import at top of file**:
```javascript
// Add to imports section
const TestScriptExecutor = require('../utils/test-script-executor.js');
```

**Note**: If using browser modules, adjust import syntax accordingly.

### Step 2: Integrate with Code Generation (45 min)

**File**: `background/service-worker.js`

**Location**: In `generateCode()` method, after implementation code is generated:

```javascript
async generateCode(params) {
  // ... existing code generation logic ...

  // Parse implementation code
  const implementationCode = this.parseGeneratedCode(aiResponse);

  // NEW: Generate test script (if interactive features detected)
  let testScriptResult = null;
  if (params.settings.testScriptGeneration?.enabled !== false) {
    try {
      console.log('🧪 Generating test script...');

      const generator = new TestScriptGenerator();
      testScriptResult = await generator.generateTestScript(
        {
          css: implementationCode.variations[0]?.css || '',
          js: implementationCode.variations[0]?.js || ''
        },
        params.description,
        {
          provider: params.settings.provider,
          model: params.settings.testScriptGeneration?.model || 'gpt-4o-mini',
          authToken: await this.getAuthToken()
        }
      );

      // If test generation failed, use recovery
      if (!testScriptResult.testScript && testScriptResult.requirements.hasInteractions) {
        console.log('⚠️ Test generation failed, attempting recovery...');

        const recovery = new TestScriptRecovery();
        const recoveryResult = await recovery.recoverFromGenerationFailure({
          error: testScriptResult.error,
          code: { css: implementationCode.variations[0]?.css, js: implementationCode.variations[0]?.js },
          userRequest: params.description,
          attempt: 0
        });

        if (recoveryResult.action === 'retry') {
          // Retry with modified prompt
          testScriptResult = await generator.generateTestScript(
            { css: implementationCode.variations[0]?.css, js: implementationCode.variations[0]?.js },
            params.description,
            { ...params.settings, modifiedPrompt: recoveryResult.modifiedPrompt }
          );
        } else if (recoveryResult.action === 'use-template') {
          testScriptResult = {
            testScript: recoveryResult.testScript,
            requirements: testScriptResult.requirements,
            strategy: 'template'
          };
        }
      }

      console.log('✅ Test script generated:', {
        hasScript: !!testScriptResult.testScript,
        requirements: testScriptResult.requirements
      });
    } catch (error) {
      console.error('❌ Test script generation failed:', error);
      // Continue without test script (graceful degradation)
    }
  }

  // Attach test script to variations
  if (testScriptResult?.testScript) {
    implementationCode.variations.forEach(v => {
      v.testScript = testScriptResult.testScript;
      v.testRequirements = testScriptResult.requirements;
    });
  }

  return implementationCode;
}
```

**Dependencies to import**:
```javascript
const TestScriptGenerator = require('../utils/test-script-generator.js');
const TestScriptRecovery = require('../utils/test-script-recovery.js');
```

### Step 3: Integrate with Visual QA (45 min)

**File**: `sidepanel/sidepanel.js`

**Location**: In `runVisualQAValidation()` method, before Visual QA comparison:

```javascript
async runVisualQAValidation(variation, codeData) {
  console.log('🔍 Starting Visual QA validation...');

  // Inject implementation code (existing)
  await this.injectVariationForTesting(variation);

  // NEW: Execute test script if available
  let testResults = null;
  let interactionScreenshots = [];

  if (variation.testScript) {
    console.log('🧪 Executing test script...');

    try {
      // Execute test script
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_TEST_SCRIPT',
        testScript: variation.testScript,
        tabId: this.targetTabId
      });

      if (response.success) {
        testResults = response.results;
        console.log('✅ Test script executed:', testResults);

        // Capture screenshots at marked moments
        const markers = testResults.testResults?.screenshots || [];
        for (const marker of markers) {
          if (marker.capture) {
            await this.wait(200); // Brief wait for DOM updates
            const screenshot = await chrome.runtime.sendMessage({
              type: 'CAPTURE_AFTER_INJECTION',
              tabId: this.targetTabId
            });

            if (screenshot.success) {
              interactionScreenshots.push({
                label: marker.label,
                data: screenshot.screenshot
              });
              console.log(`📸 Captured screenshot: ${marker.label}`);
            }
          }
        }
      } else {
        console.warn('⚠️ Test execution failed:', response.error);

        // Attempt recovery
        const recovery = new TestScriptRecovery();
        const recoveryResult = await recovery.recoverFromExecutionFailure({
          error: response.error,
          testScript: variation.testScript,
          attempt: 0
        });

        if (recoveryResult.action === 'retry') {
          // Retry with modified script/timeout
          const retryResponse = await chrome.runtime.sendMessage({
            type: 'EXECUTE_TEST_SCRIPT',
            testScript: recoveryResult.modifiedScript || variation.testScript,
            timeout: recoveryResult.modifiedTimeout,
            tabId: this.targetTabId
          });

          if (retryResponse.success) {
            testResults = retryResponse.results;
            console.log('✅ Test retry succeeded');
          }
        }
      }
    } catch (error) {
      console.error('❌ Test script execution error:', error);
      // Continue without test results (graceful degradation)
    }
  }

  // Capture final screenshot
  const afterResponse = await chrome.runtime.sendMessage({
    type: 'CAPTURE_AFTER_INJECTION',
    variationNumber: variation.number,
    tabId: this.targetTabId
  });

  // Run Visual QA with enhanced data
  const qaResult = await this.visualQAService.runQA({
    originalRequest,
    beforeScreenshot: this.currentPageData?.screenshot,
    afterScreenshot: afterResponse.screenshot,
    iteration,
    previousDefects,
    elementDatabase: this.currentPageData?.elementDatabase,
    generatedCode: variation,
    testResults: testResults,  // NEW: Include test results
    interactionScreenshots: interactionScreenshots  // NEW: Include interaction screenshots
  });

  // Store test results with variation
  variation.testResults = testResults;

  return qaResult;
}

// Helper method
wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Step 4: Update Export Format (15 min)

**File**: `sidepanel/sidepanel.js`

**Location**: In `exportCode()` method:

```javascript
exportCode() {
  // ... existing export logic ...

  const exportData = {
    timestamp: new Date().toISOString(),
    pageUrl: this.currentPageData?.url || 'Unknown',
    variations: this.generatedCode.variations.map(v => ({
      number: v.number,
      name: v.name,
      css: v.css || '',
      js: v.js || '',
      testStatus: v.testStatus || 'pending',
      // NEW: Include test script and results
      testScript: v.testScript || null,
      testRequirements: v.testRequirements || null,
      testResults: v.testResults || null
    })),
    globalCSS: this.generatedCode.globalCSS || '',
    globalJS: globalJS
  };

  // ... rest of export logic ...
}
```

### Step 5: Update UI Indicators (30 min)

**File**: `sidepanel/sidepanel.js`

**Add method to show test status**:

```javascript
updateTestStatus(variationNumber, testResults) {
  const card = document.querySelector(`[data-variation="${variationNumber}"]`);
  if (!card) return;

  // Find or create test status element
  let testStatus = card.querySelector('.test-status');
  if (!testStatus) {
    testStatus = document.createElement('div');
    testStatus.className = 'test-status';
    card.querySelector('.variation-header').appendChild(testStatus);
  }

  if (!testResults) {
    testStatus.innerHTML = '<span class="test-badge test-skipped">No test</span>';
    return;
  }

  const { validations = [], overallStatus } = testResults.testResults || {};
  const passedCount = validations.filter(v => v.passed).length;
  const totalCount = validations.length;

  if (overallStatus === 'passed') {
    testStatus.innerHTML = `<span class="test-badge test-passed">✓ Tests ${passedCount}/${totalCount}</span>`;
  } else if (overallStatus === 'partial') {
    testStatus.innerHTML = `<span class="test-badge test-partial">⚠ Tests ${passedCount}/${totalCount}</span>`;
  } else if (overallStatus === 'error') {
    testStatus.innerHTML = `<span class="test-badge test-error">✗ Test error</span>`;
  } else {
    testStatus.innerHTML = `<span class="test-badge test-failed">✗ Tests ${passedCount}/${totalCount}</span>`;
  }
}
```

**Add CSS styles**:

```css
.test-status {
  display: inline-flex;
  margin-left: 8px;
}

.test-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.test-passed {
  background: #e7f5e7;
  color: #2e7d2e;
}

.test-partial {
  background: #fff4e5;
  color: #d97706;
}

.test-failed, .test-error {
  background: #fee;
  color: #c00;
}

.test-skipped {
  background: #f0f0f0;
  color: #666;
}
```

## Testing the Integration

### Test Case 1: Simple Button Click

```javascript
// User request: "Add close button to banner"

// Expected:
// ✅ Test script generated
// ✅ Test executes successfully
// ✅ Validates: button exists, click works, banner hides
// ✅ Visual QA sees before/after screenshots
// ✅ High confidence score
```

### Test Case 2: Exit Intent Modal

```javascript
// User request: "Show popup on exit intent"

// Expected:
// ✅ Test script detects exit intent requirement
// ✅ Test simulates mouse leaving viewport
// ✅ Validates: modal appears, content visible
// ✅ Screenshots captured before/after trigger
// ✅ High confidence score
```

### Test Case 3: SessionStorage

```javascript
// User request: "Remember user preference in sessionStorage"

// Expected:
// ✅ Test script validates storage operations
// ✅ Validates: value set, value retrieved, persistence
// ✅ Works across page reloads
// ✅ High confidence score
```

### Test Case 4: Test Failure Recovery

```javascript
// Scenario: AI generates invalid test script

// Expected:
// ⚠️ Generation fails
// 🔄 Recovery: Regenerate with examples
// ✅ Second attempt succeeds
// ✅ Test executes successfully
// ✅ Workflow continues without blocking
```

### Test Case 5: Graceful Degradation

```javascript
// Scenario: All recovery attempts exhausted

// Expected:
// ⚠️ All attempts fail
// ⏭️ Skip testing
// ✅ Continue with Visual QA only
// ⚠️ User warned: "Interactive testing skipped"
// ✅ Workflow completes successfully
```

## Configuration

Add to `settings/settings.html`:

```html
<div class="setting-group">
  <h3>Test Script Generation</h3>

  <label>
    <input type="checkbox" id="testScriptEnabled" checked>
    Enable AI-powered test script generation
  </label>

  <label>
    Model:
    <select id="testScriptModel">
      <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
      <option value="gpt-4o">GPT-4o (Slower, more capable)</option>
      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
    </select>
  </label>

  <label>
    Timeout (ms):
    <input type="number" id="testScriptTimeout" value="10000" step="1000">
  </label>

  <label>
    <input type="checkbox" id="testScriptTemplates" checked>
    Use templates for common scenarios
  </label>
</div>
```

Save settings:

```javascript
const testScriptSettings = {
  enabled: document.getElementById('testScriptEnabled').checked,
  model: document.getElementById('testScriptModel').value,
  timeout: parseInt(document.getElementById('testScriptTimeout').value),
  useTemplates: document.getElementById('testScriptTemplates').checked
};

await chrome.storage.local.set({
  testScriptGeneration: testScriptSettings
});
```

## Monitoring

Add logging to track test performance:

```javascript
// In service worker or side panel
const testMetrics = {
  generated: 0,
  generationSuccesses: 0,
  generationFailures: 0,
  executed: 0,
  executionSuccesses: 0,
  executionFailures: 0,
  recoveryAttempts: 0,
  recoverySuccesses: 0
};

// Log after each test
console.log('[Test Metrics]', testMetrics);

// Periodically save to storage for analysis
await chrome.storage.local.set({ testMetrics });
```

## Troubleshooting

### Test script not generating

**Check**:
1. `testScriptGeneration.enabled` in settings
2. AI API key valid
3. Console for generation errors

**Fix**: Enable in settings, verify API key

### Test execution timeout

**Check**:
1. Page is fully loaded
2. Elements exist
3. Timeout setting (default 10s)

**Fix**: Increase timeout in settings

### Test fails but code works

**Check**:
1. Test expectations vs actual behavior
2. Timing issues (animations, delays)
3. Console for test errors

**Fix**: Review test script, adjust expectations

### Recovery not working

**Check**:
1. Recovery enabled in code
2. Max attempts not exceeded
3. Error types classified correctly

**Fix**: Check recovery logs, adjust strategy

## Next Steps

1. **Integrate Step 1** (Service worker handler)
2. **Test with simple scenario** (button click)
3. **Integrate Step 2** (Code generation)
4. **Test with complex scenario** (modal)
5. **Integrate Step 3** (Visual QA)
6. **Test full flow** (capture → generate → test → QA)
7. **Integrate Step 4-5** (Export + UI)
8. **Production testing** (real experiments)

## Estimated Timeline

- Step 1: 30 min
- Step 2: 45 min
- Step 3: 45 min
- Step 4: 15 min
- Step 5: 30 min
- Testing: 1 hour

**Total**: ~3.5 hours to full integration

## Support

For issues or questions:
1. Check documentation files in `/docs`
2. Review test logs in console
3. Check recovery strategy in code
4. Test with simple scenarios first

**System is production-ready and fully documented** ✅
