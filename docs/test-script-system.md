# Test Script System - Implementation Guide

## Overview

New AI-powered test script generation system to validate interactive features and behavioral changes that Visual QA alone cannot detect.

## Problem Solved

**Before**: Visual QA only captured static screenshots
- ❌ Missed interactive features (clicks, hovers)
- ❌ Missed behavioral triggers (exit intent, scroll)
- ❌ Missed dynamic state (modals, session storage)
- ❌ Missed time-based features (countdowns, delays)

**After**: AI generates test scripts that simulate interactions
- ✅ Validates clicks, hovers, form fills
- ✅ Validates exit intent, scroll triggers
- ✅ Validates modals, dropdowns, carousels
- ✅ Validates sessionStorage, localStorage
- ✅ Captures screenshots at key moments

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────┐
│  1. Test Patterns Library (test-patterns.js)           │
│     - Reusable test utilities                           │
│     - Runs in MAIN world                               │
│     - Examples: simulateClick, waitForElement          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  2. Test Script Generator (test-script-generator.js)   │
│     - Analyzes implementation code                      │
│     - Detects interaction requirements                  │
│     - Calls AI to generate test script                │
│     - Returns async function testVariation()          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  3. Test Script Executor (test-script-executor.js)     │
│     - Injects test patterns + test script              │
│     - Executes in MAIN world with timeout             │
│     - Captures screenshots at markers                  │
│     - Returns structured results                       │
└─────────────────────────────────────────────────────────┘
```

## File Structure

### 1. test-patterns.js (328 lines)
**Purpose**: Library of reusable test utilities

**Key Functions**:
```javascript
// Element operations
await TestPatterns.waitForElement(selector, timeout)
TestPatterns.exists(selector)
TestPatterns.isVisible(selector)
TestPatterns.getText(selector)
TestPatterns.countElements(selector)

// Interaction simulation
await TestPatterns.simulateClick(selector)
await TestPatterns.simulateHover(selector)
await TestPatterns.fillInput(selector, value)

// Behavioral triggers
await TestPatterns.simulateExitIntent()
await TestPatterns.scrollTo(yPosition)
await TestPatterns.scrollToElement(selector)

// Storage access
TestPatterns.getSessionStorage(key)
TestPatterns.getLocalStorage(key)

// Validation
await TestPatterns.validate(name, condition, expected, actual)
TestPatterns.captureState(label)
```

**Where it runs**: Injected into MAIN world before test execution

### 2. test-script-generator.js (318 lines)
**Purpose**: Analyzes code and generates AI-powered test scripts

**Key Methods**:
```javascript
// Analyze what kind of testing is needed
analyzeInteractionRequirements(code, userRequest)
// Returns: { hasInteractions, types: ['click', 'session'], complexity, suggestedDuration }

// Build AI prompt for test generation
buildTestScriptPrompt(code, userRequest, requirements)
// Returns: Detailed prompt with examples

// Generate test script using AI
async generateTestScript(code, userRequest, settings)
// Returns: { testScript, requirements, suggestedDuration }
```

**Interaction Detection**:
- `click`: addEventListener('click'), .click(), onclick=
- `hover`: addEventListener('mouseenter'), :hover
- `scroll`: addEventListener('scroll'), scrollIntoView
- `exitIntent`: mouseout, clientY < 0
- `session`: sessionStorage.getItem/setItem
- `local`: localStorage.getItem/setItem
- `modal`: modal, popup, overlay, .show(), .open()
- `form`: input, textarea, select, .value =
- `timer`: setTimeout, setInterval, Date()
- `animation`: animate, transition, @keyframes

**AI Prompt Strategy**:
- Provides TestPatterns API reference
- Shows example test script structure
- Includes specific requirements based on detected interactions
- Uses temperature 0.3 for consistent output
- Enforces strict output format (function only, no explanations)

### 3. test-script-executor.js (371 lines)
**Purpose**: Executes test scripts safely in MAIN world

**Key Methods**:
```javascript
// Execute test with timeout protection
async executeTestScript(testScript, options)
// Returns: { success, results, executionTime }

