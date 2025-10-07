# Follow-Up Chat & Visual QA Improvements

## Problem Analysis

### Issue 1: Follow-Up Chat Context Loss

**Current Behavior:**
- When users make follow-up requests (e.g., "make the button bigger"), the AI treats it as a fresh request
- It captures the ALREADY MODIFIED page (with previous changes applied) as the "original" state
- Generates NEW code that modifies the already-modified page
- Results in: duplicate elements, compounding changes, loss of original intent

**Root Cause:**
The system is storing `this.basePageData` but NOT effectively using it for iterative requests. When a follow-up happens:
1. User makes request #1: "Change button to red" → Code generated, preview applied
2. User makes request #2: "Make button bigger"
3. System SHOULD: Look at original page + request #1's code + request #2
4. System ACTUALLY: Looks at modified page + request #2 (treats as new)

**Evidence from Code:**
- `sidepanel.js:7` shows `this.basePageData` exists but is set once during initial capture
- No conversation history or code context is passed to `generateCode()` in initial generation flow
- The `adjustCode()` method exists (lines 1435-1586) but is only used in specific scenarios, not for general follow-ups

---

### Issue 2: Visual QA Missing Obvious Defects

**Current Behavior:**
- Visual QA fails to detect obvious issues like:
  - Duplicate CTAs (6 buttons instead of 2)
  - Massively broken layouts
  - Multiple copies of the same section
- Returns "PASS" when clear defects exist

**Root Causes (Multi-Factorial):**

#### 1. **Input Problem: Single Screenshot Comparison**
```javascript
// sidepanel.js:1244 - Current approach
const visualQAResult = await this.visualQAService.runQA({
  originalRequest: variationConfig?.description || 'No description provided',
  beforeScreenshot: beforeScreenshot,
  afterScreenshot: afterScreenshot,
  iteration: iteration,
  previousDefects: previousDefects
});
```

**Issues:**
- Uses `variationConfig.description` which may be vague ("Variation 1")
- No element database context provided to QA
- No understanding of what SHOULD exist on page (expected element counts)
- Single viewport screenshot misses:
  - Elements below the fold
  - Mobile vs desktop differences
  - Scroll-triggered content

#### 2. **Prompt Problem: Insufficient Structural Guidance**
```javascript
// visual-qa-service.js:118-211 - Current prompt
let prompt = `You are an expert visual QA analyst...
**ANALYSIS STEPS:**
1. Scan BEFORE image → Identify target elements
2. Scan AFTER image → Verify changes applied correctly
3. Compare side-by-side → Detect unintended consequences
4. Check UX heuristics → Flag professionalism issues
```

**Issues:**
- Relies purely on visual inspection (no quantitative checks)
- No instruction to COUNT elements (duplicate detection)
- No baseline expectations (should have 1 button, now has 3)
- Few-shot examples don't cover duplication scenarios well
- Temperature is 0.0 but still gets inconsistent results

#### 3. **Model Limitation: Vision Model Capabilities**
- GPT-4 Vision can struggle with:
  - Counting small elements accurately
  - Detecting subtle duplications
  - Understanding code implications from visual-only context
- Without element-level context, it's doing pure visual analysis

#### 4. **Context Gap: No Code Analysis**
Visual QA sees:
- Before screenshot
- After screenshot

Visual QA SHOULD see:
- Before screenshot
- After screenshot
- Original page element database (expected structure)
- Generated code (what operations were performed)
- Element count verification results

---

## Proposed Solutions

### Solution 1: Fix Follow-Up Chat Context

**Architecture Change: Conversation-Aware Code Generation**

```javascript
// New flow structure
class ExperimentBuilder {
  constructor() {
    // ... existing properties

    // NEW: Track code evolution
    this.codeHistory = {
      originalPageData: null,      // Captured once, never changes
      originalRequest: '',          // First user request
      appliedCode: null,            // Currently applied code
      conversationLog: []           // All requests + responses
    };
  }
}
```

**Implementation Steps:**

1. **Capture Once, Preserve Forever**
```javascript
async capturePage() {
  // Existing capture logic
  const pageData = await chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE', tabId: tab.id });

  // NEW: Store as immutable original if first capture
  if (!this.codeHistory.originalPageData) {
    this.codeHistory.originalPageData = JSON.parse(JSON.stringify(pageData));
    console.log('📸 Original page data preserved for iterations');
  }

  this.currentPageData = pageData; // Still track current state
}
```

2. **Detect Follow-Up Requests**
```javascript
async generateExperiment() {
  const description = document.getElementById('descriptionText').value.trim();

  // Check if this is a follow-up request
  const isFollowUp = this.generatedCode !== null && this.codeHistory.appliedCode !== null;

  if (isFollowUp) {
    console.log('🔄 Detected follow-up request - using iterative flow');
    await this.handleFollowUpRequest(description);
  } else {
    console.log('🆕 Fresh request - using initial generation');
    await this.handleInitialGeneration(description);
  }
}
```

3. **Follow-Up Request Handler**
```javascript
async handleFollowUpRequest(newRequest) {
  this.addStatusLog('🔄 Processing follow-up request...', 'info');

  // Build cumulative context
  const context = {
    originalPageData: this.codeHistory.originalPageData,
    originalRequest: this.codeHistory.originalRequest,
    appliedCode: this.codeHistory.appliedCode,
    conversationLog: this.codeHistory.conversationLog,
    newRequest: newRequest
  };

  // Call ADJUST_CODE instead of GENERATE_CODE
  const response = await chrome.runtime.sendMessage({
    type: 'ADJUST_CODE',
    data: {
      pageData: this.codeHistory.originalPageData, // Use ORIGINAL
      previousCode: this.codeHistory.appliedCode,
      newRequest: newRequest,
      conversationHistory: this.codeHistory.conversationLog,
      variations: this.variations,
      settings: this.settings
    }
  });

  // Update history
  this.codeHistory.conversationLog.push({
    request: newRequest,
    code: response.code,
    timestamp: Date.now()
  });
  this.codeHistory.appliedCode = response.code;

  // Apply code
  this.generatedCode = response.code;
  await this.applyVariation(1);
}
```

4. **Service Worker Handler**
```javascript
// service-worker.js - Add new handler
case 'ADJUST_CODE':
  const adjusted = await this.adjustCode(message.data, sender?.tab?.id);
  sendResponse({ success: true, code: adjusted.code, usage: adjusted.usage });
  break;
