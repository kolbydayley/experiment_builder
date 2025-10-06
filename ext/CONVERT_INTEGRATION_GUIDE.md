# 🚀 Complete Implementation Guide - Convert.com Integration

## ✅ Phase 1: COMPLETED - Settings Page
- ✅ Created settings/settings.html - Beautiful settings interface
- ✅ Created settings/settings.js - API key management logic
- ✅ Stores Convert.com API keys with labels
- ✅ Stores OpenAI API key
- ✅ Model selection

## 🔧 Phase 2: Manifest & Service Worker Updates

### Update manifest.json

Add to the `manifest.json` file:

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs",
    "sidePanel"
  ],
  "host_permissions": [
    "https://api.convert.com/*",
    "https://api.openai.com/*"
  ],
  "options_page": "settings/settings.html"
}
```

### Add Convert.com API Integration to service-worker.js

Add these methods to the ServiceWorker class:

```javascript
// Convert.com API Integration
async createConvertExperiment(experimentData) {
  const { apiKey, projectId, name, description, variations, url } = experimentData;
  
  if (!apiKey) {
    throw new Error('Convert.com API key is required');
  }

  const logger = this.createOperationLogger('CreateExperiment');
  logger.log('Creating experiment in Convert.com', `name=${name}`);

  try {
    // Create experiment via Convert.com API
    const response = await fetch('https://api.convert.com/v1/experiments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name,
        description,
        project_id: projectId,
        url_targeting: {
          include_url: url
        },
        variations: this.formatVariationsForConvert(variations),
        status: 'draft'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Convert.com API error: ${errorData.message || response.status}`);
    }

    const result = await response.json();
    logger.log('Experiment created successfully', `id=${result.id}`);

    return {
      success: true,
      experimentId: result.id,
      experimentUrl: `https://app.convert.com/experiments/${result.id}`,
      logs: logger.entries()
    };
  } catch (error) {
    logger.error('Failed to create experiment', error.message);
    throw error;
  }
}

formatVariationsForConvert(variations) {
  return variations.map((variation, index) => {
    // Wrap CSS in JavaScript to inject as style tag
    const jsWithCSS = this.wrapCSSInJS(variation.css, variation.js);
    
    return {
      name: variation.name,
      weight: 50, // Equal distribution
      code: jsWithCSS
    };
  });
}

wrapCSSInJS(css, js) {
  let code = '';
  
  // Inject CSS via JavaScript
  if (css && css.trim()) {
    code += `
// Inject CSS
(function() {
  const style = document.createElement('style');
  style.setAttribute('data-convert-variation', 'true');
  style.textContent = \`${css.replace(/`/g, '\\`')}\`;
  document.head.appendChild(style);
})();
`;
  }
  
  // Add JavaScript
  if (js && js.trim()) {
    code += '\n' + js;
  }
  
  return code;
}

// Add message handler
async handleMessage(message, sender, sendResponse) {
  try {
    switch (message.type) {
      // ... existing cases ...
      
      case 'CREATE_CONVERT_EXPERIMENT':
        const experiment = await this.createConvertExperiment(message.data);
        sendResponse({ success: true, data: experiment });
        break;
      
      case 'GET_CONVERT_API_KEYS':
        const keys = await this.getConvertAPIKeys();
        sendResponse({ success: true, keys });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Message handling error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async getConvertAPIKeys() {
  try {
    const result = await chrome.storage.local.get(['convertApiKeys']);
    return result.convertApiKeys || [];
  } catch (error) {
    console.error('Failed to get Convert API keys:', error);
    return [];
  }
}
```

## 📊 Phase 3: Sidepanel UI Updates

Add to sidepanel.html (after the variations list):

```html
<!-- Convert.com Integration Section -->
<div class="section" id="convertIntegrationSection" style="display: none;">
  <div class="section-header">
    <h3>🚀 Create Experiment in Convert.com</h3>
  </div>
  
  <div class="form-group">
    <label>Select Convert.com API Key</label>
    <select id="convertApiKeySelect" class="form-control">
      <option value="">-- Select API Key --</option>
    </select>
    <button class="btn btn-link" onclick="chrome.runtime.openOptionsPage()">
      ⚙️ Manage API Keys
    </button>
  </div>
  
  <div class="form-group">
    <label>Project ID</label>
    <input 
      type="text" 
      id="convertProjectId" 
      class="form-control" 
      placeholder="Enter Convert.com Project ID"
    >
  </div>
  
  <div class="form-group">
    <label>Experiment Name</label>
    <input 
      type="text" 
      id="convertExperimentName" 
      class="form-control" 
      value=""
    >
  </div>
  
  <button 
    id="createConvertExperimentBtn" 
    class="btn btn-primary" 
    style="width: 100%;"
  >
    Create Experiment in Convert.com
  </button>
  
  <div id="convertStatus" style="margin-top: 12px;"></div>
</div>
```

Add to sidepanel.js:

```javascript
// Load Convert.com API keys
async loadConvertAPIKeys() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_CONVERT_API_KEYS' 
    });
    
    if (response.success && response.keys.length > 0) {
      const select = document.getElementById('convertApiKeySelect');
      select.innerHTML = '<option value="">-- Select API Key --</option>' +
        response.keys.map(key => 
          `<option value="${key.id}">${key.label}</option>`
        ).join('');
      
      // Show the Convert.com section
      document.getElementById('convertIntegrationSection').style.display = 'block';
    }
  } catch (error) {
    console.error('Failed to load Convert API keys:', error);
  }
}

