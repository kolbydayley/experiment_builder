# AI Visual QA System - Detailed Design

## 🎯 Goal

Use GPT-4 Vision to validate **ONLY** that the AI accomplished the intended goal, not to endlessly improve the design.

## ❌ Anti-Pattern (What We DON'T Want)

```
Iteration 1: AI changes button color
Visual QA: "Color changed but could be brighter"
  ↓
Iteration 2: AI makes color brighter
Visual QA: "Brighter but shadow could be better"
  ↓
Iteration 3: AI adds shadow
Visual QA: "Shadow good but text could be bolder"
  ↓
... INFINITE LOOP ...
```

## ✅ Correct Pattern (What We DO Want)

```
Iteration 1: AI changes button color
Visual QA: "✓ Goal accomplished. Color changed as requested. No visual defects."
  ↓
STOP ✅

OR

Iteration 1: AI changes button color but text becomes unreadable
Visual QA: "❌ Text is white on white background (unreadable). Fix contrast."
  ↓
Iteration 2: AI fixes text color
Visual QA: "✓ Goal accomplished. Readable text. No defects."
  ↓
STOP ✅
```

## 🏗️ Architecture

### Decision Framework:

```
Is the ORIGINAL GOAL accomplished?
  ├─ YES → Are there DEFECTS (broken, ugly, unusable)?
  │   ├─ NO → ✅ PASS (stop iteration)
  │   └─ YES → ⚠️ NEEDS FIX (continue with specific fix)
  │
  └─ NO → ❌ GOAL NOT MET (continue with specific fix)
```

### Defect Categories (Only These Trigger Fixes):

1. **CRITICAL DEFECTS** (Must fix):
   - Text unreadable (low contrast, invisible, cut off)
   - Layout broken (overlapping, overflow, misaligned)
   - Element not visible or missing
   - Functionality broken (button not clickable, etc.)

2. **MAJOR DEFECTS** (Should fix):
   - Text misaligned within container (top-aligned in button)
   - Excessive spacing issues (too cramped or too sparse)
   - Visual hierarchy broken (wrong emphasis)
   - Colors clash severely (hurts eyes)

3. **NOT DEFECTS** (Ignore these):
   - Could be prettier
   - Different style preference
   - Minor spacing tweaks
   - Aesthetic improvements
   - "This could also be..."

---

## 📋 AI Visual QA Prompt (Version 1)

