# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Convert.com Experiment Builder** is a Chrome extension that generates Convert.com A/B test code using AI. It captures web pages, analyzes their structure, and uses ChatGPT to generate production-ready Convert.com experiment code with proper syntax, race condition handling, and CSS-first approach.

## Core Architecture

### Three-Component System

1. **Background Service Worker** (`background/service-worker.js`)
   - Orchestrates API calls, message routing, and data processing
   - Handles ChatGPT API integration and Convert.com API integration
   - Manages screenshot capture with timeout protection (15s max)
   - Routes messages between side panel and content scripts

2. **Content Scripts** (`content-scripts/`)
   - `page-capture.js`: Captures page data, builds element database, applies variation previews
   - `element-selector.js`: Interactive element selection UI
   - Execute in page context to extract DOM structure and apply code

3. **Side Panel UI** (`sidepanel/`)
   - Main user interface for the extension
   - Manages workflow: capture → generate → preview → export/sync
   - Real-time code editing with auto-validation
   - Convert.com API integration for pushing experiments

### Element Database Pattern (Critical Innovation)

Instead of sending raw HTML to AI (high token cost, selector hallucinations), the extension builds a **structured element database** with 85% token reduction:

```javascript
// Each element captured with verified metadata
{
  "id": "el_001",
  "selector": "button#hero-cta",           // Pre-verified, real selector
  "text": "Get Started Now",               // For AI matching
  "visual": { "backgroundColor": "#2563eb", "position": {...} },
  "metadata": { "category": "cta", "importance": 10 }
}
```

Key file: `utils/element-database.js:buildElementDatabase()`

### Data Flow: Capture → Generate → Preview

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
{ type: 'PING' }                   // → Check content script loaded
```

## Convert.com Code Generation

### Critical Patterns (See PROMPT_CRITICAL_RULES.txt)

1. **Vanilla JavaScript Only** - No jQuery, no libraries in generated code
2. **Use `waitForElement()` pattern** - Handles race conditions
3. **Pre-verified selectors only** - All selectors come from element database
4. **Direct inline styling** - `element.style.backgroundColor` for reliable changes
5. **Complete implementations** - Never skip requested changes (text AND color, etc.)

### Code Structure Template

```javascript
// Generated format
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

### Common Utility Pattern

```javascript
// waitForElement - polling-based element detection
function waitForElement(selector, callback, timeout = 10000) {
  const start = Date.now();
  const interval = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(interval);
      callback(element);
    } else if (Date.now() - start > timeout) {
      clearInterval(interval);
      console.error(`Element not found: ${selector}`);
    }
  }, 100);
}
```

## Development Commands

### Extension Development
```bash
# No build step required - pure JavaScript
npm run package    # Create distribution zip

# Load extension
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select extension directory
5. Reload after changes
```

### Testing Changes
1. Modify code files
2. Reload extension at `chrome://extensions/`
3. Test: capture → generate → preview cycle
4. Check browser console for logs

### Debugging
- **Service worker logs**: Right-click extension icon → "Inspect service worker"
- **Content script logs**: F12 Developer Tools on target page
- **Side panel logs**: Right-click side panel → "Inspect"

## Key Files to Understand

- `background/service-worker.js`: Message routing, API orchestration, screenshot capture
- `sidepanel/sidepanel.js`: ExperimentBuilder class - main UI controller
- `content-scripts/page-capture.js`: DOM analysis, variation preview, element database
- `utils/element-database.js`: Core element extraction logic
- `utils/chatgpt-api.js`: Prompt engineering for Convert.com code generation
- `utils/code-formatter.js`: Output formatting (clipboard, export, Convert.com editor)
- `PROMPT_CRITICAL_RULES.txt`: AI generation rules (critical for code quality)

## Common Issues & Solutions

### Generated code fails validation
- **Check**: Console errors in browser DevTools
- **Fix**: Verify selectors exist using element database
- **Location**: `content-scripts/page-capture.js:applyVariation()`

### Page capture hangs
- **Cause**: Timeout protection may need adjustment
- **Fix**: 15s timeout in `service-worker.js:CAPTURE_TIMEOUT`
- **Debug**: Check service worker console for timeout errors

### CSS not applying
- **Cause**: Overly specific selectors
- **Debug**: Check `[Convert CSS Debug]` logs for selector match count
- **Fix**: Simplify selectors in `generateUniqueSelector()`
- **Location**: `content-scripts/page-capture.js`

