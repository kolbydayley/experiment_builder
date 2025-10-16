# Refinement System Testing Guide

## Overview
This guide provides step-by-step instructions for testing the new refinement system (Phase 1 & 2) that prevents code degeneration during chat iterations.

---

## Prerequisites

1. **Extension loaded**: Load the extension in Chrome from `chrome://extensions/`
2. **API key configured**: Ensure Anthropic API key is set in extension settings
3. **Test page ready**: Have a simple test website open (e.g., a landing page with buttons, text, images)

---

## Test Suite

### Test 1: Simple Refinement (Happy Path)

**Objective**: Verify basic refinement flow works without errors

**Steps**:
1. Open extension side panel on test page
2. Click "Capture Page" to build element database
3. Send initial request: `"Make the main CTA button green"`
4. Wait for code generation
5. Verify: Code applies successfully, button turns green
6. Send refinement: `"Make it darker green"`
7. Wait for refinement to complete

**Expected Results**:
- ✅ Refinement completes successfully
- ✅ Same CSS selector used (no selector drift)
- ✅ Button color updated to darker green
- ✅ Confidence score displayed (e.g., "Confidence: 95%")
- ✅ No errors in browser console

**Pass Criteria**: Code updates without errors, selector preserved, color darker

---

### Test 2: Validation Auto-Correction

**Objective**: Verify the 3-attempt validation loop catches and fixes errors

**Setup**: This is harder to test artificially. Monitor browser console during refinements.

**Steps**:
1. Continue from Test 1 (button is now dark green)
2. Send complex refinement: `"Add a subtle shadow and make the text bold"`
3. Watch console logs for validation attempts

**Expected Results**:
- ✅ Code validates (may take 1-3 attempts)
- ✅ Console shows: `"[RefinementContext] Validation attempt 1"`
- ✅ If validation fails on attempt 1, should see attempt 2 or 3
- ✅ Final code passes all validation checks
- ✅ Changes applied successfully

**Pass Criteria**: Validation loop completes, changes applied

---

### Test 3: Automatic Rollback on Failure

**Objective**: Verify rollback protects user from broken code

**Note**: This test requires artificially creating a failure scenario. Skip if not applicable.

**Manual Simulation**:
1. In service-worker.js, temporarily modify validation to always fail
2. Send refinement request
3. Observe rollback behavior
4. Revert service-worker.js changes

**Expected Results**:
- ✅ User sees error message: `"⚠️ Unable to apply your changes safely"`
- ✅ Message includes: `"Your code has been reverted to the last working version"`
- ✅ Original working code still active (button still dark green from Test 1)
- ✅ Page not broken
- ✅ User can continue making requests

**Pass Criteria**: Rollback message shown, page still works, no broken state

---

### Test 4: Clarification UI for Ambiguous Requests

**Objective**: Verify clarification UI appears for ambiguous requests

**Steps**:
1. Continue from Test 1 (button is dark green)
2. Send intentionally vague request: `"Change it"`
3. Wait for response

**Expected Results**:
- ✅ Clarification UI appears with message: `"I want to make sure I understand correctly:"`
- ✅ Two or more clickable options displayed (e.g., "Modify existing button" vs "Work with different element")
- ✅ Options have clear, user-friendly text
- ✅ Clicking an option sends selection back to AI
- ✅ Refinement proceeds with correct strategy

