# Simplified DOM Reset Solution

## Problem
The Visual QA system was getting stuck because JavaScript variations made complex DOM modifications that persisted between iterations, causing Visual QA to compare against already-modified pages instead of clean base states.

## Root Cause  
JavaScript variations like the split-screen layout completely restructure the DOM:
- Move all existing content with `while(el.firstChild) { rightSide.appendChild(el.firstChild); }`
- Add new container elements with complex nested structure
- Apply inline styles and class modifications
- These changes are nearly impossible to track and undo reliably

## Solution: Simple Page Refresh
Instead of trying to track and undo complex DOM changes, **always refresh the page before each iteration** to guarantee a clean state.

### Implementation:
1. **Detect iterations**: Check if `this.autoIteration.iterations > 0`
2. **Refresh page**: Use `chrome.tabs.reload(tab.id)` 
3. **Wait for reload**: Allow 3 seconds for page to fully reload
4. **Restore data**: Preserve `basePageData` across refresh
5. **Re-inject scripts**: Ensure content scripts are available after reload

### Benefits:
- ✅ **Guaranteed clean DOM state** for each iteration
- ✅ **Accurate Visual QA comparisons** (true before/after)
- ✅ **Simple and reliable** - no complex tracking needed
- ✅ **Proper feedback loop completion**
- ✅ **No false positive defect detection**

### Trade-offs:
- ⚠️ **Slight delay** from page refresh (3 seconds)
- ⚠️ **Page flash** during reload (minor UX impact)

## Files Modified:

### sidepanel/sidepanel.js
- **Added**: Always refresh page for iterations > 0
- **Enhanced**: Better error handling and logging for adjustCode
- **Added**: Status log messages for refresh process

### background/service-worker.js  
- **Removed**: Complex DOM tracking utilities (no longer needed)
- **Simplified**: JavaScript execution without tracking overhead

### content-scripts/page-capture.js
- **Simplified**: clearInjectedAssets to only handle CSS/JS removal
- **Removed**: DOM modification detection (no longer needed)

## Expected Results:

### Before Fix:
- ❌ Iteration 1: Creates split-screen → Visual QA detects missing buttons
- ❌ Iteration 2: Adds buttons to already-split page → Visual QA still sees missing buttons
- ❌ Infinite loop: Same defects detected repeatedly

### After Fix:
- ✅ Iteration 1: Creates split-screen → Visual QA detects missing buttons  
- ✅ Page refresh: Back to clean base state
- ✅ Iteration 2: Adds buttons to clean page → Visual QA sees buttons correctly
- ✅ Convergence: Visual defects properly resolved

The solution prioritizes **reliability over performance**, ensuring the feedback loop works correctly even if it takes a bit longer.