### JavaScript changes don't take effect
- **Check**: Console for execution errors
- **Verify**: Selectors exist on page in DevTools
- **Fix**: Ensure `waitForElement` is included in generated code

### AI includes comments in code blocks
- **Cause**: AI adds `// No global CSS needed` type comments
- **Fix**: Code automatically cleaned before injection
- **Location**: `background/service-worker.js:applyVariation()` and `content-scripts/page-capture.js`

## Convert.com API Integration

### Settings Management
- Settings page: `settings/settings.html`
- Supports multiple API keys (agencies/freelancers)
- OpenAI API key management
- Model selection (GPT-4o, GPT-4o-mini, GPT-4-turbo)

### API Workflow
1. User selects API credential from settings
2. Browse accounts and projects via Convert.com API
3. Pull existing experience OR create new draft
4. Run "Run Current Variation" to validate locally
5. "Push Updates to Convert" to create/update via API

### Pre-flight Validation
- Automatic validation after AI/manual edits
- Manual "Run Current Variation" button for testing
- Mandatory validation before pushing to Convert.com
- Console errors, selector verification, screenshot capture

## Important Conventions

### Error Handling
```javascript
try {
  const result = await operation();
  sendResponse({ success: true, data: result });
} catch (error) {
  console.error('Context:', error);
  sendResponse({ success: false, error: error.message });
}
```

### Service Worker Utilities
- `createOperationLogger()`: Structured logging with context
- `handleMessage()`: Message routing for chrome.runtime.onMessage
- Chrome storage APIs for settings persistence

### Content Script Capabilities
- `capturePageData()`: Builds element database + screenshot
- `applyVariation()`: Injects CSS/JS for live preview
- `clearInjectedAssets()`: Removes preview elements

### Adding New Features
- New message types require updates to both service worker and content script listeners
- UI changes need corresponding event handlers in `sidepanel.js`
- Storage changes should update both settings save/load methods

## File Organization

```
experiment_builder_ext/
├── background/
│   ├── service-worker.js          # Main service worker (ACTIVE)
│   ├── service-worker-backup.js   # Backup files (ignore)
│   └── selector-extractor.js      # Selector utilities
├── content-scripts/
│   ├── page-capture.js            # Page data extraction
│   └── element-selector.js        # Interactive element selection
├── sidepanel/
│   ├── sidepanel.html            # Main UI
│   ├── sidepanel.css             # Styling
│   └── sidepanel.js              # UI logic (ExperimentBuilder class)
├── utils/
│   ├── chatgpt-api.js            # ChatGPT integration
│   ├── code-formatter.js         # Code formatting
│   ├── element-database.js       # Element extraction
│   ├── session-manager.js        # Session state
│   ├── design-file-manager.js    # Design file handling
│   └── convert-smart-lists.js    # Convert.com API helpers
├── settings/
│   ├── settings.html             # Settings page
│   └── settings.js               # Settings management
├── assets/
│   ├── icons/                    # Extension icons
│   └── logo.svg                  # Convert.com logo
├── manifest.json                 # Extension manifest
└── PROMPT_CRITICAL_RULES.txt    # AI generation rules (CRITICAL)
```

## Documentation Files

The repository contains 29 `.md` documentation files. Most are historical development notes. Key files:

- `README.md`: User-facing documentation
- `QUICKSTART.md`: Quick start for Convert.com integration
- `DONE_READ_ME_FIRST.md`: Summary of recent fixes
- `.github/copilot-instructions.md`: AI coding guide (useful reference)

**Ignore backup and old documentation files** - focus on current implementation in active source files.

## AI Code Generation Rules (CRITICAL)

When generating Convert.com code, the AI follows strict rules in `PROMPT_CRITICAL_RULES.txt`:

1. Use selectors from element database only (pre-verified)
2. Match elements using text, visual properties, and context
3. Vanilla JavaScript only - no libraries
4. **Implement EVERY aspect of user request** - never skip parts
5. Use `element.style.backgroundColor` for colors
6. Use `element.textContent` for text
7. If user mentions text AND color, code must include BOTH
8. Use `waitForElement()` for reliability

The element database architecture eliminates selector hallucinations and is the foundation of reliable code generation.
