# Chrome Web Store Privacy Justifications
## Convert.com Experiment Builder Extension

---

## Single Purpose Description

**Generate A/B test code for Convert.com using AI**

This extension helps marketers and developers create A/B test experiments for Convert.com by analyzing web pages and generating production-ready JavaScript and CSS code using AI (ChatGPT or Claude). Users can capture page elements, describe desired changes, and receive validated experiment code that can be exported or synced directly to Convert.com.

---

## Permission Justifications

### 1. **activeTab**
**Justification:** Required to capture and analyze the currently active web page to build an element database for code generation. The extension needs to:
- Extract DOM structure and element metadata from the visible page
- Apply preview code to show users how changes will look before deployment
- Validate generated code by testing selectors against the actual page elements

**User Benefit:** Users can generate accurate A/B test code based on their actual website without manually providing page structure.

---

### 2. **cookies**
**Justification:** Required for authenticating with Convert.com API to sync experiments. The extension needs to:
- Maintain Convert.com session authentication when users connect their Convert.com account
- Ensure users stay authenticated when browsing between Convert.com accounts and projects
- Enable seamless "Push to Convert" functionality without repeated login prompts

**User Benefit:** One-time authentication provides persistent access to Convert.com features without security compromise.

---

### 3. **Host Permissions (<all_urls>)**
**Justification:** Required to work with any website where users want to create A/B tests. Specific hosts required:

**https://api.openai.com/*** - Call ChatGPT API for AI code generation
**https://api.anthropic.com/*** - Call Claude API for AI code generation
**https://api.convert.com/*** - Sync experiments to Convert.com platform
**<all_urls>** - Inject content scripts on any page users want to analyze/test

**User Benefit:** Extension works on any website without limiting which sites users can optimize. Users can test on staging sites, production sites, or any custom domain.

---

### 4. **Remote Code Execution**
**Justification:** The extension generates JavaScript and CSS code via AI APIs and allows users to preview this code on their pages. This is the core functionality:

1. **AI-Generated Code:** User describes desired changes → AI generates code → User reviews code → User applies to page
2. **User Control:** All code is displayed in an editor before execution. Users can review, edit, or reject generated code
3. **Preview Mode:** Code is injected temporarily for visual preview, not permanently modified
4. **No Arbitrary Execution:** Only user-approved code from trusted AI providers (OpenAI/Anthropic) is executed

**Safety Measures:**
- Code is shown to users in a code editor before execution
- Users must explicitly click "Run" or "Apply" to execute code
- All generated code follows strict patterns (CSS selectors + vanilla JS only)
- Automatic validation checks prevent malicious selector patterns

**User Benefit:** Core A/B testing workflow requires dynamically applying code changes to preview experiments before deployment.

---

### 5. **scripting**
**Justification:** Required to inject content scripts that capture page data and apply code previews. The extension needs to:
- Inject page capture scripts to build element database from DOM structure
- Inject code testing scripts to validate that generated selectors work correctly
- Apply temporary code previews so users can see changes before committing

**User Benefit:** Enables visual preview of experiments and accurate element selection without page refreshes.

---

### 6. **sidePanel**
**Justification:** Required to provide the main user interface alongside the user's webpage. The side panel:
- Displays the experiment builder UI without blocking the page content
- Shows real-time code editor and preview controls
- Maintains state while users navigate between tabs

**User Benefit:** Non-intrusive UI that works alongside the page being optimized, allowing users to see changes in real-time.

---

### 7. **storage**
**Justification:** Required to save user preferences and experiment history locally. Storage is used for:
- Saving API keys (OpenAI, Anthropic, Convert.com) encrypted in local storage
- Storing experiment history and generated code for reuse
- Persisting user settings (preferred AI model, default variation count, etc.)
- Caching element databases to reduce repetitive page captures