// Create experiment in Convert.com
async createConvertExperiment() {
  const apiKeyId = document.getElementById('convertApiKeySelect').value;
  const projectId = document.getElementById('convertProjectId').value.trim();
  const experimentName = document.getElementById('convertExperimentName').value.trim();
  
  if (!apiKeyId) {
    this.showStatus('Please select a Convert.com API key', 'error');
    return;
  }
  
  if (!projectId) {
    this.showStatus('Please enter a Project ID', 'error');
    return;
  }
  
  if (!experimentName) {
    this.showStatus('Please enter an experiment name', 'error');
    return;
  }
  
  if (!this.lastGeneration) {
    this.showStatus('No generated code found. Generate code first.', 'error');
    return;
  }
  
  const btn = document.getElementById('createConvertExperimentBtn');
  btn.disabled = true;
  btn.textContent = 'Creating Experiment...';
  
  try {
    // Get the selected API key
    const keysResponse = await chrome.runtime.sendMessage({ 
      type: 'GET_CONVERT_API_KEYS' 
    });
    const selectedKey = keysResponse.keys.find(k => k.id === apiKeyId);
    
    if (!selectedKey) {
      throw new Error('Selected API key not found');
    }
    
    // Create experiment
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_CONVERT_EXPERIMENT',
      data: {
        apiKey: selectedKey.apiKey,
        projectId,
        name: experimentName,
        description: this.lastGenerationData.description,
        url: this.currentPageData.url,
        variations: this.lastGeneration.variations
      }
    });
    
    if (response.success) {
      this.showStatus(
        `✅ Experiment created! <a href="${response.data.experimentUrl}" target="_blank">Open in Convert.com</a>`,
        'success'
      );
    } else {
      throw new Error(response.error || 'Failed to create experiment');
    }
  } catch (error) {
    console.error('Failed to create experiment:', error);
    this.showStatus(`❌ ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Experiment in Convert.com';
  }
}

showStatus(message, type = 'info') {
  const status = document.getElementById('convertStatus');
  status.innerHTML = `
    <div class="alert alert-${type}">
      ${message}
    </div>
  `;
}

// Call in initialization
async init() {
  // ... existing initialization ...
  await this.loadConvertAPIKeys();
  
  // Add event listener
  document.getElementById('createConvertExperimentBtn')?.addEventListener('click', () => {
    this.createConvertExperiment();
  });
}
```

## 🎨 Phase 4: CSS-via-JS Modification (DONE IN SERVICE WORKER)

The `wrapCSSInJS()` function already handles this:
- Creates a style tag dynamically
- Injects CSS content into the tag
- Appends to document.head
- All styles are applied via JavaScript

## 🔄 Phase 5: Improved Per-Variation Editing

Add to sidepanel.html:

```html
<div class="variation-editor" style="display: none;" id="variationEditor">
  <div class="editor-header">
    <h3 id="editorTitle">Edit Variation</h3>
    <button class="btn-close" onclick="closeVariationEditor()">✕</button>
  </div>
  
  <div class="editor-content">
    <div class="form-group">
      <label>Feedback/Instructions</label>
      <textarea 
        id="variationFeedback" 
        class="form-control" 
        rows="3"
        placeholder="E.g., Make the button bigger, change color to blue, add animation..."
      ></textarea>
    </div>
    
    <div class="editor-actions">
      <button class="btn btn-primary" onclick="refineVariation()">
        🤖 Refine with AI
      </button>
      <button class="btn btn-secondary" onclick="testVariation()">
        🧪 Test Changes
      </button>
    </div>
    
    <div class="code-preview">
      <h4>Current Code</h4>
      <pre id="variationCodePreview"></pre>
    </div>
  </div>
</div>
```

## 🧪 Phase 6: Interactive Testing

Add to service-worker.js:

```javascript
async testInteractiveFeatures(variation, testScenarios) {
  const logger = this.createOperationLogger('InteractiveTest');
  logger.log('Testing interactive features', `scenarios=${testScenarios.length}`);
  
  const results = [];
  
  for (const scenario of testScenarios) {
    try {
      const result = await this.executeTestScenario(scenario, variation);
      results.push(result);
      
      if (!result.passed) {
        logger.error(`Test failed: ${scenario.name}`, result.error);
      }
    } catch (error) {
      logger.error(`Test error: ${scenario.name}`, error.message);
      results.push({
        name: scenario.name,
        passed: false,
        error: error.message
      });
    }
  }
  
  const allPassed = results.every(r => r.passed);
  
  return {
    passed: allPassed,
    results,
    logs: logger.entries()
  };
}

async executeTestScenario(scenario, variation) {
  // scenario = { name, selector, action, expected }
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: this.currentTabId },
    world: 'MAIN',
    func: (selector, action, expected) => {
      const element = document.querySelector(selector);
      
      if (!element) {
        return { passed: false, error: `Element not found: ${selector}` };
      }
      
      try {
        // Perform action
        switch (action.type) {
          case 'click':
            element.click();
            break;
          case 'hover':
            element.dispatchEvent(new MouseEvent('mouseenter'));
            break;
          case 'focus':
            element.focus();
            break;
        }
        
        // Wait for changes
        return new Promise(resolve => {
          setTimeout(() => {
            // Check expected outcome
            const actualValue = eval(expected.check);
            const passed = actualValue === expected.value;
            
            resolve({
              passed,
              actual: actualValue,
              expected: expected.value,
              error: passed ? null : `Expected ${expected.value}, got ${actualValue}`
            });
          }, action.waitMs || 500);
        });
      } catch (error) {
        return { passed: false, error: error.message };
      }
    },
    args: [scenario.selector, scenario.action, scenario.expected]
  });
  
  return result[0].result;
}
```

## 🔄 Phase 7: AI Feedback Loop for Failed Tests

Add to service-worker.js:

```javascript
async refineVariationWithFeedback(variation, testResults, userFeedback) {
  const logger = this.createOperationLogger('RefineVariation');
  
  // Build feedback context
  let feedbackContext = '';
  
  if (testResults && !testResults.passed) {
    feedbackContext += '\n**TEST FAILURES:**\n';
    testResults.results.filter(r => !r.passed).forEach(result => {
      feedbackContext += `- ${result.name}: ${result.error}\n`;
    });
  }
  
  if (userFeedback) {
    feedbackContext += `\n**USER FEEDBACK:**\n${userFeedback}\n`;
  }
  
  // Call adjust code with feedback
  const adjusted = await this.adjustCode({
    generationData: this.lastGenerationData,
    previousCode: variation.js + '\n\n' + variation.css,
    feedback: feedbackContext,
    testSummary: testResults
  });
  
  return adjusted;
}
```

## 📝 Implementation Checklist

### Immediate Tasks (Do these now):
- [ ] Update manifest.json with permissions and options_page
- [ ] Add Convert.com API methods to service-worker.js
- [ ] Update sidepanel.html with Convert.com section
- [ ] Update sidepanel.js with API key loading and experiment creation
- [ ] Test settings page opens correctly
- [ ] Test API key storage works

### Phase 2 Tasks (After basic integration works):
- [ ] Add per-variation editor UI
- [ ] Implement refine variation flow
- [ ] Add interactive testing scenarios
- [ ] Implement AI feedback loop

### Testing Tasks:
- [ ] Test adding/removing API keys
- [ ] Test creating experiment in Convert.com
- [ ] Test CSS injection via JavaScript
- [ ] Test variation editing workflow
- [ ] Test interactive features

## 🎯 Usage Flow

1. User opens settings, adds Convert.com API key
2. User generates code for experiment
3. User selects API key from dropdown
4. User enters Project ID and experiment name
5. Click "Create Experiment" → pushes to Convert.com
6. All CSS is wrapped in JavaScript that creates style tags
7. User can edit individual variations
8. AI refines based on test results and feedback

## 🚀 Next Steps

Once basic integration is working:
1. Add variation preview mode
2. Add A/B test traffic allocation controls
3. Add experiment scheduling
4. Add conversion goal configuration
5. Add advanced targeting options

---

**Total files created:**
- ✅ settings/settings.html
- ✅ settings/settings.js
- 📝 Need to update: manifest.json
- 📝 Need to update: service-worker.js
- 📝 Need to update: sidepanel/sidepanel.html
- 📝 Need to update: sidepanel/sidepanel.js

Ready to continue with the integration? Let me know which part you want me to implement next!
