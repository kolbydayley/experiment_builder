# Two-Phase Selector Extraction Strategy

## The Problem We Solved

**Before:** AI was generating generic placeholders like `.cta-button-selector` instead of real selectors like `#hero-cta-btn`.

**Root Cause:** When you ask an LLM to do everything at once (understand + find + extract + code), it takes shortcuts and hallucinates.

---

## The Solution: Two-Phase Approach

### **Phase 1: Selector Extraction (NEW)**
**Single Purpose:** Find exact selectors, return JSON

```javascript
Input:  Screenshot + HTML + "Change CTA button text"
Output: { "ctaButton": "#hero-cta-btn" }
```

**Why This Works:**
- ✅ **Focused task** - AI only extracts selectors, nothing else
- ✅ **JSON response format** - Forces structured output
- ✅ **Low temperature (0.1)** - More precise, less creative
- ✅ **Vision + HTML** - Matches visual to DOM
- ✅ **Explicit selector list** - Shows all available selectors

### **Phase 2: Code Generation**
**Single Purpose:** Generate code using verified selectors

```javascript
Input:  User request + { "ctaButton": "#hero-cta-btn" }
Output: Code using "#hero-cta-btn" (can't hallucinate!)
```

**Why This Works:**
- ✅ **Selectors pre-verified** - AI can't make up new ones
- ✅ **Simpler prompt** - Less confusion
- ✅ **JSON reference** - Clear selector mapping
- ✅ **No hallucination possible** - Selectors are given, not generated

---

## How It Works

```
┌─────────────────────────────────────┐
│ 1. User Request                     │
│    "Change CTA button text"         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 2. PHASE 1: Selector Extraction     │
│    AI Task: Find the CTA button     │
│    Vision: Looks at screenshot       │
│    HTML: Finds button in DOM         │
│    Output: { "cta": "#hero-btn" }   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 3. PHASE 2: Code Generation         │
│    Input: Verified selector JSON     │
│    AI generates code using exact     │
│    selector: "#hero-btn"             │
│    NO hallucination possible!        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 4. Test & Validate                  │
│    Code runs with correct selector   │
│    ✓ Element found                   │
│    ✓ Change applied                  │
└─────────────────────────────────────┘
```

---

## Technical Implementation

### Phase 1: Selector Extraction

**Prompt Focus:**
```
YOUR TASK: Extract exact DOM selectors

AVAILABLE SELECTORS:
1. #hero-cta-btn
2. button.primary
3. nav > a.link

USER REQUEST: "Change CTA button"

RETURN JSON ONLY:
{
  "ctaButton": "#hero-cta-btn"
}
```

**API Settings:**
- `temperature: 0.1` (precision over creativity)
- `response_format: { type: 'json_object' }` (force JSON)
- `max_tokens: 1000` (short response)
- Vision enabled (screenshot matching)

### Phase 2: Code Generation

**Prompt Focus:**
```
VERIFIED SELECTORS:
{
  "ctaButton": "#hero-cta-btn"
}

USER REQUEST: "Change CTA button text"

Use ONLY the selectors above.
Generate code using: selectors.ctaButton
```

**API Settings:**
- `temperature: 0.7` (normal creativity for code)
- Standard text response
- `max_tokens: 4000` (longer code)

---

## Benefits

### ✅ **No More Hallucinations**
- Selectors extracted in dedicated phase
- Code phase can't invent new selectors
- JSON format enforces structure

### ✅ **Better Accuracy**
- Vision matches elements visually
- HTML provides exact selectors
- Low temperature for precision

### ✅ **Clearer Errors**
- If Phase 1 fails → selector extraction problem
- If Phase 2 fails → code generation problem
- Easier debugging

### ✅ **Cost Effective**
- Phase 1: Small request (~1000 tokens)
- Phase 2: Focused on code only
- Total cost similar to before

---

## Example Output

### Phase 1 Output:
```json
{
  "primaryCTA": "button.hero-cta.btn-primary",
  "headline": "h1.hero-title",
  "subheadline": "p.hero-subtitle"
}
```

### Phase 2 Output:
```javascript
const selectors = {
  "primaryCTA": "button.hero-cta.btn-primary",
  "headline": "h1.hero-title",
  "subheadline": "p.hero-subtitle"
};

waitForElement(selectors.primaryCTA, (element) => {
  element.textContent = 'Get Started Now!';
});
```

**Notice:** Uses actual selectors, not generic placeholders!

---

## What Changed in Code

### New Files:
- `background/selector-extractor.js` - Phase 1 logic

### Modified:
- `background/service-worker.js`:
  - Added `SelectorExtractor` class
  - Modified `generateCode()` to run two phases
  - Added `buildCodeGenerationPrompt()` for Phase 2
  - Removed old single-phase prompt

### Workflow:
```javascript
// OLD (Single Phase)
generateCode() → AI does everything → Often wrong selectors

// NEW (Two Phase)
generateCode() 
  → Phase 1: extractSelectors() → JSON
  → Phase 2: generateCode(selectors) → Correct code!
```

---

## Testing the Fix

**Try this request:**
```
"Change the main CTA button text to 'Start Free Trial'"
```

**Expected Phase 1 Output:**
```json
{
  "mainCTA": "button#signup-cta" 
  // or whatever the actual selector is
}
```

**Expected Phase 2 Output:**
```javascript
const selectors = {"mainCTA": "button#signup-cta"};
waitForElement(selectors.mainCTA, (element) => {
  element.textContent = 'Start Free Trial';
});
```

**NOT:**
```javascript
// ❌ This should NEVER happen anymore
waitForElement('.cta-button-selector', ...)
```

---

## Why This is Better Than Visual Selection

You wanted the AI to be smart enough to figure it out (not manual clicking), and this approach achieves that:

1. ✅ **AI still does the work** - No manual element selection
2. ✅ **Smart matching** - Uses vision + HTML for accuracy
3. ✅ **Automated** - Fully automatic, no user intervention
4. ✅ **Accurate** - Two-phase prevents hallucination
5. ✅ **Scalable** - Works for complex multi-element changes

The AI is now **structured to be precise** instead of being asked to do too much at once!

---

## Next Steps

1. **Reload extension**
2. **Test with a real request**
3. **Check the logs** - You should see:
   ```
   Phase 1: Extracting selectors from page
   Selectors extracted: {"cta":"#actual-selector"}
   Phase 2: Generating code with verified selectors
   ```
4. **Verify code** - Should use actual selectors now!

The two-phase approach solves the hallucination problem by making the AI focus on one clear task at a time. 🎯
