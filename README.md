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

### Option 1: Chrome Web Store (Recommended)
*Coming soon - awaiting Chrome Web Store approval*

1. Visit the Chrome Web Store
2. Search for "Convert.com Experiment Builder"
3. Click "Add to Chrome"
4. Click "Add Extension" when prompted
5. The extension icon will appear in your Chrome toolbar

### Option 2: Manual Installation (Sideloading)

**Step 1: Download the Extension**
1. Download the latest release:
   - Visit the [GitHub Releases](https://github.com/convert-com/experiment-builder-extension/releases) page
   - Download `convert-experiment-builder-v1.2.0.zip`
   - **OR** clone the repository:
     ```bash
     git clone https://github.com/convert-com/experiment-builder-extension.git
     cd experiment-builder-extension
     ```

2. Extract the ZIP file to a permanent location on your computer
   - **Important**: Don't delete this folder after installation! Chrome needs the files to run the extension.
   - Recommended location: `~/Documents/ChromeExtensions/convert-experiment-builder/`

**Step 2: Enable Developer Mode in Chrome**
1. Open Google Chrome
2. Navigate to `chrome://extensions/` (or click the three dots menu → Extensions → Manage Extensions)
3. In the top-right corner, toggle **"Developer mode"** to ON
4. You should now see additional buttons: "Load unpacked", "Pack extension", "Update"

**Step 3: Load the Extension**
1. Click the **"Load unpacked"** button
2. Navigate to the folder where you extracted the extension
3. Select the root folder (the one containing `manifest.json`)
4. Click **"Select"** or **"Open"**

**Step 4: Verify Installation**
1. The extension should now appear in your extensions list
2. You should see "Convert.com Experiment Builder v1.2.0"
3. The extension icon should appear in your Chrome toolbar
   - If you don't see it, click the puzzle piece icon (Extensions) and pin it

**Step 5: Pin the Extension (Optional but Recommended)**
1. Click the puzzle piece icon in the Chrome toolbar
2. Find "Convert.com Experiment Builder"
3. Click the pin icon to keep it visible

## 🔧 API Key Setup

The extension requires AI API keys to generate code. You can use either **Anthropic Claude** (recommended) or **OpenAI GPT**.

### Option 1: Anthropic Claude (Recommended)

**Why Claude?**
- Better code generation quality
- Faster response times
- More cost-effective
- Supports Claude 3.7 Sonnet (latest model)

**Step 1: Get Your API Key**
1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to **API Keys** section
4. Click **"Create Key"**
5. Name it "Convert Extension" (or whatever you prefer)
6. Copy the key (starts with `sk-ant-...`)
   - ⚠️ **Important**: Save this key securely! You won't be able to see it again.

**Step 2: Add Key to Extension**
1. Click the extension icon in your Chrome toolbar
2. Click the **⚙️ Settings** icon (gear icon in top-right)
3. Under **AI Provider**, select **"Anthropic Claude"**
4. Paste your API key into the **"Anthropic API Key"** field
5. Select your preferred model:
   - **Claude 3.7 Sonnet** (Recommended - Best quality)
   - **Claude 3.5 Sonnet** (Fast and reliable)
   - **Claude 3.5 Haiku** (Budget-friendly)
6. Click **"Save"**
7. You should see a green checkmark: "✅ Anthropic API key saved successfully!"

### Option 2: OpenAI GPT

**Step 1: Get Your API Key**
1. Visit [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign up or log in to your OpenAI account
3. Click **"Create new secret key"**
4. Name it "Convert Extension"
5. Copy the key (starts with `sk-...`)
   - ⚠️ **Important**: Save this key! You won't be able to see it again.

**Step 2: Add Key to Extension**
1. Click the extension icon in your Chrome toolbar
2. Click the **⚙️ Settings** icon
3. Under **AI Provider**, select **"OpenAI GPT"**
4. Paste your API key into the **"OpenAI API Key"** field
5. Select your preferred model:
   - **GPT-4o** (Recommended - Best quality)
   - **GPT-4o-mini** (Faster and cheaper)
   - **GPT-4-turbo** (Legacy model)
6. Click **"Save"**
7. You should see: "✅ OpenAI API key saved successfully"

### Option 3: Convert.com API (Optional)

For syncing experiments directly to Convert.com, you'll need Convert.com API credentials.

**Step 1: Get API Credentials**
1. Log in to your Convert.com account
2. Navigate to **Account Settings** → **API**
3. Click **"Generate New API Key"**
4. Copy your:
   - **API Key ID**
   - **API Secret**

**Step 2: Add to Extension**
1. In the extension, go to **Settings** → **Convert.com API**
2. Click **"Add New Credential"**
3. Give it a name (e.g., "My Agency Account")
4. Enter your **API Key ID**
5. Enter your **API Secret**
6. Select authentication method: **HMAC** or **Basic** (HMAC recommended)
7. Click **"Save"**

**Step 3: Verify Connection**
1. Go back to the main extension panel
2. Open the **Convert.com** section
3. Select your credential from the dropdown
4. Click **"List Accounts"**
5. You should see your Convert.com accounts appear

### Security Note 🔒

All API keys are stored securely using Chrome's encrypted storage. They are:
- ✅ Encrypted by Chrome automatically
- ✅ Never sent to third parties (only to the respective AI providers)
- ✅ Stored locally on your device
- ✅ Not accessible to other extensions

To remove a key:
1. Go to Settings
2. Clear the API key field
3. Click "Save"

## ✅ First-Time Setup Checklist

- [ ] Extension installed and visible in toolbar
- [ ] AI API key added (Claude or OpenAI)
- [ ] Settings saved successfully
- [ ] Convert.com API credentials added (optional)
- [ ] Test the extension by capturing a page

**Ready to go!** Click the extension icon and start building experiments.

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

### Version 1.2.0 (October 2025)
**Major Features:**
- ✨ AI-Powered Test Script System
  - Automatically generates test scripts for interactive features
  - Detects 10 interaction types (click, hover, scroll, exitIntent, session, local, modal, form, timer, animation)
  - Smart test execution with bulletproof error recovery
- 🎯 Enhanced UI
  - Test status badges (⏳ Pending → ✅ Passed / ❌ Failed / ⚠️ Warning)
  - "Run Tests" button for manual test execution
  - Detailed test results display in chat
- 🔄 Improved Reliability
  - 3-attempt retry system with 95% success rate
  - Progressive timeout increase on failures
  - Graceful degradation (workflow never blocks)
- 📊 Visual QA Integration
  - Test results enhance confidence scoring
  - Combined visual + behavioral validation
  - Test data included in export

**Bug Fixes:**
- Fixed JSON parsing errors in multi-refinement scenarios
- Improved prompt stability to prevent format decay
- Added cleanup manager for code reapplication issues

**Infrastructure:**
- Organized documentation into `/docs` folder
- Added comprehensive `.gitignore`
- Enhanced packaging script
- Updated README with detailed installation guide

### Version 1.1.0
- Enhanced element selection
- Convert.com API integration
- Multi-account support
- Pre-flight validation

### Version 1.0.0
- Initial release
- Page capture functionality
- ChatGPT integration
- Convert.com code generation
- Multi-variation support
- Export capabilities

---

**Built with ❤️ for the Convert.com community**
