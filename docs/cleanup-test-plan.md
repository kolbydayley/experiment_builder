# Cleanup Manager Test Plan

## Overview
This document outlines the testing plan for the new Cleanup Manager system that solves the "code not reapplying" issue by providing atomic reset operations in the MAIN world context.

## What Changed

### Architecture Shift
- **Before**: Fragmented cleanup across content script and MAIN world, with no visibility between contexts
- **After**: Single Cleanup Manager singleton running in MAIN world, tracking all resources centrally

### Key Components
1. **`utils/cleanup-manager.js`**: Core singleton (runs in MAIN world)
2. **Updated `waitForElement`**: Auto-registers intervals with Cleanup Manager
3. **Updated preview flow**: Ensures Cleanup Manager initialized, then atomic reset before each preview
4. **Service worker handlers**: `ENSURE_CLEANUP_MANAGER` and `RESET_VIA_CLEANUP_MANAGER`

## Test Scenarios

### Scenario 1: Initial Preview
**Goal**: Verify first preview applies code correctly

**Steps**:
1. Open test-cleanup.html in browser
2. Open extension side panel
3. Click "Capture Page"
4. Generate code that modifies the #cta-button (color, text, etc.)
5. Click "Preview Test"

**Expected**:
- Console shows: "🔧 Ensuring Cleanup Manager is initialized..."
- Console shows: "🧹 Performing atomic reset via Cleanup Manager..."
- Console shows: "✅ Cleanup Manager reset complete: {intervals: 0, timeouts: 0, ...}"
- Button changes appear immediately
- No errors in console

### Scenario 2: Multiple Previews (Critical Test)
**Goal**: Verify code reapplies without "already applied" issues

**Steps**:
1. After Scenario 1, click "Preview Test" again
2. Click 5 more times
3. Check console for duplicate intervals

**Expected**:
- Each click shows full cleanup → reapply cycle
- No "already applied" warnings
- Interval count resets to 0, then increases by 1 per waitForElement call
- No duplicate intervals running
- Button changes consistently

### Scenario 3: Chat Refinement
**Goal**: Verify cleanup works during chat-based code modifications

**Steps**:
1. After generating initial code, open chat
2. Type: "Change button color to red"
3. Wait for code generation
4. Check that preview auto-applies
5. Type: "Make it green instead"
6. Check preview again

**Expected**:
- After each refinement, full cleanup occurs
- Previous color is removed before new one applies
- No duplicate styles stacking
- Console shows reset summary before each new variation

### Scenario 4: Multiple waitForElement Calls
**Goal**: Verify multiple intervals are tracked and cleaned

**Steps**:
1. Generate code with multiple element modifications:
   - Modify button color
   - Modify h2 text
   - Add a banner
2. Click "Preview Test"
3. Check Cleanup Manager state (use test page's "Check State" button)

**Expected**:
- Console shows 3+ intervals registered
- All intervals appear in Cleanup Manager state
- On reset, all 3+ intervals are cleared
- No orphaned intervals remain

### Scenario 5: Page Refresh Recovery
**Goal**: Verify Cleanup Manager re-initializes after page refresh

**Steps**:
1. After running a preview, refresh the page
2. Click "Preview Test" again

**Expected**:
- Extension re-initializes Cleanup Manager
- No errors about "Cleanup Manager not initialized"
- Preview applies cleanly as if first run

### Scenario 6: Error Handling
**Goal**: Verify fallback when Cleanup Manager fails

**Steps**:
1. Manually delete `window.ConvertCleanupManager` via browser console
2. Click "Preview Test"

**Expected**:
- Console shows: "⚠️ Cleanup Manager reset failed, falling back to legacy cleanup"
- Code still attempts to apply (degraded mode)
- No extension crash

### Scenario 7: Export Verification
**Goal**: Verify exported code includes Cleanup Manager registration

**Steps**:
1. Generate variation with button modification
2. Click "Copy All Code"
3. Paste into text editor
4. Search for "ConvertCleanupManager"

**Expected**:
- waitForElement function includes:
  ```javascript
  if (window.ConvertCleanupManager) {
    window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
  }
  ```
- Comment explains auto-tracking

## Manual Verification Checklist

Use the test page's built-in tools:

- [ ] **Run Test Variation**: Applies code using waitForElement
- [ ] **Check Cleanup Manager State**: Shows tracked resources
- [ ] **Manual Reset**: Triggers cleanup manually
- [ ] **Console Log**: Real-time logging of all operations

## Console Output to Look For

### Successful Initialization
```
🔧 Ensuring Cleanup Manager is initialized on tab X
[Cleanup Manager] ✅ Initialized successfully
✅ Cleanup Manager initialized
```

### Successful Reset
```
🧹 Resetting via Cleanup Manager on tab X
[Cleanup Manager] 🧹 Starting atomic reset...
[Cleanup Manager]   ✓ Cleared interval X: waitForElement: #cta-button
[Cleanup Manager]   ✓ Reset N data-var-applied flags
[Cleanup Manager] ✅ Reset complete in Xms: {intervals: 1, timeouts: 0, ...}
```

### Auto-Registration
```
[Cleanup Manager] Registered interval X: waitForElement: #cta-button (total: 1)
```

## Known Issues to Watch For

1. **CSP Errors**: If you see "Refused to execute inline script", the executeScript with world: 'MAIN' isn't working
2. **Orphaned Intervals**: Check with Cleanup Manager state - should reset to 0 after each preview
3. **Race Conditions**: If button doesn't change, check if waitForElement timeout is too short
4. **Context Mismatch**: If Cleanup Manager shows 0 intervals but code is running, registration isn't working

## Success Criteria

✅ All test scenarios pass without errors
✅ No duplicate intervals after multiple previews
✅ Console logs show atomic reset cycle
✅ Button changes apply/reapply consistently
✅ Exported code includes Cleanup Manager registration
✅ No "already applied" warnings

## Next Steps After Testing

If tests pass:
1. Standardize AI prompts to ensure consistent code generation
2. Remove legacy cleanup code (convertAiIntervals array, etc.)
3. Update documentation with Cleanup Manager usage

If tests fail:
1. Check service worker console for errors
2. Verify utils/cleanup-manager.js is web accessible
3. Ensure MAIN world execution is working
4. Review context boundary issues
