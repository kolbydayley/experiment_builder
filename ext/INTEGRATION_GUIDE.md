# 🚀 Implementation Guide - New Features Integration

This guide explains how to integrate the new features into your existing extension.

## 📦 What Was Created

### New Files:
1. **content-scripts/element-selector.js** - Visual element picker
2. **utils/session-manager.js** - Session persistence
3. **utils/convert-smart-lists.js** - Enhanced dropdowns with sorting
4. **utils/prompt-assistant.js** - Prompt suggestions and templates
5. **utils/design-file-manager.js** - Design file handling
6. **sidepanel/sidepanel-enhanced.css** - Additional CSS for new components

### Updated Files:
- **manifest.json** - Added element-selector.js, updated version to 1.1.0

## 🔧 Integration Steps

### Step 1: Update sidepanel.html

Add these new sections to your `sidepanel.html`:

```html
<!-- Add this in the <head> section -->
<link rel="stylesheet" href="sidepanel-enhanced.css">

<!-- Add after the existing capture section -->
<div class="capture-mode-section">
  <label>Capture Mode</label>
  <div class="capture-mode-selector">
    <button class="btn-toggle active" id="captureModeFullBtn" data-mode="full">
      📄 Full Page
    </button>
    <button class="btn-toggle" id="captureModeElementBtn" data-mode="element">
      🎯 Select Element
    </button>
  </div>
  
  <!-- Show when element mode is active -->
  <div class="element-selection-hint hidden" id="elementSelectionHint">
    <span class="icon">👆</span>
    <span>Click "Capture Page" then select any element</span>
  </div>
  
  <!-- Show selected element -->
  <div class="selected-element-preview hidden" id="selectedElementPreview">
    <img id="elementPreviewImage" src="" alt="Selected element">
    <div class="element-info">
      <code id="elementSelector"></code>
      <button class="btn-small" id="changeElementBtn">Change Selection</button>
    </div>
  </div>
</div>

<!-- Add design file upload section -->
<div class="design-upload-area">
  <label>Design Files (Optional)</label>
  <div class="upload-methods">
    <div class="upload-box" id="fileUploadBox">
      <input type="file" id="designFileInput" accept="image/*" multiple>
      <div class="upload-prompt">
        <span class="icon">📎</span>
        <p>Drop design files here</p>
        <small>PNG, JPG, SVG, WebP</small>
      </div>
    </div>
    
    <div class="upload-box">
      <input type="text" id="figmaUrlInput" placeholder="Paste Figma URL (optional)">
      <button class="btn-small" id="importFigmaBtn">Import from Figma</button>
      <small style="display: block; margin-top: 8px; color: var(--text-secondary);">
        Or export PNG from Figma
      </small>
    </div>
  </div>
  
  <!-- Preview uploaded designs -->
  <div class="design-preview-grid" id="designPreviewGrid"></div>
  
  <div class="comparison-controls hidden" id="comparisonControls">
    <label>
      <input type="checkbox" id="showComparisonCheckbox" checked>
      Show side-by-side comparison to AI
    </label>
  </div>
</div>

<!-- Add prompt helper section -->
<div class="instruction-helper">
  <label for="descriptionText">Describe your changes</label>
  <div class="helper-actions">
    <button class="btn-text" id="showSuggestionsBtn">
      💡 Need ideas?
    </button>
    <button class="btn-text" id="showExamplesBtn">
      📚 See examples
    </button>
    <button class="btn-text" id="browseTemplatesBtn">
      📋 Browse Templates
    </button>
  </div>
  
  <div class="suggestion-chips hidden" id="suggestionChips">
    <div class="chip-label">Quick suggestions:</div>
  </div>
</div>

<!-- Add before </body> for modals -->
<div class="template-modal hidden" id="templateModal">
  <div class="modal-backdrop" onclick="document.getElementById('templateModal').classList.add('hidden')"></div>
  <div class="modal-content">
    <button class="modal-close" onclick="document.getElementById('templateModal').classList.add('hidden')">×</button>
    <h3>Experiment Templates</h3>
    <div class="template-grid" id="templateGrid"></div>
  </div>
</div>

<div class="examples-modal hidden" id="examplesModal">
  <div class="modal-backdrop" onclick="document.getElementById('examplesModal').classList.add('hidden')"></div>
  <div class="modal-content">
    <button class="modal-close" onclick="document.getElementById('examplesModal').classList.add('hidden')">×</button>
    <h3>Example Instructions</h3>
    <div class="example-grid" id="exampleGrid"></div>
  </div>
</div>
```