```javascript
const buildVisualQAPrompt = (originalRequest, beforeScreenshot, afterScreenshot, iteration) => {
  return {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a QA validator for A/B test variations. Your ONLY job is to verify:
1. Was the original goal accomplished?
2. Are there visual DEFECTS (broken, ugly, unusable)?

You are NOT a designer. Do NOT suggest improvements unless something is actually broken.

CRITICAL: You must categorize findings as:
- GOAL_NOT_MET: Original request was not implemented
- CRITICAL_DEFECT: Unusable (invisible text, broken layout, etc.)
- MAJOR_DEFECT: Poor quality (misaligned, bad contrast, etc.)
- PASS: Goal met, no defects (even if not perfect)

If status is PASS, stop iteration. Do NOT suggest improvements.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
**ITERATION ${iteration}/5**

**ORIGINAL USER REQUEST:**
${originalRequest}

**YOUR TASK:**
Compare BEFORE and AFTER screenshots. Answer these questions ONLY:

1. Was the user's request accomplished? (YES/NO)
2. Are there visual DEFECTS? (List ONLY if broken/ugly/unusable)

**DEFECT = Something actually broken:**
- Text is unreadable (cut off, invisible, bad contrast)
- Layout is broken (overlapping, misaligned, overflow)
- Element is missing or not visible
- Functionality is broken

**NOT A DEFECT = Subjective preference:**
- Could be prettier
- Different color might be better
- Spacing could be improved
- "I would have done X instead"

**OUTPUT FORMAT (JSON):**
{
  "status": "PASS" | "GOAL_NOT_MET" | "CRITICAL_DEFECT" | "MAJOR_DEFECT",
  "goalAccomplished": true/false,
  "defects": [
    {
      "severity": "critical" | "major",
      "type": "text-unreadable" | "layout-broken" | "element-missing" | "text-misaligned" | "color-clash" | "spacing-issue",
      "description": "Specific defect description (be precise)",
      "suggestedFix": "Exact change needed to fix this defect ONLY"
    }
  ],
  "reasoning": "Brief explanation of status decision",
  "shouldContinue": true/false
}

**IMPORTANT:**
- If status is PASS, set shouldContinue = false
- Only list actual DEFECTS, not improvements
- Be strict about what qualifies as a defect
- Prefer PASS over endless iteration

**SCREENSHOTS:**
1. BEFORE (original state)
2. AFTER (with variation applied)
`
          },
          {
            type: 'image_url',
            image_url: {
              url: beforeScreenshot,
              detail: 'high'
            }
          },
          {
            type: 'image_url',
            image_url: {
              url: afterScreenshot,
              detail: 'high'
            }
          }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
    temperature: 0.3 // Lower temperature for more consistent decisions
  };
};
```

---

## 🔄 Integration with Auto-Iteration Flow

### Current Flow:
```javascript
async autoIterateVariation(variationNumber) {
  for (let iteration = 1; iteration <= 5; iteration++) {
    // Apply variation
    await this.applyVariation(variation);

    // Test for technical errors
    const testResult = await this.testVariation(variationNumber);

    if (testResult.errors.length === 0) {
      break; // Success!
    }

    // Send errors to AI for fix
    const fixedCode = await this.requestFix(testResult.errors);
  }
}
```

### New Flow with Visual QA:
```javascript
async autoIterateVariation(variationNumber) {
  const variation = this.getVariation(variationNumber);
  const originalRequest = this.getOriginalRequest(variation);

  // Capture BEFORE screenshot ONCE at start
  const beforeScreenshot = await this.captureScreenshot();

  for (let iteration = 1; iteration <= 5; iteration++) {
    this.addStatusLog(`📋 Testing Variation ${variationNumber} - Iteration ${iteration}/5`);

    // Step 1: Apply variation
    await this.applyVariation(variation);
    await this.sleep(1000); // Let changes render

    // Step 2: Capture AFTER screenshot
    const afterScreenshot = await this.captureScreenshot();

    // Step 3: Check technical errors (selectors, JS errors)
    const technicalResult = await this.checkTechnicalErrors(variationNumber);

    if (technicalResult.errors.length > 0) {
      // Technical failure - fix and retry
      this.addStatusLog(`  ⚠️ Technical errors: ${technicalResult.errors.join(', ')}`);
      const fixedCode = await this.requestTechnicalFix(technicalResult.errors);
      this.updateVariationCode(variationNumber, fixedCode);
      continue; // Retry
    }

    // Step 4: AI Visual QA (always run if no technical errors)
    this.addStatusLog(`  🤖 Running AI Visual QA...`);

    const visualQA = await this.runVisualQA({
      originalRequest,
      beforeScreenshot,
      afterScreenshot,
      iteration
    });

    // Step 5: Parse Visual QA response
    this.displayVisualQAResult(visualQA);

    if (visualQA.status === 'PASS') {
      // Success! Goal accomplished, no defects
      this.addStatusLog(`  ✅ Visual QA PASSED: ${visualQA.reasoning}`, 'success');
      this.showSuccess(`Variation ${variationNumber} passed visual QA`);
      break; // STOP iteration
    }

    if (visualQA.status === 'GOAL_NOT_MET') {
      // Goal not accomplished
      this.addStatusLog(`  ❌ Goal not met: ${visualQA.reasoning}`, 'error');
      const fixedCode = await this.requestVisualFix(originalRequest, visualQA);
      this.updateVariationCode(variationNumber, fixedCode);
      continue; // Retry
    }

    if (visualQA.status === 'CRITICAL_DEFECT' || visualQA.status === 'MAJOR_DEFECT') {
      // Defects found
      this.addStatusLog(`  ⚠️ ${visualQA.defects.length} defect(s) found`, 'error');
      visualQA.defects.forEach((defect, idx) => {
        this.addStatusLog(`    ${idx + 1}. ${defect.description}`, 'error');
      });

      const fixedCode = await this.requestVisualFix(originalRequest, visualQA);
      this.updateVariationCode(variationNumber, fixedCode);
      continue; // Retry
    }

    // Fallback: shouldn't get here
    this.addStatusLog(`  ⚠️ Unexpected Visual QA status: ${visualQA.status}`, 'error');
    break;
  }
}
```

---

## 🛡️ Termination Safeguards

### 1. Hard Iteration Limit
```javascript
const MAX_ITERATIONS = 5;

if (iteration >= MAX_ITERATIONS) {
  this.addStatusLog(`⏸ Reached maximum iterations (${MAX_ITERATIONS})`, 'error');
  this.addStatusLog(`  Latest status: ${visualQA.status}`, 'info');
  this.addStatusLog(`  User can manually approve or edit`, 'info');
  break;
}
```

### 2. Status-Based Termination
```javascript
// ONLY continue if one of these statuses:
const CONTINUE_STATUSES = ['GOAL_NOT_MET', 'CRITICAL_DEFECT', 'MAJOR_DEFECT'];