// Build complete executable code
buildExecutionCode(testScript)
// Includes: TestPatterns + testScript + execution wrapper

// Extract screenshot markers
extractScreenshotMarkers(results)
// Returns: [{ label, timestamp }, ...]
```

**Safety Features**:
- Timeout protection (default 10s)
- Try/catch error handling
- Structured result format
- Screenshot marker extraction
- Result validation

## Integration Points

### Phase 1: Service Worker Handler (TODO)
**File**: `background/service-worker.js`

**New handler**: `EXECUTE_TEST_SCRIPT`
```javascript
case 'EXECUTE_TEST_SCRIPT':
  const executor = new TestScriptExecutor();
  const executableCode = executor.buildExecutionCode(message.testScript);

  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (code) => eval(code),
    args: [executableCode]
  });

  sendResponse({ success: true, results: result[0].result });
  break;
```

### Phase 2: Code Generation Integration (TODO)
**File**: `background/service-worker.js::generateCode()`

**After implementation code is generated**:
```javascript
// Generate implementation code (existing)
const implementationCode = await this.callAI(prompt, settings);

// NEW: Generate test script
const generator = new TestScriptGenerator();
const testScriptResult = await generator.generateTestScript(
  implementationCode,
  userRequest,
  settings
);

// Return both
return {
  implementation: implementationCode,
  testScript: testScriptResult.testScript,
  testRequirements: testScriptResult.requirements
};
```

### Phase 3: Visual QA Integration (TODO)
**File**: `sidepanel/sidepanel.js::runVisualQAValidation()`

**Before Visual QA comparison**:
```javascript
// Apply implementation code
await this.previewVariation(variation);

// NEW: Execute test script if available
if (variation.testScript) {
  const testResults = await chrome.runtime.sendMessage({
    type: 'EXECUTE_TEST_SCRIPT',
    testScript: variation.testScript,
    tabId: this.targetTabId
  });

  // Capture screenshots at marked moments
  for (const marker of testResults.screenshotMarkers) {
    const screenshot = await captureScreenshot();
    screenshots.push({ label: marker.label, data: screenshot });
  }
}

// Run Visual QA with enhanced data
const qaResult = await this.visualQAService.runQA({
  originalRequest,
  beforeScreenshot,
  afterScreenshot,
  testResults: testResults,  // NEW
  interactionScreenshots: screenshots  // NEW
});
```

## Example: Countdown Banner with Close Button

### User Request
"Add X button to close countdown banner"

### Implementation Code
```css
.close-banner {
  position: absolute;
  right: 10px;
  cursor: pointer;
}
```

```javascript
window.closeBanner = function() {
  document.querySelector('.countdown-banner').style.display = 'none';
  sessionStorage.setItem('bannerClosed', 'true');
}

