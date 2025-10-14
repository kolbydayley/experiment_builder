# Testing Guide - Hierarchical Context System

## ✅ Implementation Complete!

All code changes have been implemented. Now you need to test the new system.

## 🔄 Step 1: Reload Everything

1. **Reload the extension** at `chrome://extensions/`
   - Find "Convert.com Experiment Builder"
   - Click the reload icon (⟲)

2. **Close and reopen your test page**
   - Content scripts only load on page load
   - Hard refresh won't work - must close the tab and reopen

3. **Open the side panel**
   - Click the extension icon
   - Side panel should open

## 🧪 Step 2: Test Element Selection Mode

1. **Switch to element mode**:
   - Click "🎯 Select Element" button in Step 1

2. **Capture page**:
   - Click "📸 Capture Page"
   - Click any element on the test page

3. **Check the console**:
   - Open DevTools on the test page (F12)
   - Look for these log messages:
   ```
   🔍 Building Element Database...
   📦 Context built: {
     mode: "element-focused",
     primary: 1,
     proximity: 8,
     structure: 12,
     tokens: ~1900
   }
   ```

4. **Check service worker console**:
   - In chrome://extensions, click "Inspect service worker"
   - Look for:
   ```
   🆕 Using hierarchical context system
     📊 Mode: element-focused
     🎯 Primary: 1
     🔗 Proximity: 8
     🏗️ Structure: 12
     💰 Estimated Tokens: ~1900
   ```

5. **Generate code**:
   - Add variation instructions
   - Click "✨ Generate & Test Automatically"
   - Check that the prompt includes:
     - "CONTEXT MODE: ELEMENT-FOCUSED"
     - "SELECTED ELEMENT PATH: body > main > ..."
     - Elements with level: "primary", "proximity", "structure"

## 🧪 Step 3: Test Full Page Mode

1. **Switch to full page mode**:
   - Click "📄 Full Page" button in Step 1

2. **Capture page**:
   - Click "📸 Capture Page"

3. **Check the console**:
   - Look for:
   ```
   📦 Context built: {
     mode: "full-page",
     primary: 15,
     proximity: 0,
     structure: 12,
     tokens: ~2375
   }
   ```

4. **Generate code**:
   - Add variation instructions
   - Generate code
   - Check that prompt includes:
     - "CONTEXT MODE: FULL-PAGE"
     - Elements ranked by importance

## ✅ Expected Results

### Element Selection Mode:
- ✅ Mode: "element-focused"
- ✅ Primary: 1 element (the one you selected)
- ✅ Proximity: ~5-8 elements (parents, siblings, nearby)
- ✅ Structure: ~10-12 elements (header, nav, footer, etc.)
- ✅ Total tokens: ~1,400-2,000 (way under limit)
- ✅ AI prompt mentions "ELEMENT-FOCUSED" and "SELECTED ELEMENT PATH"

### Full Page Mode:
- ✅ Mode: "full-page"
- ✅ Primary: ~15 elements (top interactive elements)
- ✅ Proximity: 0 (not needed in full page)
- ✅ Structure: ~10-12 elements (landmarks)
- ✅ Total tokens: ~2,000-2,800 (way under limit)
- ✅ AI prompt mentions "FULL-PAGE" and "ranked by importance"

### Old System (for comparison):
- ❌ Mode: legacy
- ❌ Elements: 50 elements with full HTML
- ❌ Total tokens: ~25,000+ (exceeded limits)
- ❌ No hierarchical organization

## 🐛 Troubleshooting

### Problem: "ContextBuilder is not defined"
**Solution**: Reload the test page (not just refresh, actually close and reopen the tab)

### Problem: Still seeing old element database format
**Solution**:
1. Check service worker console - should say "🆕 Using hierarchical context system"
2. If it says "🔄 Using legacy element database", the context wasn't captured
3. Try: Reload extension → Close test page → Reopen test page → Capture again

### Problem: CSS still not applying
**Solution**:
1. Check service worker console for timeout errors
2. Verify content script is loaded: Open test page console, type `window.pageCapture`
3. Should return: `PageCapture {isInitialized: true}`

### Problem: Token count still too high
**Solution**:
1. Check what's being logged in the console
2. Elements should have `screenshot: undefined`
3. innerHTML should be limited to 1000 chars
4. If still high, check that hierarchical context is actually being used

## 📊 Validation Checklist

Before considering this done, verify:

- [ ] Element selection captures hierarchical context (primary/proximity/structure)
- [ ] Full page captures top 15 elements only
- [ ] Token counts are under 3,000 for both modes
- [ ] AI prompt includes context mode instructions
- [ ] AI prompt mentions element levels (primary/proximity/structure)
- [ ] Generated code still works (selectors are valid)
- [ ] No console errors
- [ ] CSS application works (the messaging fix)

## 🎉 Success Criteria

You'll know it's working when:

1. **Console shows hierarchical stats**: "mode: element-focused, primary: 1, proximity: 8, structure: 12"
2. **Token counts are low**: ~1,900 for element mode, ~2,375 for full page
3. **AI prompt is context-aware**: Mentions "ELEMENT-FOCUSED" or "FULL-PAGE"
4. **Generated code works**: Selectors match and CSS applies
5. **No errors**: Clean console, no timeout errors

## 📝 What Changed vs Old System

### Old System:
- Sent ALL 50 elements with FULL HTML/CSS
- No hierarchy or organization
- No focus concept
- ~25,000 tokens (often exceeded limits)

### New System:
- Element mode: 1 primary + 8 proximity + 12 structure
- Full page: 15 top elements + 12 structure
- Clear hierarchy (primary → proximity → structure)
- ~1,900-2,900 tokens (75-90% reduction)
- Context-aware prompts for better AI understanding

The new system gives the AI exactly what it needs:
- **Element mode**: Deep detail on the target, enough context to understand layout
- **Full page**: Broad coverage of important elements, ranked by importance

Both stay well within token limits while providing rich context!