**Data Privacy:**
- All data stored locally in browser using chrome.storage.local API
- No data transmitted to third parties except chosen AI provider and Convert.com (when user explicitly syncs)
- API keys never leave the user's browser except for API calls
- Users can clear all stored data from extension settings

**User Benefit:** Seamless experience across sessions without losing work or re-entering API credentials.

---

### 8. **tabCapture**
**Justification:** Required to capture screenshots of the page for visual context in AI code generation. The extension needs to:
- Capture full page screenshot to provide brand/style context to AI models
- Capture element-specific screenshots when users select specific page areas
- Compare before/after screenshots for visual QA validation

**User Benefit:** AI generates code that matches the page's existing brand, colors, and typography by analyzing visual context.

---

### 9. **tabs**
**Justification:** Required to manage extension behavior across browser tabs. The extension needs to:
- Detect which tab the user wants to analyze/modify
- Open side panel on the correct tab when extension icon is clicked
- Communicate between side panel and active tab for code application
- Query active tab URL for page context in generated code

**User Benefit:** Extension works correctly with multiple tabs open and applies changes to the intended page.

---

## Data Usage & Privacy Compliance

### Data Collection
**The extension does NOT collect, store, or transmit any personal data to our servers.** All data handling is:

1. **Local Storage Only:** API keys, settings, and experiment history stored exclusively in browser's local storage
2. **User-Controlled Transmission:** Data only sent to third parties when user explicitly:
   - Clicks "Generate Code" (sends page data to chosen AI provider)
   - Clicks "Push to Convert" (sends experiment to Convert.com)
3. **No Analytics/Tracking:** No usage analytics, telemetry, or tracking of any kind
4. **No Ads:** No advertising or monetization of user data

### Third-Party Data Sharing
Data is transmitted ONLY to services users explicitly configure:

**OpenAI (api.openai.com):** Page element data + user's code request → IF user selects ChatGPT as AI provider
**Anthropic (api.anthropic.com):** Page element data + user's code request → IF user selects Claude as AI provider
**Convert.com (api.convert.com):** Generated experiment code → IF user clicks "Push to Convert"

**What is NOT shared:**
- No browsing history
- No personal information
- No data from pages where extension is not actively used
- No data shared without explicit user action

### User Control
Users have full control over:
- Which AI provider to use (OpenAI, Anthropic, or none)
- Which pages to analyze (extension only runs when user opens side panel)
- What data to send (users can edit/remove page data before generating code)
- API key management (users provide their own keys, can revoke anytime)

---

## Developer Program Policies Compliance

✅ **Limited Use:** All permissions used solely for stated A/B testing functionality
✅ **User Transparency:** All data usage explained in extension description and this document
✅ **Secure Handling:** API keys stored securely, HTTPS for all external API calls
✅ **No Malware:** Open source code, no obfuscation, transparent AI integration
✅ **Privacy Protection:** No personal data collection, no tracking, local storage only
✅ **User Control:** All AI calls and API syncs require explicit user action

---

## Contact Information

**Developer Email:** [Your Email Here]
**Support:** [GitHub Issues Link or Support Email]
**Privacy Policy:** [Link to Privacy Policy if available]
**Source Code:** https://github.com/kolbydayley/experiment_builder

---

## Summary for Chrome Web Store Review

This extension provides a productivity tool for Convert.com users to generate A/B test code using AI. All permissions are essential for core functionality:

- **Page Analysis** (activeTab, scripting, tabs) - Capture page structure for accurate code generation
- **Visual Context** (tabCapture) - Provide screenshots to AI for brand-aware code suggestions
- **User Interface** (sidePanel) - Non-intrusive workspace alongside the page
- **Integrations** (host permissions) - Connect to AI providers and Convert.com API
- **Persistence** (storage, cookies) - Save settings and maintain authentication
- **Preview** (remote code) - Show users how changes look before deployment

**Privacy First:** No data collection, local storage only, user-controlled third-party sharing, full transparency.
