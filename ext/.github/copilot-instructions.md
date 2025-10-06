🚀 Service Worker Loading - Convert.com Experiment Builder
service-worker.js:476 🚀 Initializing ServiceWorker...
service-worker.js:6 🔧 ServiceWorker constructor called
service-worker.js:11 🔄 Initializing extension...
service-worker.js:26 🔧 Setting up side panel behavior...
service-worker.js:479 ✅ ServiceWorker initialized successfully
service-worker.js:15 ✅ Convert.com Experiment Builder installed: {previousVersion: '1.0.0', reason: 'update'}
service-worker.js:88 🔧 Configuring side panel behavior...
service-worker.js:94 ✅ Side panel configured to open on action click
service-worker.js:101 ✅ Side panel options registered globally
service-worker.js:165 Screenshot capture skipped: Either the '<all_urls>' or 'activeTab' permission is required.# Convert.com Experiment Builder - AI Coding Guide

This Chrome extension generates Convert.com A/B test code using AI-powered page analysis. Focus on the Element Database architecture and Convert.com-specific patterns.

## 🏗️ Core Architecture

### Three-Component System
1. **Background Service Worker** (`background/service-worker.js`) - API orchestration, message routing, data processing
2. **Content Script** (`content-scripts/page-capture.js`) - DOM analysis, element database building, variation preview
3. **Side Panel UI** (`sidepanel/sidepanel.js`) - User interface, settings, generation workflow

### Element Database Pattern (Key Innovation)
Instead of sending raw HTML to AI, the extension builds a **structured element database**:

```javascript
// Each element captured with rich metadata
{
  "id": "el_001",
  "selector": "button#hero-cta",           // Real, verified selector
  "text": "Get Started Now",               // Key for AI matching
  "visual": { "backgroundColor": "#2563eb", "position": {...} },
  "metadata": { "category": "cta", "importance": 10 }
}
```

This reduces token usage by 85% and eliminates selector hallucinations.

## 🔄 Data Flow

### Page Capture → Code Generation
1. Content script extracts top 50 elements using `buildElementDatabase()`
2. Service worker receives structured data (not raw HTML)
3. ChatGPT matches user request to elements using metadata
4. Generates code with pre-verified selectors
5. Content script applies preview using `applyVariation()`

### Message Passing Pattern
```javascript
// Always use chrome.runtime.sendMessage with specific types
{ type: 'CAPTURE_PAGE_DATA' }      // → Content script
{ type: 'GENERATE_CODE' }          // → Service worker
{ type: 'APPLY_VARIATION' }        // → Content script preview
```

## 🎯 Convert.com Code Generation

### Critical Patterns
- Use `convert._$()` for polling-based selections (handles race conditions)
- Use `convert.$()` for standard jQuery operations
- Prefer CSS changes over JavaScript when possible
- Always include `!important` flags in CSS for override priority

### Code Structure Template
```javascript
// Generated format follows this pattern:
{
  variations: [{
    number: 1,
    name: "Variation 1", 
    css: "/* Convert.com CSS */",
    js: "/* Convert.com JavaScript */"
  }],
  globalCSS: "/* Shared styles */",
  globalJS: "/* Shared logic */"
}
```

## 🛠️ Development Patterns

### Service Worker Utilities
- `createOperationLogger()` for structured logging with context
- `handleMessage()` routing for chrome.runtime.onMessage
- Chrome storage APIs for settings persistence

### Content Script Capabilities  
- `capturePageData()` builds element database + screenshot
- `applyVariation()` injects CSS/JS for live preview
- `clearInjectedAssets()` removes preview elements

### Error Handling Convention
```javascript
try {
  const result = await operation();
  sendResponse({ success: true, data: result });
} catch (error) {
  console.error('Context:', error);
  sendResponse({ success: false, error: error.message });
}
```

## 🔧 Key Files to Understand

- `utils/chatgpt-api.js` - Prompt engineering for Convert.com code generation
- `utils/code-formatter.js` - Output formatting (clipboard, export, Convert.com editor)
- `content-scripts/page-capture.js:buildElementDatabase()` - Core element extraction logic
- `sidepanel/sidepanel.js:ExperimentBuilder` - Main UI controller class

## 🚀 Development Workflow

### Testing Changes
1. Modify code
2. Reload extension at `chrome://extensions/`
3. Test capture → generation → preview cycle
4. Check browser console for detailed logs

### Adding Features
- New message types require updates to both service worker and content script listeners
- UI changes need corresponding event handlers in `sidepanel.js`
- Storage changes should update both settings save/load methods

### Debugging
- Service worker logs: Right-click extension icon → "Inspect service worker"  
- Content script logs: F12 Developer Tools on target page
- Side panel logs: Right-click extension icon → "Inspect popup"

### Common Issues & Solutions
**Problem**: Generated JavaScript fails with "waitForElement is not defined"
- **Cause**: Utility functions not injected into page context
- **Fix**: Utility functions are injected via `chrome.scripting.executeScript` in service worker
- **Location**: `background/service-worker.js` around line 1000

**Problem**: CSS applies but JavaScript changes don't take effect
- **Debug**: Check console for JavaScript execution errors
- **Check**: Verify selectors exist on page using browser DevTools

**Problem**: CSS not applying despite success logs
- **Cause**: Generated selectors too specific (e.g., `.btn.class1.class2.class3.class4`)
- **Debug**: Check `[Convert CSS Debug]` logs for selector match count
- **Fix**: Improved selector generation prefers simpler, more robust selectors
- **Location**: `content-scripts/page-capture.js:generateUniqueSelector()`

**Problem**: CSS/JS parsing errors due to comments in generated code
- **Cause**: AI includes comments like `// No global CSS needed` in CSS blocks
- **Fix**: Code is automatically cleaned before injection (removes comments and empty lines)
- **Location**: `background/service-worker.js:applyVariation()` and `content-scripts/page-capture.js`

The Element Database architecture is the foundation - understand it first, then extend it.