### Step 2: Update sidepanel.js

Add these imports and initialization in the `ExperimentBuilder` constructor:

```javascript
constructor() {
  // ... existing code ...
  
  // Initialize new managers
  this.sessionManager = new SessionManager(this);
  this.convertSmartLists = new ConvertSmartLists();
  this.promptAssistant = new PromptAssistant();
  this.designFileManager = new DesignFileManager();
  
  // Capture mode state
  this.captureMode = 'full'; // 'full' or 'element'
  this.selectedElementData = null;
  
  // ... rest of existing code ...
}
```

Add these new methods to the `ExperimentBuilder` class:

```javascript
// ============================================
// CAPTURE MODE METHODS
// ============================================

initCaptureModeToggle() {
  const fullBtn = document.getElementById('captureModeFullBtn');
  const elementBtn = document.getElementById('captureModeElementBtn');
  const hint = document.getElementById('elementSelectionHint');
  
  fullBtn?.addEventListener('click', () => {
    this.captureMode = 'full';
    fullBtn.classList.add('active');
    elementBtn.classList.remove('active');
    hint.classList.add('hidden');
    this.clearSelectedElement();
  });
  
  elementBtn?.addEventListener('click', () => {
    this.captureMode = 'element';
    elementBtn.classList.add('active');
    fullBtn.classList.remove('active');
    hint.classList.remove('hidden');
  });
  
  document.getElementById('changeElementBtn')?.addEventListener('click', () => {
    this.clearSelectedElement();
    this.capturePage();
  });
}

async capturePage() {
  // Override existing capturePage to support element mode
  
  if (this.captureMode === 'element') {
    return this.captureWithElementSelection();
  }
  
  // ... existing full page capture code ...
}

async captureWithElementSelection() {
  const btn = document.getElementById('captureBtn');
  this.setButtonLoading(btn, true);
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) throw new Error('No active tab found');
    
    // Start element selection
    this.addStatusLog('🎯 Click any element on the page to select it', 'info');
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'START_ELEMENT_SELECTION'
    });
    
    if (response?.success) {
      this.selectedElementData = response.data;
      this.displaySelectedElement(response.data);
      
      // Capture full page context as well
      const pageResponse = await chrome.runtime.sendMessage({
        type: 'CAPTURE_PAGE',
        tabId: tab.id
      });
      
      if (pageResponse.success) {
        this.currentPageData = pageResponse.data;
        this.currentPageData.selectedElement = response.data;
        this.addStatusLog('✓ Element captured successfully', 'success');
        this.showSuccess('Element selected!');
      }
    }
  } catch (error) {
    console.error('Element capture failed:', error);
    this.addStatusLog(`✗ Element capture failed: ${error.message}`, 'error');
    this.showError(error.message);
  } finally {
    this.setButtonLoading(btn, false);
  }
}

displaySelectedElement(elementData) {
  const preview = document.getElementById('selectedElementPreview');
  const img = document.getElementById('elementPreviewImage');
  const selector = document.getElementById('elementSelector');
  
  if (elementData.screenshot) {
    img.src = elementData.screenshot;
  }
  
  selector.textContent = elementData.selector;
  preview.classList.remove('hidden');
}

clearSelectedElement() {
  this.selectedElementData = null;
  document.getElementById('selectedElementPreview')?.classList.add('hidden');
}

// ============================================
// DESIGN FILE METHODS
// ============================================

initDesignFileHandling() {
  const fileInput = document.getElementById('designFileInput');
  const uploadBox = document.getElementById('fileUploadBox');
  const figmaBtn = document.getElementById('importFigmaBtn');
  const figmaInput = document.getElementById('figmaUrlInput');
  
  // File input change
  fileInput?.addEventListener('change', (e) => {
    this.handleFileUpload(e.target.files);
  });
  
  // Drag and drop
  uploadBox?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragging');
  });
  
  uploadBox?.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragging');
  });
  
  uploadBox?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragging');
    this.handleFileUpload(e.dataTransfer.files);
  });
  
  // Figma import
  figmaBtn?.addEventListener('click', () => {
    const url = figmaInput?.value;
    if (url) {
      this.handleFigmaImport(url);
    }
  });
}

async handleFileUpload(files) {
  if (!files || files.length === 0) return;
  
  for (const file of files) {
    try {
      const processed = await this.designFileManager.addFile(file);
      this.renderDesignPreview(processed);
      this.showSuccess(`Added ${file.name}`);
    } catch (error) {
      this.showError(error.message);
    }
  }
  
  this.updateComparisonControls();
}

async handleFigmaImport(url) {
  try {
    const result = await this.designFileManager.importFromFigma(url);
    if (!result.success) {
      this.showInfo(result.message);
      // Show instructions
      if (result.instructions) {
        this.addStatusLog(result.instructions.join('\n'), 'info');
      }
    }
  } catch (error) {
    this.showError(error.message);
  }
}

renderDesignPreview(file) {
  const grid = document.getElementById('designPreviewGrid');
  const card = document.createElement('div');
  card.innerHTML = this.designFileManager.generatePreviewCard(file);
  grid.appendChild(card);
  
  // Bind events
  card.querySelector('.design-remove-btn')?.addEventListener('click', () => {
    this.designFileManager.removeFile(file.id);
    card.remove();
    this.updateComparisonControls();
  });
  
  card.querySelector('.design-notes-input')?.addEventListener('input', (e) => {
    this.designFileManager.updateFileNotes(file.id, e.target.value);
  });
}

updateComparisonControls() {
  const controls = document.getElementById('comparisonControls');
  if (this.designFileManager.hasFiles()) {
    controls?.classList.remove('hidden');
  } else {
    controls?.classList.add('hidden');
  }
}

// ============================================
// PROMPT ASSISTANT METHODS
// ============================================

initPromptAssistant() {
  const suggestionsBtn = document.getElementById('showSuggestionsBtn');
  const examplesBtn = document.getElementById('showExamplesBtn');
  const templatesBtn = document.getElementById('browseTemplatesBtn');
  
  suggestionsBtn?.addEventListener('click', () => this.showSuggestions());
  examplesBtn?.addEventListener('click', () => this.showExamples());
  templatesBtn?.addEventListener('click', () => this.showTemplates());
}

showSuggestions() {
  const container = document.getElementById('suggestionChips');
  const suggestions = this.promptAssistant.getSuggestionsForElement(this.selectedElementData);
  
  container.innerHTML = '<div class="chip-label">Quick suggestions:</div>';
  
  suggestions.forEach(suggestion => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = suggestion;
    chip.addEventListener('click', () => {
      document.getElementById('descriptionText').value = suggestion;
      this.updateCharCounter();
      container.classList.add('hidden');
    });
    container.appendChild(chip);
  });
  
  container.classList.toggle('hidden');
}

showExamples() {
  const modal = document.getElementById('examplesModal');
  const grid = document.getElementById('exampleGrid');
  const examples = this.promptAssistant.getExamples();
  
  grid.innerHTML = '';
  
  Object.values(examples).flat().forEach(example => {
    const card = document.createElement('div');
    card.className = 'example-card';
    card.innerHTML = `
      <div class="example-label">${example.label}</div>
      <p>${example.text}</p>
    `;
    card.addEventListener('click', () => {
      document.getElementById('descriptionText').value = example.text;
      this.updateCharCounter();
      modal.classList.add('hidden');
    });
    grid.appendChild(card);
  });
  
  modal.classList.remove('hidden');
}

showTemplates() {
  const modal = document.getElementById('templateModal');
  const grid = document.getElementById('templateGrid');
  const templates = this.promptAssistant.templates;
  
  grid.innerHTML = '';
  
  Object.entries(templates).forEach(([id, template]) => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <h4>${template.icon} ${template.name}</h4>
      <p>${template.description}</p>
      <span class="template-meta">${template.variations.length} variations</span>
    `;
    card.addEventListener('click', () => {
      this.applyTemplate(template);
      modal.classList.add('hidden');
    });
    grid.appendChild(card);
  });
  
  modal.classList.remove('hidden');
}