if (!CONTINUE_STATUSES.includes(visualQA.status)) {
  // PASS or unknown status = stop
  break;
}

// Extra safety: Check shouldContinue flag
if (visualQA.shouldContinue === false) {
  break;
}
```

### 3. Repeated Identical Issues Detection
```javascript
// Track issues across iterations
const issueHistory = [];

for (let iteration = 1; iteration <= 5; iteration++) {
  const visualQA = await this.runVisualQA(...);

  // Create issue fingerprint
  const issueFingerprint = visualQA.defects
    .map(d => `${d.type}:${d.description}`)
    .sort()
    .join('|');

  // Check if we've seen this exact issue before
  if (issueHistory.includes(issueFingerprint)) {
    this.addStatusLog(`⚠️ Same issue repeating - stopping to prevent loop`, 'error');
    this.addStatusLog(`  Issue: ${issueFingerprint}`, 'info');
    this.addStatusLog(`  AI may need manual intervention`, 'info');
    break;
  }

  issueHistory.push(issueFingerprint);
}
```

### 4. Progress Detection
```javascript
// Track if we're making progress
let lastDefectCount = Infinity;

for (let iteration = 1; iteration <= 5; iteration++) {
  const visualQA = await this.runVisualQA(...);
  const currentDefectCount = visualQA.defects.length;

  if (currentDefectCount >= lastDefectCount) {
    // Not improving or getting worse
    this.addStatusLog(`⚠️ No improvement from iteration ${iteration - 1} to ${iteration}`, 'error');

    if (iteration >= 3) {
      // After 3 iterations with no progress, stop
      this.addStatusLog(`  Stopping - not making progress`, 'error');
      break;
    }
  }

  lastDefectCount = currentDefectCount;
}
```

---

## 📊 Visual QA Response Examples

### Example 1: PASS (Stop immediately)
```json
{
  "status": "PASS",
  "goalAccomplished": true,
  "defects": [],
  "reasoning": "User requested orange button. Button is now orange. Text is readable and centered. No visual defects.",
  "shouldContinue": false
}
```

### Example 2: GOAL_NOT_MET (Continue)
```json
{
  "status": "GOAL_NOT_MET",
  "goalAccomplished": false,
  "defects": [
    {
      "severity": "major",
      "type": "goal-incomplete",
      "description": "User requested 'orange button with white text' but text is still blue",
      "suggestedFix": "Change text color to white: element.style.color = '#ffffff'"
    }
  ],
  "reasoning": "Button color changed to orange but text color not updated as requested",
  "shouldContinue": true
}
```

### Example 3: CRITICAL_DEFECT (Continue)
```json
{
  "status": "CRITICAL_DEFECT",
  "goalAccomplished": true,
  "defects": [
    {
      "severity": "critical",
      "type": "text-unreadable",
      "description": "Text is white on white background (completely invisible)",
      "suggestedFix": "Change text color to dark: element.style.color = '#1f2937'"
    }
  ],
  "reasoning": "Goal accomplished but critical defect: text is invisible",
  "shouldContinue": true
}
```

### Example 4: MAJOR_DEFECT (Continue)
```json
{
  "status": "MAJOR_DEFECT",
  "goalAccomplished": true,
  "defects": [
    {
      "severity": "major",
      "type": "text-misaligned",
      "description": "Button text is top-aligned instead of centered",
      "suggestedFix": "Add align-items: center to button flex container"
    }
  ],
  "reasoning": "Goal accomplished but text alignment is poor quality",
  "shouldContinue": true
}
```

### Example 5: NOT A DEFECT (Should be PASS)
```json
{
  "status": "PASS",
  "goalAccomplished": true,
  "defects": [],
  "reasoning": "User requested red button. Button is red. Border radius could be 8px instead of 6px, but this is not a defect - just a preference. Marking as PASS.",
  "shouldContinue": false
}
```

---

## 🎨 UI Integration

### Show Visual QA Feedback:

```
┌─────────────────────────────────────────────────────────┐
│  Variation 1: Bold Orange CTA                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  BEFORE              →              AFTER               │
│  [screenshot]                      [screenshot]         │
│                                                         │
│  🤖 AI Visual QA Results:                               │
│                                                         │
│  ⚠️ MAJOR_DEFECT - 1 issue found                       │
│                                                         │
│  Issue:                                                 │
│  • Text is top-aligned instead of centered              │
│    Fix: Add align-items: center to flex container      │
│                                                         │
│  🔧 AI is generating fix... (Iteration 2/5)            │
└─────────────────────────────────────────────────────────┘
```

After fix:

```
┌─────────────────────────────────────────────────────────┐
│  Variation 1: Bold Orange CTA                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  BEFORE              →              AFTER               │
│  [screenshot]                      [screenshot]         │
│                                                         │
│  🤖 AI Visual QA Results:                               │
│                                                         │
│  ✅ PASS - Goal accomplished, no defects               │
│                                                         │
│  Reasoning:                                             │
│  Button changed to orange as requested. Text is         │
│  readable and properly centered. No visual defects.     │
│                                                         │
│  Iterations: 2/5                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Analysis