**Alternative Test** (if clarification doesn't trigger):
Send: `"Change the button"` or `"Update the style"` (these are ambiguous)

**Pass Criteria**: Clarification UI appears, user can select option, refinement continues

---

### Test 5: New Feature vs Refinement Detection

**Objective**: Verify AI distinguishes between modifying existing code vs adding new features

**Steps**:
1. Continue from Test 1 (button is dark green)
2. Send new feature request: `"Add a countdown timer above the button showing 24 hours"`
3. Wait for code generation

**Expected Results**:
- ✅ New code generated for countdown timer
- ✅ Existing button code PRESERVED (still dark green)
- ✅ No selector conflicts
- ✅ Both elements work correctly

**Verification**:
- Check generated code includes BOTH button styling AND countdown timer logic
- Verify button selector unchanged from Test 1

**Pass Criteria**: New feature added without breaking existing code

---

### Test 6: Selector Preservation During Refinement

**Objective**: Verify selectors don't drift during multiple refinements

**Steps**:
1. Continue from Test 1 (button is dark green)
2. Extract the CSS selector used (e.g., `#hero-cta` or `.cta-button`)
3. Send refinement 1: `"Make the text uppercase"`
4. Check selector in code
5. Send refinement 2: `"Add padding"`
6. Check selector in code
7. Send refinement 3: `"Change border radius"`
8. Check selector in code

**Expected Results**:
- ✅ All three refinements use THE SAME selector
- ✅ No selector drift (AI doesn't change to `.btn-primary`, `button.cta`, etc.)
- ✅ All changes cumulative (uppercase + padding + border radius)

**Pass Criteria**: Selector unchanged across multiple refinements

---

### Test 7: Full Page Rewrite Detection

**Objective**: Verify system allows course reversals when user explicitly requests

**Steps**:
1. Continue from Test 1 (button is dark green with multiple refinements)
2. Send explicit rewrite request: `"Actually, forget all that. Start over and make the button red with white text and a drop shadow"`
3. Wait for generation

**Expected Results**:
- ✅ Intent classified as FULL_REWRITE or NEW_FEATURE
- ✅ Previous styling discarded
- ✅ New code generated with red button, white text, shadow
- ✅ No clarification UI (intent is clear)

**Pass Criteria**: System allows full rewrite when explicitly requested

---

### Test 8: Multi-Element Refinement

**Objective**: Verify refinements can modify multiple elements simultaneously

**Steps**:
1. Generate initial code: `"Make all navigation links blue and bold"`
2. Wait for generation
3. Send refinement: `"Also add underline on hover"`
4. Wait for refinement

**Expected Results**:
- ✅ Refinement applies to ALL navigation links (not just one)
- ✅ Hover effect works correctly
- ✅ Original blue + bold styling preserved

**Pass Criteria**: Multi-element selector preserved, hover effect added

---

### Test 9: Error Messaging Quality

**Objective**: Verify error messages are user-friendly for non-technical users

**Steps**:
1. Trigger a validation failure (if possible)
2. Read error message shown to user

**Expected Results**:
- ✅ Error message avoids technical jargon
- ✅ Explains WHAT happened (not low-level details)
- ✅ Provides actionable suggestions
- ✅ Reassures user that page is safe
- ✅ No scary stack traces visible to user

**Example Good Message**:
```
⚠️ Unable to apply your changes safely.

What happened: The element you're trying to modify no longer exists on the page.

Your code has been reverted to the last working version to prevent breaking the page.

Suggestions:
- Try selecting the element again using the 🎯 tool
- Check if the page content has changed
```

**Pass Criteria**: Error messages are clear, helpful, non-technical

---

### Test 10: Performance Check

**Objective**: Verify refinement doesn't introduce excessive latency

**Steps**:
1. Send refinement request
2. Measure time from send to response

**Expected Results**:
- ✅ Simple refinements: <5 seconds
- ✅ Complex refinements with validation retries: <15 seconds
- ✅ Clarification UI: <3 seconds (fast model)
- ✅ No timeouts or hanging requests

**Pass Criteria**: Response times acceptable for user experience

---

## Regression Tests

### Regression 1: Initial Code Generation Still Works

**Objective**: Ensure new system doesn't break initial generation

**Steps**:
1. Fresh page capture
2. Generate initial code without any refinements
3. Verify code quality

**Expected Results**:
- ✅ Initial generation works as before
- ✅ Code quality unchanged
- ✅ Element database used correctly

---

### Regression 2: Visual QA Still Functions

**Objective**: Ensure Visual QA integration still works

**Steps**:
1. Enable Visual QA (if applicable)
2. Generate code with Visual QA
3. Make refinement
4. Verify Visual QA triggered appropriately

**Expected Results**:
- ✅ Visual QA works for initial generation
- ✅ Visual QA skipped for simple refinements (by design)
- ✅ Visual QA triggered for new features

---

## Console Monitoring

Throughout all tests, monitor browser console for:

### Service Worker Console
Right-click extension icon → "Inspect service worker"

**Expected Logs**:
- `[RefinementContext] Refining code...`
- `[RefinementContext] Intent analysis: REFINEMENT`
- `[RefinementContext] Validation attempt 1...`
- `[RefinementContext] Validation passed!`

**No Error Logs** (these indicate problems):
- `❌ [RefinementContext] Validation failed`
- `❌ [RefinementContext] Rollback triggered`
- Uncaught exceptions
- Promise rejections

### Page Console
F12 Developer Tools on target page

**Expected Logs**:
- `[Page Capture] Received VERIFY_SELECTORS`
- `[Page Capture] Received TEST_CODE_VALIDATION`

**No Error Logs**:
- CSS/JS syntax errors
- Uncaught exceptions from injected code

---

## Pass/Fail Criteria

### Overall System Health

**PASS if**:
- ✅ 8/10 tests pass
- ✅ No critical errors in console
- ✅ Rollback works correctly
- ✅ Selectors preserved during refinement
- ✅ User never sees broken page

**FAIL if**:
- ❌ Refinements break page
- ❌ Selector drift occurs
- ❌ Rollback doesn't work
- ❌ Errors exposed to user
- ❌ System hangs or times out

---

## Known Issues & Workarounds

1. **Clarification UI sometimes doesn't appear**: AI may have high confidence even for ambiguous requests. Try more vague requests like "change it" or "update the thing"

2. **Validation auto-correction hard to observe**: Most refinements pass on first attempt. This is actually good! Check console for validation attempt counts.

3. **Rollback hard to test**: Automatic rollback is a safety net. Hard to trigger naturally. Consider this a good sign if you can't trigger it during testing.

---

## Debugging Tips

### If refinement fails unexpectedly:

1. **Check API key**: Ensure Anthropic API key is valid
2. **Check element database**: Verify page capture completed successfully
3. **Check console errors**: Look for validation failure messages
4. **Check selector existence**: Use DevTools to verify selectors exist on page
5. **Check conversation history**: Ensure chat history is being passed correctly

### If clarification UI doesn't work:

1. **Verify sidepanel.js changes**: Check lines 2623-2764 for clarification methods
2. **Verify CSS loaded**: Check workspace-v2.css lines 1183-1232
3. **Check console**: Look for `needsClarification: true` in response

### If validation always fails:

1. **Check content script**: Verify VERIFY_SELECTORS handler added to page-capture.js
2. **Check permissions**: Ensure extension has access to tab
3. **Check tabId**: Verify tabId being passed correctly to RefinementContext

---

## Next Steps After Testing

1. **Document any failures**: Create GitHub issues for bugs found
2. **Tune validation thresholds**: If too many false positives, adjust confidence thresholds
3. **Proceed to Phase 3**: Enhanced system prompts (if all tests pass)
4. **Real-world testing**: Test with actual user scenarios and complex pages

---

## Success Metrics Targets

Based on implementation goals:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Refinement success rate | >95% | Tests 1-8 pass rate |
| Rollback effectiveness | 100% | Test 3 passes |
| Selector preservation | 100% | Test 6 passes |
| User-facing errors | <5% | Tests complete without user seeing errors |
| Clarification accuracy | >80% | Test 4 triggers for ambiguous requests |
| Performance | <10s avg | Test 10 measures latency |

---

**Testing Date**: _____________
**Tester**: _____________
**Results**: _____________

---

**Phase 1 & 2 Status**: ✅ Implementation Complete, Testing Pending
**Phase 3 Status**: ⏳ Pending (Enhanced System Prompts)