applyTemplate(template) {
  // Clear existing variations
  this.variations = [];
  
  // Add template variations
  template.variations.forEach((v, idx) => {
    this.variations.push({
      id: idx + 1,
      name: v.name,
      description: v.instructions
    });
  });
  
  this.focusedVariationId = 1;
  this.renderVariations();
  this.showSuccess(`Applied template: ${template.name}`);
  this.addStatusLog(`📋 Applied template: ${template.name} (${template.variations.length} variations)`, 'success');
}

// ============================================
// ENHANCED GENERATION WITH NEW FEATURES
// ============================================

buildGenerationData() {
  // Override existing method to include new data
  
  const baseData = {
    pageData: this.currentPageData,
    description: document.getElementById('descriptionText').value.trim(),
    variations: this.variations,
    settings: this.settings
  };
  
  // Add element context if available
  if (this.selectedElementData) {
    baseData.selectedElement = this.selectedElementData;
  }
  
  // Add design files if available
  if (this.designFileManager.hasFiles()) {
    baseData.designFiles = this.designFileManager.getFiles();
  }
  
  // Enhance prompt with assistant
  if (baseData.description) {
    baseData.enhancedPrompt = this.promptAssistant.buildAIPromptWithContext(
      baseData.description,
      this.selectedElementData,
      baseData.designFiles
    );
  }
  
  return baseData;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

async initSession() {
  // Load previous session
  const session = await this.sessionManager.loadSession();
  
  if (session) {
    this.sessionManager.showRestoreDialog(session);
  }
  
  // Setup auto-save
  this.sessionManager.setupAutoSave();
}

// ============================================
// ENHANCED CONVERT LISTS
// ============================================

populateConvertExperiences() {
  // Override existing method with enhanced version
  
  const elements = this.getConvertElements();
  if (!elements.experienceSelect) return;

  // Sort experiences
  const sorted = this.convertSmartLists.sortExperiences(this.convertState.experiences || []);
  
  // Group by status
  const groups = this.convertSmartLists.groupExperiencesByStatus(sorted);
  
  // Create grouped select HTML
  elements.experienceSelect.innerHTML = this.convertSmartLists.createGroupedSelect(
    groups,
    this.convertSmartLists.enhanceExperienceDisplay,
    '-- Select Experience --'
  );
  
  elements.experienceSelect.disabled = false;
  
  // Add search functionality
  this.convertSmartLists.addSearchToSelect(elements.experienceSelect);
}

populateConvertProjects() {
  // Override with sorted version
  
  const elements = this.getConvertElements();
  if (!elements.projectSelect) return;

  const sorted = this.convertSmartLists.sortProjects(this.convertState.projects || []);
  
  const options = ['<option value="">-- Select Project --</option>']
    .concat(sorted.map(project => {
      const enhanced = this.convertSmartLists.enhanceProjectDisplay(project);
      return `<option value="${enhanced.value}" data-search="${enhanced.searchText}">${enhanced.html}</option>`;
    }));

  elements.projectSelect.innerHTML = options.join('');
  elements.projectSelect.disabled = sorted.length === 0;
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Enter: Generate code (when not in chat)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !this.chatState.sending) {
      const activeElement = document.activeElement;
      if (activeElement.id !== 'chatInput') {
        e.preventDefault();
        this.generateAndAutoTest();
      }
    }
    
    // Cmd/Ctrl + Shift + P: Capture page
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      this.capturePage();
    }
    
    // Esc: Close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.template-modal, .examples-modal').forEach(modal => {
        modal.classList.add('hidden');
      });
    }
  });
}
```

Update the initialization in constructor:

```javascript
initializeUI() {
  this.initializeNavigation();
  this.initCaptureModeToggle();  // NEW
  this.initDesignFileHandling();  // NEW
  this.initPromptAssistant();  // NEW
  this.initKeyboardShortcuts();  // NEW
  this.renderVariations();
  this.updateFocusedVariationWorkspace();
  this.updateCharCounter();
  this.renderConversation();
  this.setAiActivity('idle', 'Ready to review updates.');
  this.addStatusLog('Ready to generate experiments', 'info');
  this.initSession();  // NEW - Load previous session
}
```

### Step 3: Load New Scripts

Add these script tags to your `sidepanel.html` before the closing `</body>` tag:

```html
<script src="../utils/session-manager.js"></script>
<script src="../utils/convert-smart-lists.js"></script>
<script src="../utils/prompt-assistant.js"></script>
<script src="../utils/design-file-manager.js"></script>
<script src="sidepanel.js"></script>
```

### Step 4: Update service-worker.js

Add handler for element screenshot capture:

```javascript
// Add to message handlers in service-worker.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ... existing handlers ...
  
  if (message.type === 'CAPTURE_ELEMENT_SCREENSHOT') {
    handleElementScreenshot(message.rect, sender.tab.id)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'ELEMENT_SELECTED') {
    console.log('Element selected:', message.data);
    // You can store this or forward to sidepanel if needed
    sendResponse({ success: true });
  }
  
  if (message.type === 'ELEMENT_SELECTION_CANCELLED') {
    console.log('Element selection cancelled');
    sendResponse({ success: true });
  }
});