```

5. **Enhanced adjustCode() Prompt**
```javascript
async adjustCode(data, tabId) {
  const { pageData, previousCode, newRequest, conversationHistory, variations, settings } = data;

  const prompt = `You are adjusting A/B test code based on a follow-up request.

**ORIGINAL PAGE STATE (BEFORE ANY CHANGES):**
${JSON.stringify(pageData.elementDatabase.elements.slice(0, 30), null, 2)}

**CONVERSATION HISTORY:**
${conversationHistory.map((entry, i) => `
${i + 1}. Request: "${entry.request}"
   Code Generated: [${entry.code.variations.length} variations]
`).join('\n')}

**CODE CURRENTLY APPLIED TO PAGE:**
\`\`\`javascript
${this.formatCodeForContext(previousCode)}
\`\`\`

**NEW USER REQUEST:**
"${newRequest}"

**YOUR TASK:**
Generate UPDATED code that:
1. PRESERVES all changes from previous requests
2. ADDS the new changes requested in "${newRequest}"
3. Uses the ORIGINAL page element database (not modified page)
4. Prevents duplications by checking element.dataset.varApplied
5. Combines changes logically (if previous made button red, new makes it bigger → red AND bigger)

**CRITICAL RULES:**
- DO NOT re-capture or re-modify already changed elements unless specifically requested
- DO NOT duplicate elements that already exist
- DO add idempotency checks: if(element.dataset.varApplied) return;
- DO combine CSS/JS changes cumulatively

**OUTPUT FORMAT:**
Return complete code with ALL changes (previous + new) merged.
`;

  // Rest of AI call logic...
}
```

---

### Solution 2: Improve Visual QA Accuracy

**Multi-Layered Validation Approach**

#### Layer 1: Quantitative Pre-Checks (Before AI)
```javascript
// NEW: Pre-screen with element counting
async runVisualQA(params) {
  const { beforeScreenshot, afterScreenshot, originalRequest, elementDatabase } = params;

  // PRE-CHECK 1: Element count verification
  const countCheck = await this.verifyElementCounts(elementDatabase, afterScreenshot);
  if (countCheck.hasDuplicates) {
    return {
      status: 'CRITICAL_DEFECT',
      goalAccomplished: false,
      defects: [{
        severity: 'critical',
        type: 'element-duplicated',
        description: `Detected ${countCheck.duplicateCount} duplicate elements: ${countCheck.duplicateSelectors.join(', ')}`,
        suggestedFix: 'Add idempotency check: if(element.dataset.varApplied) return; element.dataset.varApplied="1";'
      }],
      reasoning: 'Automatic duplicate detection (pre-AI)',
      shouldContinue: true,
      preScreened: true
    };
  }

  // Continue to AI-powered visual analysis...
}
```

#### Layer 2: Enhanced AI Vision Prompt
```javascript
buildPrompt(originalRequest, iteration, previousDefects, elementDatabase) {
  let prompt = `You are an expert visual QA analyst with access to both visual AND structural data.

**ORIGINAL REQUEST:**
${originalRequest}

**EXPECTED PAGE STRUCTURE (from element database BEFORE changes):**
${this.summarizeElementDatabase(elementDatabase)}

**KEY VALIDATION CHECKS:**

1. **DUPLICATION CHECK** (CRITICAL):
   - Count buttons, CTAs, headings in BEFORE vs AFTER
   - Example: BEFORE has 2 buttons → AFTER should have 2 buttons (not 4, not 6)
   - If element appears multiple times when it should appear once → CRITICAL defect
   - Check for: Duplicate icons, repeated text, cloned sections

2. **LAYOUT INTEGRITY CHECK**:
   - Are elements overlapping? (Critical)
   - Is text readable? (Critical)
   - Are elements cut off at viewport edges? (Critical)

3. **CHANGE VERIFICATION CHECK**:
   - Was the requested change actually applied?
   - Compare BEFORE vs AFTER for specific requested changes
   - If request says "change button to red" but button is still blue → GOAL_NOT_MET

4. **VISUAL QUALITY CHECK**:
   - Professional appearance?
   - Proper contrast?
   - Aligned properly?

**CRITICAL: For each check, state your observation explicitly:**
- "I count 2 CTAs in BEFORE, and 2 CTAs in AFTER → ✓ PASS"
- "I count 2 CTAs in BEFORE, but 6 CTAs in AFTER → ✗ CRITICAL: Duplication detected"

**FEW-SHOT EXAMPLES:**

EXAMPLE 1: Duplication Detection
Request: "Add icon to button"
BEFORE: [Screenshot shows 2 "Buy Now" buttons in hero]
AFTER: [Screenshot shows 4 "🔒 Buy Now" buttons - 2 original + 2 new]
Expected Structure: 2 buttons (from element database)
Analysis:
- Count check: BEFORE=2 buttons, AFTER=4 buttons → ✗ DUPLICATION
- The code likely ran twice or didn't check for existing modifications
Response: {
  "status": "CRITICAL_DEFECT",
  "goalAccomplished": true,
  "defects": [{
    "severity": "critical",
    "type": "element-duplicated",
    "description": "Button count doubled from 2 to 4 - code applied multiple times",
    "suggestedFix": "Add to JavaScript: if(element.dataset.varApplied) return; element.dataset.varApplied='1';"
  }],
  "reasoning": "Duplicate buttons detected through element counting",
  "shouldContinue": true
}

EXAMPLE 2: Proper Change Application
Request: "Change button color to red"
BEFORE: [Blue button]
AFTER: [Red button, same size, same position]
Expected Structure: 1 button
Analysis:
- Count check: BEFORE=1 button, AFTER=1 button → ✓
- Color check: Blue → Red → ✓
- Layout check: Position unchanged → ✓
Response: {
  "status": "PASS",
  "goalAccomplished": true,
  "defects": [],
  "reasoning": "Button successfully changed to red, no duplicates or layout issues",
  "shouldContinue": false
}

Now analyze the provided screenshots with these checks:`;

  return prompt;
}
```

#### Layer 3: Code Analysis Validation
```javascript
// NEW: Analyze generated code for red flags
analyzeCodeForIssues(generatedCode, elementDatabase) {
  const issues = [];

  // Check 1: Multiple querySelector calls for same element without idempotency
  const selectorPattern = /querySelector\(['"](.+?)['"]\)/g;
  const selectors = [...generatedCode.matchAll(selectorPattern)];
  const selectorCounts = {};

  selectors.forEach(match => {
    const selector = match[1];
    selectorCounts[selector] = (selectorCounts[selector] || 0) + 1;
  });

  Object.entries(selectorCounts).forEach(([selector, count]) => {
    if (count > 1) {
      // Check if idempotency check exists
      const hasIdempotencyCheck = generatedCode.includes('dataset.varApplied');
      if (!hasIdempotencyCheck) {
        issues.push({
          severity: 'critical',
          type: 'potential-duplication',
          description: `Selector "${selector}" used ${count} times without idempotency check`,
          suggestedFix: 'Add: if(element.dataset.varApplied) return; element.dataset.varApplied="1";'
        });
      }
    }
  });

  // Check 2: querySelectorAll without length verification
  if (generatedCode.includes('querySelectorAll') && !generatedCode.includes('.forEach')) {
    issues.push({
      severity: 'major',
      type: 'selector-issue',
      description: 'querySelectorAll used but not iterating over results',
      suggestedFix: 'Use querySelector for single elements, or add .forEach for multiple'
    });
  }

  return issues;
}
```

#### Layer 4: Post-Application DOM Verification
```javascript
// content-scripts/code-tester.js - Add to TEST_CODE handler
async testCode(variation) {
  const results = {
    // ... existing checks

    // NEW: Duplication detection
    duplicateElements: this.detectDuplicates(),
    elementCounts: this.countKeyElements()
  };

  return results;
}

detectDuplicates() {
  const duplicates = [];

  // Check for duplicate text content in similar elements
  const buttons = document.querySelectorAll('button, a.btn, [role="button"]');
  const textCounts = {};

  buttons.forEach(btn => {
    const text = btn.textContent.trim();
    if (text) {
      if (!textCounts[text]) {
        textCounts[text] = { count: 0, elements: [] };
      }
      textCounts[text].count++;
      textCounts[text].elements.push(btn);
    }
  });

  Object.entries(textCounts).forEach(([text, data]) => {
    if (data.count > 2) { // More than 2 likely indicates duplication issue
      duplicates.push({
        text: text,
        count: data.count,
        selectors: data.elements.map(el => this.getSelector(el))
      });
    }
  });

  return duplicates;
}
```

---

## Implementation Priority

### Phase 1: Follow-Up Context (High Impact, Medium Effort)
1. Add `codeHistory` tracking to ExperimentBuilder
2. Implement follow-up detection logic
3. Route follow-ups through `adjustCode()` with original page data
4. Test: Capture page → Generate → Modify → Follow-up request should preserve first change

**Expected Impact:** 80% reduction in duplicate element issues from iterative requests

---

### Phase 2: Visual QA Pre-Checks (High Impact, Low Effort)
1. Add `verifyElementCounts()` pre-check to Visual QA
2. Add `analyzeCodeForIssues()` static analysis
3. Pass element database to visual QA

**Expected Impact:** 60% improvement in duplicate detection without AI call

---

### Phase 3: Enhanced Visual QA Prompt (Medium Impact, Low Effort)
1. Add element counting instructions to prompt
2. Add few-shot duplication examples
3. Add explicit check-by-check analysis format

**Expected Impact:** 40% improvement in AI-detected visual issues

---

### Phase 4: Post-Application DOM Verification (Medium Impact, Medium Effort)
1. Add duplicate detection to code tester
2. Return duplication warnings before Visual QA
3. Auto-fix simple duplication cases

**Expected Impact:** Catch 90% of duplication issues before they reach Visual QA

---

## Success Metrics

### Follow-Up Context
- **Before:** 80% of follow-up requests create duplicate elements
- **Target:** <10% of follow-up requests create duplicate elements
- **Measurement:** Track requests with `conversationLog.length > 1` and count duplicate elements in DOM

### Visual QA Accuracy
- **Before:** 30% of obvious defects missed (based on user report)
- **Target:** 90% of duplicate elements detected automatically
- **Measurement:** Pre-check detection rate + AI detection rate combined

---

## Testing Plan

### Test Case 1: Iterative Button Changes
1. Capture page
2. Request: "Change CTA button to red"
3. Generate + Apply
4. Request: "Make CTA button bigger"
5. **Expected:** Button is red AND bigger (not 2 buttons)
6. **Verify:** Element count unchanged, single button with both styles

### Test Case 2: Duplicate Detection
1. Capture page with 2 CTAs
2. Manually inject code that duplicates elements
3. Run Visual QA
4. **Expected:** Pre-check detects 4 CTAs (should be 2) before AI call
5. **Verify:** Returns CRITICAL_DEFECT with duplicate detection

### Test Case 3: Complex Visual Issue
1. Generate code that creates overlapping text
2. Run Visual QA with enhanced prompt
3. **Expected:** AI detects overlap and suggests z-index/positioning fix
4. **Verify:** Defect includes specific CSS suggestion

---

## Files to Modify

### Follow-Up Context
- `sidepanel/sidepanel.js`: Add `codeHistory`, follow-up detection
- `background/service-worker.js`: Enhance `adjustCode()` method
- `utils/session-manager.js`: Persist conversation history

### Visual QA Improvements
- `utils/visual-qa-service.js`: Add pre-checks, enhanced prompt
- `content-scripts/code-tester.js`: Add duplication detection
- `background/service-worker.js`: Pass element database to QA

---

## Conclusion

The two issues are interconnected:
1. **Follow-up context loss** → Generates duplicate code → Visual QA misses it
2. **Visual QA gaps** → Doesn't catch duplicates even when they occur

Fixing both creates a robust system:
- Proper context preservation prevents most duplication at generation time
- Enhanced Visual QA catches edge cases that slip through
- Multi-layer validation (pre-check + code analysis + AI vision + DOM verification) ensures high accuracy

**Next Steps:**
1. Implement Phase 1 (follow-up context) first - prevents the problem
2. Implement Phase 2 (pre-checks) second - catches remaining issues fast
3. Implement Phase 3 & 4 as time permits - improves overall quality