### Per Variation:
- **Input**: 2 screenshots (~1,500 tokens each) + prompt (~500 tokens) = ~3,500 tokens
- **Output**: JSON response (~300 tokens)
- **Total**: ~3,800 tokens per check

### Pricing (GPT-4o):
- Input: 3,500 tokens × $5.00/1M = $0.0175
- Output: 300 tokens × $15.00/1M = $0.0045
- **Total per check: ~$0.022**

### Per Experiment (3 variations, avg 2 iterations each):
- 3 variations × 2 iterations × $0.022 = **~$0.13 per experiment**

### Monthly (assuming 100 experiments):
- 100 experiments × $0.13 = **~$13/month**

**Verdict**: Very affordable for the quality improvement!

---

## 🔧 Implementation Steps

### 1. Add Visual QA Service
Create `/utils/visual-qa-service.js`:
```javascript
class VisualQAService {
  async runQA(params) {
    const { originalRequest, beforeScreenshot, afterScreenshot, iteration } = params;

    // Build prompt
    const prompt = this.buildPrompt(originalRequest, beforeScreenshot, afterScreenshot, iteration);

    // Call GPT-4 Vision
    const response = await this.callGPT4Vision(prompt);

    // Parse and validate response
    const result = this.parseResponse(response);

    return result;
  }
}
```

### 2. Integrate into Auto-Iteration
Modify `sidepanel.js`:
```javascript
async autoIterateVariation(variationNumber) {
  const beforeScreenshot = await this.captureScreenshot();

  for (let iteration = 1; iteration <= 5; iteration++) {
    // Apply variation
    await this.applyVariation(variation);

    // Capture after
    const afterScreenshot = await this.captureScreenshot();

    // Technical validation
    const techResult = await this.checkTechnical();
    if (techResult.errors.length > 0) continue;

    // Visual QA (NEW)
    const visualQA = await this.visualQAService.runQA({
      originalRequest: this.getOriginalRequest(variation),
      beforeScreenshot,
      afterScreenshot,
      iteration
    });

    if (visualQA.status === 'PASS') break; // SUCCESS

    // Generate fix based on visual feedback
    const fixedCode = await this.requestVisualFix(visualQA);
  }
}
```

### 3. Update Feedback Loop
```javascript
async requestVisualFix(originalRequest, visualQAResult) {
  const feedbackPrompt = `
Your previous code had visual quality issues:

ORIGINAL REQUEST:
${originalRequest}

VISUAL QA FINDINGS:
Status: ${visualQAResult.status}

DEFECTS TO FIX:
${visualQAResult.defects.map((d, i) => `
${i + 1}. ${d.description}
   Suggested fix: ${d.suggestedFix}
`).join('\n')}

Generate UPDATED code that fixes ONLY these specific defects while maintaining the original goal.
DO NOT make other changes.
`;

  return await this.callAI(feedbackPrompt);
}
```

---

## 🎯 Success Criteria

The system works when:

1. ✅ **Visual defects are caught**: Text misalignment, bad contrast, broken layouts
2. ✅ **AI receives specific feedback**: Not vague "improve", but exact "use align-items: center"
3. ✅ **Iterations terminate properly**: Stops at PASS, doesn't loop endlessly
4. ✅ **Cost is reasonable**: ~$0.13 per experiment (very affordable)
5. ✅ **Quality improves**: 60% → 85% success rate

## 📝 Next Steps

Ready to implement? I can:
1. Create the Visual QA Service utility
2. Integrate screenshot capture into validation flow
3. Update auto-iteration loop with visual feedback
4. Add UI for displaying visual QA results
5. Implement all termination safeguards

Would you like me to implement this now?
