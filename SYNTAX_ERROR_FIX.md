# JavaScript Syntax Error Fix

## Problem
The extension was getting "Invalid or unexpected token" errors when executing generated JavaScript code. This was caused by overly aggressive comment removal that was breaking JavaScript syntax.

## Root Cause
The regular expression `/\/\/.*$/gm` was removing ALL content after `//` on each line, including:
- URLs with `//` (e.g., `https://example.com`)
- String literals containing `//`
- Regular expressions with `//`
- Other valid JavaScript containing `//`

## Solution
Changed comment removal from:
```javascript
// BAD - removes everything after //
cleanedJS = cleanedJS.replace(/\/\/.*$/gm, '');
```

To:
```javascript
// GOOD - only removes lines that start with //
cleanedJS = cleanedJS.replace(/^\s*\/\/.*$/gm, '');
```

## Files Fixed
1. `background/service-worker.js` (2 locations)
   - CSS cleaning in `applyVariationCode()`
   - JavaScript cleaning in `applyVariationCode()`
   - JavaScript execution function
2. `content-scripts/page-capture.js` (2 locations)
   - CSS cleaning
   - Debug CSS cleaning
3. `utils/code-formatter.js` (1 location)
   - JS minification

## Additional Improvements
- Added syntax error detection before JavaScript execution
- Better error reporting with code snippets for debugging
- Preserved original error messages while adding debugging info

## Testing
To test the fix:
1. Generate code that includes URLs or `//` in strings
2. Verify the JavaScript executes without "Invalid or unexpected token" errors
3. Check that legitimate comments are still removed
4. Ensure CSS processing also works correctly

## Example Problematic Code (Now Fixed)
```javascript
// This would have been broken before:
waitForElement('button', (el) => {
  el.onclick = () => {
    window.location = 'https://example.com/path'; // This // would break
  };
});
```