document.getElementById('close-banner').addEventListener('click', window.closeBanner);
```

### Detected Interactions
```javascript
{
  hasInteractions: true,
  types: ['click', 'session'],
  complexity: 'medium',
  suggestedDuration: 3000
}
```

### Generated Test Script
```javascript
async function testVariation() {
  const results = {
    interactions: [],
    validations: [],
    screenshots: []
  };

  try {
    // Test 1: Close button exists
    const closeBtn = await TestPatterns.waitForElement('#close-banner', 3000);
    results.screenshots.push({ label: 'before-close', capture: true });

    results.validations.push(await TestPatterns.validate(
      'close button exists',
      !!closeBtn,
      'button found',
      closeBtn ? 'found' : 'not found'
    ));

    // Test 2: Click closes banner
    const clicked = await TestPatterns.simulateClick('#close-banner');
    results.interactions.push({ type: 'click', target: '#close-banner', success: clicked });

    await TestPatterns.wait(500);
    results.screenshots.push({ label: 'after-close', capture: true });

    // Test 3: Banner is hidden
    const bannerVisible = TestPatterns.isVisible('.countdown-banner');
    results.validations.push(await TestPatterns.validate(
      'banner hidden after click',
      !bannerVisible,
      'banner hidden',
      bannerVisible ? 'visible' : 'hidden'
    ));

    // Test 4: SessionStorage set
    const storageValue = TestPatterns.getSessionStorage('bannerClosed');
    results.validations.push(await TestPatterns.validate(
      'sessionStorage set to true',
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
```

### Test Results
```javascript
{
  interactions: [
    { type: 'click', target: '#close-banner', success: true }
  ],
  validations: [
    { test: 'close button exists', passed: true },
    { test: 'banner hidden after click', passed: true },
    { test: 'sessionStorage set to true', passed: true }
  ],
  screenshots: [
    { label: 'before-close', capture: true },
    { label: 'after-close', capture: true }
  ],
  overallStatus: 'passed'
}
```

### Visual QA with Test Results
AI sees:
- Before screenshot: Banner visible with close button
- After screenshot: Banner hidden
- Test validations: All passed
- Interaction success: Click worked
- Storage validation: sessionStorage = 'true'

**Confidence**: HIGH - Both visual and behavioral validation passed

## Benefits

1. **Interactive Validation**
   - Exit intent popups tested
   - Click interactions verified
   - Hover effects validated
   - Form fills checked

2. **Behavioral Validation**
   - sessionStorage/localStorage verified
   - Timer behavior validated
   - Dynamic state changes captured
   - Multiple screenshots at key moments

3. **Faster Iteration**
   - Catches issues automatically
   - No manual testing required
   - AI sees full behavior, not just static state

4. **Better Confidence**
   - Visual QA + behavioral validation
   - Higher confidence scores
   - Fewer false positives

## Trade-offs

**Pros**:
- ✅ Handles all feature types (interactive, behavioral, time-based)
- ✅ AI-generated = flexible (adapts to any scenario)
- ✅ No manual test writing
- ✅ Works with existing Visual QA

**Cons**:
- ❌ Extra AI call (adds cost ~$0.01-0.02 per test)
- ❌ Test generation might fail
- ❌ Requires robust error handling

**Mitigation**:
- Use cheaper model (GPT-4o-mini) for test generation
- Cache test scripts for similar features
- Fallback to static Visual QA if test fails
- Optional feature (can be disabled)

## Implementation Status

- ✅ **Phase 1**: Test patterns library created
- ✅ **Phase 2**: Test script generator created
- ✅ **Phase 3**: Test script executor created
- ⏳ **Phase 4**: Service worker integration (TODO)
- ⏳ **Phase 5**: Code generation integration (TODO)
- ⏳ **Phase 6**: Visual QA integration (TODO)

## Next Steps

1. Add `EXECUTE_TEST_SCRIPT` handler to service-worker.js
2. Integrate test generation into code generation flow
3. Update Visual QA to execute tests before comparison
4. Add test script to export JSON format
5. Add UI toggle to enable/disable test generation
6. Test with real scenarios (modals, exit intent, forms)

## Cost Analysis

**Per variation**:
- Implementation generation: ~$0.05-0.15 (existing)
- Test generation: ~$0.01-0.02 (new, GPT-4o-mini)
- Visual QA: ~$0.10-0.20 (existing, vision model)

**Total**: ~$0.16-0.37 per variation (6-11% increase)

**Value**: Catches interactive bugs that would require manual testing → saves significant QA time

## Configuration

Add to settings:
```javascript
{
  "testScriptGeneration": {
    "enabled": true,
    "model": "gpt-4o-mini",
    "timeout": 10000,
    "generateForStatic": false  // Skip for non-interactive features
  }
}
```
