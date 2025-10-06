# 🐛 JavaScript Execution Debugging Guide

## What I Fixed

I've added **3 layers of code fence removal** and **extensive console logging** to help debug why JavaScript isn't executing.

### Fixes Applied:

1. **Parse-time cleaning** - Strips markdown when AI response is first parsed
2. **Pre-execution cleaning** - Removes markdown before sending to page
3. **Runtime cleaning** - Ultra-aggressive cleaning inside the page context

### New Debug Logs:

All logs now use colored output with `[CONVERT-AI]` prefix. You'll see:

- 🔵 **Blue** - Looking for element
- 🟢 **Green** - Success (found, executed)
- 🟠 **Orange** - Waiting for element
- 🔴 **Red** - Errors (invalid selector, timeout, callback failed)
- 🟣 **Purple** - JavaScript code being executed

## How to Debug

### Step 1: Open DevTools Console
**F12** → Console tab

### Step 2: Clear Console and Run Test
1. Reset any previous variations
2. Generate new code
3. Apply the variation
4. Watch the console

### Step 3: Look for These Logs

#### ✅ **GOOD - Working Correctly:**
```
[CONVERT-AI] Executing JavaScript:
waitForElement('button.btn.btn--primary', (element) => {
  element.textContent = 'New Text';
});
[CONVERT-AI] ---
[CONVERT-AI] Looking for: button.btn.btn--primary
[CONVERT-AI] ✓ Found immediately: button.btn.btn--primary
  tagName: "BUTTON"
  text: "Old Text"
  visible: true
[CONVERT-AI] ✓ Callback executed for: button.btn.btn--primary
  textChanged: true
  oldText: "Old Text"
  newText: "New Text"
```

#### ❌ **BAD - Selector Not Found:**
```
[CONVERT-AI] Executing JavaScript:
waitForElement('button.btn.btn--primary', (element) => {
  element.textContent = 'New Text';
});
[CONVERT-AI] ---
[CONVERT-AI] Looking for: button.btn.btn--primary
[CONVERT-AI] Waiting for: button.btn.btn--primary (up to 10000ms)
[CONVERT-AI] ✗ TIMEOUT: button.btn.btn--primary not found after 10000ms
[CONVERT-AI] Available elements on page:
  buttons: 5
  links: 12
  allElements: 342
```

#### ❌ **BAD - Invalid Selector:**
```
[CONVERT-AI] Looking for: button.invalid>>selector
[CONVERT-AI] INVALID SELECTOR: button.invalid>>selector
  DOMException: Failed to execute 'querySelector'
```

#### ❌ **BAD - Empty Code:**
```
[CONVERT-AI] Empty code after cleaning!
```

### Step 4: Test Manually

If logs show the selector wasn't found, test it yourself in console:

```javascript
// Test if selector exists
document.querySelector('button.btn.btn--primary')

// If null, try variations:
document.querySelectorAll('button')              // All buttons
document.querySelectorAll('button.btn')          // Buttons with 'btn' class
document.querySelectorAll('[class*="primary"]')  // Elements with 'primary' in class

// Use the testElementChange helper (now available!)
testElementChange('button.btn', 'TEST TEXT', 'red')
// Should change all matching buttons to red with text "TEST TEXT"
```

## Common Issues & Fixes

### Issue 1: "Selector not found"
**Cause:** Selector doesn't match anything on page

**Debug:**
```javascript
// In console, check what the element database captured:
// (You'll need to look at the generated code to see what selector was used)
document.querySelector('button.btn.btn--primary')  // Replace with actual selector
```

**Fix:** The element database might have captured the wrong selector. Check:
1. Is the button actually on the page?
2. Does it have those exact classes?
3. Try simpler selectors (just `button` instead of `button.btn.btn--primary`)

### Issue 2: "Callback executed but nothing changed"
**Cause:** Changes were made but immediately overwritten, or element is hidden

**Debug:**
```javascript
// Check if element is really visible:
const el = document.querySelector('button.btn.btn--primary');
console.log({
  exists: !!el,
  visible: el?.offsetParent !== null,
  text: el?.textContent,
  styles: window.getComputedStyle(el)
});

// Test if changes stick:
el.textContent = 'TEST';
setTimeout(() => console.log('After 1s:', el.textContent), 1000);
```

**Fix:** 
- Element might be in a React/Vue app that re-renders
- Try using CSS instead of JavaScript for styling
- Use MutationObserver to watch for changes

### Issue 3: "JavaScript says success but logs don't appear"
**Cause:** Code isn't actually executing

**Check:**
1. Look in the extension service worker logs (not the page console!)
2. Make sure you're looking at the page console, not extension console
3. Hard refresh the page (Ctrl+Shift+R)

### Issue 4: "Markdown code fences still in output"
**Should be fixed now!** But if you still see backticks:

```javascript
// Check what the AI actually generated:
// Look at the "Generated Code" view in the extension
// If you see ``` at the start or end, let me know
```

## Quick Test

Run this in console after applying a variation:

```javascript
// This will show you if waitForElement was defined:
console.log('waitForElement available:', typeof window.waitForElement);

// This will show if any [CONVERT-AI] logs happened:
console.log('Check logs above for [CONVERT-AI] messages');

// Manual test:
testElementChange('button', 'MANUAL TEST', 'red');
// All buttons should turn red
```

## What the Logs Mean

| Log Message | Meaning |
|------------|---------|
| `Looking for: X` | Starting to search for selector X |
| `✓ Found immediately` | Element exists on page right now |
| `Waiting for` | Element not found yet, polling every 100ms |
| `✓ Found after waiting` | Element appeared after initial check |
| `✓ Callback executed` | Successfully ran the code on the element |
| `textChanged: true` | Text was actually modified |
| `bgChanged: true` | Background color was modified |
| `✗ TIMEOUT` | Element never appeared (selector doesn't match) |
| `INVALID SELECTOR` | Selector syntax is broken |
| `✗ Callback failed` | Code ran but threw an error |

## Success Indicators

You'll know it's working when you see:
1. ✅ Code appears in purple with `[CONVERT-AI] Executing JavaScript:`
2. ✅ Green `✓ Found immediately` message
3. ✅ Green `✓ Callback executed` with `textChanged: true`
4. ✅ The actual change visible on the page!

## Still Not Working?

If you see all green logs but changes aren't visible:

1. **Check the element itself:**
   ```javascript
   const el = document.querySelector('your-selector');
   console.log(el.textContent);  // Is it actually changed?
   console.log(window.getComputedStyle(el).backgroundColor);  // Is color changed?
   ```

2. **Check if something is overriding:**
   - React/Vue might be re-rendering
   - CSS might have higher specificity
   - Another script might be resetting values

3. **Try the test function:**
   ```javascript
   testElementChange('your-selector', 'TEST', 'red');
   ```
   If this works but generated code doesn't, the issue is in the generated code itself.

---

## Next Steps

After you reload the extension and test:

1. Open DevTools Console
2. Apply a variation
3. **Take a screenshot** of the console output
4. Share it with me so I can see exactly what's happening

The colored logs will make it VERY obvious where the problem is! 🎯
