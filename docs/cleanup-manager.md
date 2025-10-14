# Cleanup Manager Implementation Summary

## Problem Statement

The extension had a critical issue where code wouldn't reapply after the first preview. This was caused by:

1. **Context Boundary Issue**: Intervals created in MAIN world (page context) couldn't be accessed from content script context
2. **Fragmented Cleanup**: Cleanup code scattered across multiple locations with no central coordination
3. **Race Conditions**: Old intervals kept running while new ones started, causing "already applied" issues
4. **Nuclear Cleanup**: Attempted to clear intervals 1-1000 blindly, which was unreliable

## Solution: Cleanup Manager Singleton

A centralized singleton running in MAIN world that tracks ALL resources and provides atomic reset operations.

## Implementation Details

### 1. Core Singleton ([utils/cleanup-manager.js](utils/cleanup-manager.js))

**Location**: Runs in MAIN world (page context)

**Key Methods**:
- `registerInterval(intervalId, description)` - Track intervals for cleanup
- `registerTimeout(timeoutId, description)` - Track timeouts for cleanup
- `registerElement(element, description)` - Track dynamically created elements
- `registerStyleSheet(styleElement, description)` - Track injected styles
- `trackModification(element, property, originalValue)` - Track DOM modifications for restoration
- `resetAll()` - Atomic cleanup of all tracked resources
- `getState()` - Inspect current tracked resources (for debugging)

**Auto-Initialization**: Self-executing IIFE that creates `window.ConvertCleanupManager` if not already initialized.

### 2. Service Worker Integration ([background/service-worker.js](background/service-worker.js))

**New Message Handlers**:

#### `ENSURE_CLEANUP_MANAGER` (Lines 638-668)
```javascript
// Loads cleanup-manager.js and executes in MAIN world
const cleanupManagerCode = await fetch(chrome.runtime.getURL('utils/cleanup-manager.js')).then(r => r.text());
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: (code) => { eval(code); },
  args: [cleanupManagerCode]
});
```

#### `RESET_VIA_CLEANUP_MANAGER` (Lines 670-701)
```javascript
// Calls resetAll() in MAIN world, returns summary
const result = await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: () => window.ConvertCleanupManager.resetAll()
});
```

#### `EXECUTE_PREVIEW_JS` (Lines 494-566)
- Updated `waitForElement` utility to auto-register with Cleanup Manager
- Removed legacy `convertAiIntervals` array tracking

**Lines 528-533** - Auto-registration in waitForElement:
```javascript
// AUTO-TRACK: Register interval with Cleanup Manager
if (window.ConvertCleanupManager) {
  window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
} else {
  console.warn('[Convert AI] Cleanup Manager not available, interval not tracked');
}
```

### 3. Preview Flow Update ([content-scripts/page-capture.js](content-scripts/page-capture.js))

**Lines 979-1032** - New 4-step preview flow:

```javascript
async previewCode(css, js, variationNumber) {
  // STEP 1: Ensure Cleanup Manager is initialized
  await chrome.runtime.sendMessage({ type: 'ENSURE_CLEANUP_MANAGER' });

  // STEP 2: Atomic reset via Cleanup Manager
  const resetResponse = await chrome.runtime.sendMessage({
    type: 'RESET_VIA_CLEANUP_MANAGER'
  });

  if (!resetResponse?.success) {
    // Fallback to legacy cleanup if Cleanup Manager fails
    this.clearPreviewElements();
    this.clearInjectedAssets('');
  }

  // Wait 100ms for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // STEP 3: Inject CSS
  if (css && css.trim()) {
    const styleEl = document.createElement('style');
    styleEl.id = `convert-preview-css-${variationNumber}`;
    styleEl.setAttribute('data-convert-preview', 'true');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // STEP 4: Execute JavaScript via service worker (CSP-safe)
  if (js && js.trim()) {
    await chrome.runtime.sendMessage({
      type: 'EXECUTE_PREVIEW_JS',
      js: js,
      variationNumber: variationNumber
    });
  }
}
```

### 4. Export Updates ([sidepanel/sidepanel.js](sidepanel/sidepanel.js))

Updated `waitForElement` utility in both export methods:

**Lines 2560-2563** - Copy All Code:
```javascript
// AUTO-TRACK: Register interval with Cleanup Manager
if (window.ConvertCleanupManager) {
  window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
}
```

**Lines 3466-3469** - Export Code:
```javascript
// AUTO-TRACK: Register interval with Cleanup Manager
if (window.ConvertCleanupManager) {
  window.ConvertCleanupManager.registerInterval(interval, 'waitForElement: ' + selector);
}
```

### 5. AI Prompt Standardization ([background/service-worker.js](background/service-worker.js))

**Lines 1532-1535** - Updated core rules:
```javascript
11. **NOTE: waitForElement automatically registers intervals with Cleanup Manager**
    - All intervals are auto-tracked for cleanup between previews
    - You do NOT need to manually register intervals
    - Simply use waitForElement() and cleanup happens automatically
```

### 6. Legacy Cleanup Simplification

#### clearPreviewElements() - Lines 1062-1080
- Removed nuclear cleanup (clearing intervals 1-1000)
- Removed convertAiIntervals array tracking
- Kept minimal fallback: remove [data-convert-preview] elements and reset flags
- Added warnings that this is legacy fallback code

#### clearInjectedAssets() - Lines 139-157
- Removed all interval tracking logic
- Removed DOM modification logic
- Kept only CSS/JS tag removal for old applyVariation method
- Added warnings that Cleanup Manager handles most cleanup

### 7. JSON Parsing Fixes ([background/service-worker.js](background/service-worker.js))

