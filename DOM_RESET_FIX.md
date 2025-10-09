# DOM Reset & Code Reapplication Fix

## Root Cause Analysis

The Visual QA system was getting stuck because:

1. **DOM Modifications Persisting**: JavaScript variations were making DOM changes (adding classes, creating elements, modifying innerHTML) that weren't being properly reset between iterations.

2. **Screenshots of Modified State**: Visual QA was comparing screenshots of a page that still had previous iteration's DOM modifications, causing it to see the same issues repeatedly.

3. **Inadequate Reset**: The existing `clearInjectedAssets()` only removed `<style>` and `<script>` tags but didn't undo DOM structural changes made by JavaScript execution.

## Solution Implementation

### 1. Enhanced DOM Tracking System ✅

**File**: `background/service-worker.js`
- **Added**: DOM tracking utilities that store original element state before modifications
- **Enhancement**: `createElement` override to automatically mark created elements
- **Purpose**: Track all DOM changes so they can be properly reversed

### 2. Improved DOM Reset Functionality ✅

**File**: `content-scripts/page-capture.js`
- **Enhanced**: `clearInjectedAssets()` to restore original element states and remove created elements
- **Added**: Specific cleanup for variation classes like `.split-screen-hero`
- **Added**: DOM modification detection to determine if reset was successful

### 3. Intelligent Page Refresh System ✅

**File**: `sidepanel/sidepanel.js`
- **Added**: DOM modification check before each iteration
- **Implementation**: Only refresh page if DOM modifications are detected that can't be reset
- **Purpose**: Ensure clean base state for each iteration while minimizing disruption

### 4. Visual QA Feedback Enhancement ✅

**Previously Fixed**: Visual QA feedback is now treated as mandatory requirements rather than optional suggestions

## Technical Details

### DOM Tracking Process:
1. Before JavaScript execution, inject tracking utilities
2. Override `document.createElement` to mark all new elements
3. Store original `className` and `innerHTML` before modifications
4. Mark modified elements with `data-var-applied`

### Reset Process:
1. Remove injected CSS/JS tags
2. Restore original classes and innerHTML from stored data
3. Remove elements marked as `data-convert-created`
4. Clean up specific variation classes
5. Check if any modifications remain

### Iteration Flow:
1. Check if DOM modifications exist from previous iteration
2. If modifications detected, refresh page to get clean base state
3. Restore base page data after refresh
4. Re-inject content scripts
5. Apply new variation to clean page state
6. Run Visual QA on proper before/after comparison

## Expected Results

### Before Fix:
- ❌ DOM changes accumulated across iterations
- ❌ Visual QA saw modified page as "before" state
- ❌ Same defects detected repeatedly
- ❌ Infinite loops with no convergence

### After Fix:
- ✅ Each iteration starts with clean DOM state
- ✅ Visual QA compares true before/after states
- ✅ Proper defect resolution and convergence
- ✅ No more false positive defect detection
- ✅ Iterations actually improve visual quality

## Testing Notes

The fix addresses the specific issue where:
1. Initial variation creates split-screen layout
2. Visual QA detects missing buttons
3. Iteration 2 should add buttons to clean base page
4. Instead of seeing buttons in clean layout, Visual QA was seeing buttons on already-modified layout
5. This caused confusion and repeated "missing buttons" detection

Now each iteration properly resets to base state before applying changes.