async function handleElementScreenshot(rect, tabId) {
  try {
    // Capture full tab
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    
    // Crop to element bounds using canvas
    // This would require implementing canvas cropping
    // For now, return full screenshot
    
    return { success: true, screenshot };
  } catch (error) {
    console.error('Element screenshot failed:', error);
    return { success: false, error: error.message };
  }
}
```

## 🎨 CSS Variables

Make sure your main `sidepanel.css` has these CSS variables defined:

```css
:root {
  --primary: #3b82f6;
  --background: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --success: #10b981;
  --danger: #ef4444;
}
```

## ✅ Testing Checklist

After integration, test these features:

- [ ] Element selector activates on button click
- [ ] Element selection shows preview and selector
- [ ] Design files can be uploaded
- [ ] Design file previews appear
- [ ] Prompt suggestions show up
- [ ] Examples modal works
- [ ] Templates apply correctly
- [ ] Session restore banner appears on reload
- [ ] Session restores Convert.com selections
- [ ] Convert dropdowns are sorted
- [ ] Keyboard shortcuts work (Cmd+Enter, Cmd+Shift+P)
- [ ] Search in dropdowns (if implemented)

## 🐛 Common Issues & Solutions

### Issue: Element selector doesn't activate
**Solution**: Check that element-selector.js is loaded in content scripts and manifest is updated.

### Issue: Design files don't upload
**Solution**: Verify file input has correct accept attribute and event listeners are bound.

### Issue: Session doesn't restore
**Solution**: Check chrome.storage.local permissions and that SessionManager is initialized.

### Issue: Dropdowns aren't sorted
**Solution**: Ensure ConvertSmartLists methods are called in populate functions.

### Issue: Keyboard shortcuts don't work
**Solution**: Verify initKeyboardShortcuts() is called and check for event.preventDefault().

## 📝 Next Steps

1. Test each feature individually
2. Test integration between features
3. Gather user feedback
4. Iterate based on usage patterns
5. Consider adding analytics to track feature adoption

## 💡 Future Enhancements

- Visual diff comparison (pixel-by-pixel)
- Performance monitoring for variations
- Accessibility checker integration
- Advanced Figma API integration
- Real-time collaboration features
- A/B test analytics dashboard

---

**Need Help?** Check the individual utility files for more detailed documentation and examples.