**Lines 2189-2197** - Handle AI responses with explanatory text before JSON:
```javascript
// CRITICAL: Handle case where AI adds text BEFORE raw JSON (no code blocks)
// Example: "I'll update the code...\n\n{\"variations\": [...]}"
if (!foundValidJSON && !cleanedResponse.startsWith('{')) {
  const firstBraceIndex = cleanedResponse.indexOf('{');
  if (firstBraceIndex > 0) {
    console.log('⚠️ Detected explanatory text before JSON, extracting JSON portion...');
    cleanedResponse = cleanedResponse.substring(firstBraceIndex);
  }
}
```

## Benefits

### Before
- ❌ Intervals orphaned after first preview
- ❌ "Already applied" errors on second click
- ❌ Cleanup scattered across 3+ locations
- ❌ Content script couldn't access MAIN world intervals
- ❌ Nuclear cleanup (1-1000) unreliable
- ❌ No visibility into what's tracked

### After
- ✅ All intervals tracked and cleared atomically
- ✅ Code reapplies cleanly every time
- ✅ Single source of truth for cleanup
- ✅ Cleanup Manager lives in MAIN world (same as intervals)
- ✅ Targeted cleanup of only tracked resources
- ✅ `getState()` method for debugging

## Testing

Use the comprehensive test plan: [CLEANUP_MANAGER_TEST_PLAN.md](CLEANUP_MANAGER_TEST_PLAN.md)

Quick test:
1. Open [test-cleanup.html](test-cleanup.html)
2. Capture page and generate variation
3. Click "Preview Test" 5 times in a row
4. Check console - should see atomic reset cycle each time
5. No orphaned intervals, no "already applied" warnings

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN WORLD (Page Context)              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      window.ConvertCleanupManager (Singleton)        │  │
│  │                                                      │  │
│  │  - intervals: []       ← Auto-registered            │  │
│  │  - timeouts: []          by waitForElement()        │  │
│  │  - elements: []                                     │  │
│  │  - styleSheets: []                                  │  │
│  │  - modifiedElements: Map                           │  │
│  │                                                      │  │
│  │  resetAll() → Atomic cleanup of ALL resources      │  │
│  └──────────────────────────────────────────────────────┘  │
│         ↑                                                   │
│         │ chrome.scripting.executeScript({world: 'MAIN'})  │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────┐
│         │            Service Worker                         │
│         │                                                   │
│  ENSURE_CLEANUP_MANAGER    ← Load & execute singleton      │
│  RESET_VIA_CLEANUP_MANAGER ← Call resetAll() in MAIN       │
│  EXECUTE_PREVIEW_JS        ← Run code with auto-tracking   │
└─────────┬───────────────────────────────────────────────────┘
          │
┌─────────┴───────────────────────────────────────────────────┐
│              Content Script                                 │
│                                                             │
│  previewCode():                                            │
│    1. Ensure Cleanup Manager initialized                   │
│    2. Atomic reset via Cleanup Manager                     │
│    3. Inject CSS                                           │
│    4. Execute JS (with auto-registration)                  │
└─────────────────────────────────────────────────────────────┘
```

## Files Changed

1. **Created**: [utils/cleanup-manager.js](utils/cleanup-manager.js) - Core singleton (269 lines)
2. **Modified**: [background/service-worker.js](background/service-worker.js)
   - Added ENSURE_CLEANUP_MANAGER handler (Lines 638-668)
   - Added RESET_VIA_CLEANUP_MANAGER handler (Lines 670-701)
   - Updated EXECUTE_PREVIEW_JS with auto-registration (Lines 528-533)
   - Standardized AI prompts (Lines 1532-1535)
   - Fixed JSON parsing (Lines 2189-2197)
3. **Modified**: [content-scripts/page-capture.js](content-scripts/page-capture.js)
   - Updated previewCode() with 4-step flow (Lines 979-1032)
   - Simplified clearPreviewElements() (Lines 1062-1080)
   - Simplified clearInjectedAssets() (Lines 139-157)
4. **Modified**: [sidepanel/sidepanel.js](sidepanel/sidepanel.js)
   - Updated waitForElement in copyAllCode() (Lines 2560-2563)
   - Updated waitForElement in exportCode() (Lines 3466-3469)
5. **Created**: [test-cleanup.html](test-cleanup.html) - Interactive test page
6. **Created**: [CLEANUP_MANAGER_TEST_PLAN.md](CLEANUP_MANAGER_TEST_PLAN.md) - Test scenarios

## Rollback Plan

If issues occur, revert these files:
1. Remove `utils/cleanup-manager.js`
2. Restore `background/service-worker.js` (remove new handlers, restore old waitForElement)
3. Restore `content-scripts/page-capture.js` (restore old previewCode and cleanup methods)
4. Restore `sidepanel/sidepanel.js` (restore old waitForElement utility)

Legacy fallback code is still present, so partial rollback is possible.

## Future Enhancements

1. **Auto-register element modifications**: Track when generated code modifies element styles/text
2. **Persistent state**: Save cleanup state to chrome.storage for recovery after crashes
3. **Performance monitoring**: Track cleanup duration and warn if > 500ms
4. **Cleanup history**: Log last N resets for debugging
5. **Smart cleanup**: Only clean resources that match current variation

## Notes

- Cleanup Manager is self-contained and doesn't depend on other extension code
- Works across page refreshes (re-initializes automatically)
- Gracefully handles missing Cleanup Manager (falls back to legacy code)
- All intervals created by `waitForElement` are automatically tracked
- Console logs prefixed with `[Cleanup Manager]` for easy debugging
