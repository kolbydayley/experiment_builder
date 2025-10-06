# Convert.com Experiment Builder Chrome Extension

A powerful Chrome extension that generates Convert.com A/B test experiment code using AI. Simply capture any web page, describe your desired changes, and get production-ready Convert.com code generated automatically using ChatGPT.

## 🚀 Features

### Core Functionality
- **Page Capture**: Automatically extract HTML, CSS, and screenshot from any webpage
- **AI Code Generation**: Use ChatGPT to generate Convert.com-compatible experiment code
- **Multiple Input Methods**: 
  - Text descriptions of desired changes
  - Design file uploads (PNG, JPG, SVG, Figma exports)
- **Multi-Variation Support**: Create multiple variations in a single experiment

### Convert.com Integration
- **Proper Convert.com Syntax**: Uses `convert._$()` for polling-based selections
- **Race Condition Handling**: Includes DOM ready checks and element waiting
- **CSS-First Approach**: Prioritizes CSS changes for better performance
- **Global Experience Support**: Generates shared code across variations
- **Account & Project Browser**: Select API credentials, browse accessible accounts, and drill into projects without leaving the side panel
- **Experience Sync**: Pull existing Convert experiences, edit them with AI or manually, and push updates or brand-new drafts back via the API
- **Pre-flight Validation**: Automatic verification runs after AI/manual edits plus a manual "Run Current Variation" tester before publishing

### User Interface
- **Side Panel Design**: Clean, modern interface with Convert.com branding
- **Live Preview**: See page screenshots and code output in real-time
- **Export Options**: Download organized files or copy to clipboard
- **Generation History**: Access previous generations for quick reuse

## 📦 Installation

### Development Installation
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your Chrome toolbar

### Production Installation
*When published to Chrome Web Store:*
1. Visit the Chrome Web Store
2. Search for "Convert.com Experiment Builder"
3. Click "Add to Chrome"

## 🔧 Setup Requirements

### Authentication
The extension requires access to ChatGPT/OpenAI API:

**Option 1: Browser Session (Recommended)**
- Be logged into ChatGPT in your browser
- Extension will use your existing session

**Option 2: API Token**
- Get an OpenAI API token
- Enter it in the extension settings

### Permissions
The extension requests these permissions:
- `activeTab`: To capture current page content
- `storage`: To save settings and generation history
- `sidePanel`: To display the extension interface
- `scripting`: To inject page capture scripts
- `tabs`: To access tab information
- `cookies`: To retrieve authentication tokens

## 📋 Usage Guide

### Step 1: Capture Page
1. Navigate to the page you want to test
2. Click the extension icon or open the side panel
3. Click "Capture Page" to extract page data and screenshot

### Step 2: Define Changes
Choose your input method:

**Text Description:**
- Describe your desired changes in natural language
- Example: "Change the call-to-action button from blue to red and make it 20% larger"

**Design Files:**
- Upload images showing your desired changes
- Support for PNG, JPG, SVG files up to 10MB each
- Multiple files for different variations

### Step 3: Configure Variations
- Add/remove variations as needed
- Name each variation descriptively
- Provide specific descriptions for each change

### Step 4: Generate Code
1. Adjust generation settings (CSS preference, DOM checks)
2. Click "Generate Experiment Code"
3. Wait for AI to analyze and generate the code

### Step 5: Use in Convert.com

**Option A – Sync via API (Recommended)**
1. Open the Convert.com section in the side panel and select your stored API credential
2. Pick the account and project you want to work in
3. Pull an existing experience _or_ choose “Create New Experience” to stage a draft
4. Run “Run Current Variation” to validate the code locally; resolve any issues surfaced in the status log
5. Click “Push Updates to Convert” to create or update the Convert experience directly via the API

**Option B – Manual Copy & Paste**
1. Copy the generated variation CSS/JS blocks
2. In Convert.com, create or edit the target experience
3. Paste CSS into each variation’s "Variation CSS" panel and JavaScript into "Variation JS"
4. Add any shared code to "Global Experience" sections
5. Preview and QA the experiment inside Convert before launching

## 🏗️ Project Structure

```
experiment_builder_ext/
├── manifest.json                 # Extension manifest
├── background/
│   └── service-worker.js        # Background service worker
├── sidepanel/
│   ├── sidepanel.html          # Main UI
│   ├── sidepanel.css           # Styling
│   └── sidepanel.js            # UI logic
├── content-scripts/
│   └── page-capture.js         # Page data extraction
├── utils/
│   ├── chatgpt-api.js          # ChatGPT integration
│   └── code-formatter.js       # Code formatting utilities
├── assets/
│   ├── icons/                  # Extension icons
│   └── logo.svg               # Convert.com logo
└── README.md                   # This file
```

## ⚙️ Technical Details

### Convert.com Code Standards
The extension generates code following Convert.com best practices:

**CSS Guidelines:**
- Uses `!important` flags strategically
- Specific selectors to avoid conflicts
- Responsive design considerations
- Performance-optimized styles

**JavaScript Guidelines:**
- `convert._$()` for polling-based element selection
- `convert.$()` for standard jQuery operations
- Proper DOM ready checks
- Race condition handling

### Generated Code Format
```css
/* Variation CSS */
.cta-button {
  background-color: #ff0000 !important;
  font-size: 1.2em !important;
}
```

```javascript
// Variation JavaScript
convert._$('.cta-button').waitUntilExists(function() {
  // Code runs when element is available
  convert._$(this).addClass('variation-active');
});
```

### AI Prompt Engineering
The extension constructs detailed prompts including:
- Full page HTML/CSS context
- Screenshot for visual reference
- Convert.com code format requirements
- CSS-first approach preferences
- Responsive design considerations

## ✅ Validation Workflow

- **Automatic Checks**: The extension automatically re-runs browser validations after AI refinements or manual code saves. Any console/runtime issues are surfaced in the status log and through toast messages.
- **Manual Trigger**: Use the "Run Current Variation" button to execute the selected variation immediately on the active tab. This captures console errors, verifies selectors, and grabs a screenshot for quick comparison.
- **Pre-publish Gate**: Attempts to push updates to Convert.com run mandatory validation passes. Deployments are blocked until the variation passes without errors, ensuring only working code reaches production.

Always review the status log if an error banner appears—each failed validation includes actionable diagnostics (missing selectors, console stack traces, etc.).

## 🔍 Troubleshooting

### Common Issues

**Page Capture Failed**
- Ensure you're on a valid web page (not chrome:// URLs)
- Check if the page has CORS restrictions
- Try refreshing the page and capturing again

**Code Generation Failed**
- Verify ChatGPT authentication
- Check your OpenAI API rate limits
- Ensure you have a stable internet connection

**Generated Code Not Working**
- Verify selectors are correct in Convert.com preview
- Check browser console for JavaScript errors
- Ensure elements exist when code runs

### Debug Mode
Enable Chrome DevTools for detailed logging:
1. Right-click extension icon → "Inspect popup"
2. Check console for error messages
3. Monitor network requests for API issues

## 🚦 Development

### Local Development
1. Make changes to source files
2. Reload extension in `chrome://extensions/`
3. Test functionality in side panel

### Building for Distribution
```bash
npm run package
```

### Code Style
- ES6+ JavaScript
- Modular architecture
- Comprehensive error handling
- Detailed code comments

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Areas for Contribution
- Additional AI model support
- Enhanced code formatting
- More Convert.com integrations
- UI/UX improvements
- Testing framework

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
- GitHub Issues: [Report bugs and feature requests]
- Convert.com Support: [Contact for Convert.com specific help]
- Documentation: [Visit Convert.com docs]

## 🔄 Changelog

### Version 1.0.0
- Initial release
- Page capture functionality
- ChatGPT integration
- Convert.com code generation
- Multi-variation support
- Export capabilities

---

**Built with ❤️ for the Convert.com community**
