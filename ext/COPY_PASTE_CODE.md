# 📋 EXACT CODE TO COPY - Convert.com Integration

## 🎯 Quick Implementation Checklist

- ✅ Settings page created
- ✅ Manifest.json updated  
- ⬜ Add methods to service-worker.js (COPY CODE BELOW)
- ⬜ Update sidepanel (optional - for UI)

---

## 📝 Step 1: Add to service-worker.js

**Location:** Add these methods inside the `ServiceWorker` class, after the existing methods.

### Method 1: Get Convert API Keys

```javascript
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

### Method 2: Wrap CSS in JavaScript

```javascript
wrapCSSInJS(css, js) {
  let code = '';
  
  // Inject CSS via JavaScript (Convert.com requirement)
  if (css && css.trim()) {
    code += `
// Inject CSS via dynamic style tag
(function() {
  const style = document.createElement('style');
  style.setAttribute('data-convert-variation', 'true');
  style.textContent = \`${css.replace(/\`/g, '\\`').replace(/\$/g, '\\$')}\`;
  document.head.appendChild(style);
})();
`;
  }
  
  // Add JavaScript
  if (js && js.trim()) {
    code += '\n\n' + js;
  }
  
  return code;
}
```

### Method 3: Format Variations for Convert.com

```javascript
formatVariationsForConvert(variations) {
  return variations.map((variation, index) => {
    // Wrap CSS in JavaScript
    const combinedCode = this.wrapCSSInJS(variation.css, variation.js);
    
    return {
      name: variation.name || `Variation ${index + 1}`,
      weight: Math.floor(100 / (variations.length + 1)), // Equal distribution
      code: combinedCode
    };
  });
}
```

### Method 4: Create Experiment in Convert.com

```javascript
async createConvertExperiment(experimentData) {
  const { apiKey, projectId, name, description, variations, url } = experimentData;
  
  if (!apiKey) {
    throw new Error('Convert.com API key is required');
  }

  const logger = this.createOperationLogger('CreateExperiment');
  logger.log('Creating experiment in Convert.com', `name=${name}`);

  try {
    // Format variations
    const formattedVariations = this.formatVariationsForConvert(variations);
    
    // Create experiment via Convert.com API
    const response = await fetch('https://api.convert.com/v1/experiments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name,
        description: description || '',
        project_id: projectId,
        url_targeting: {
          include_url: url
        },
        variations: formattedVariations,
        status: 'draft'
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        throw new Error(`Convert.com API error: ${response.status} ${response.statusText}`);
      }
      throw new Error(`Convert.com API error: ${errorData.message || response.status}`);
    }

    const result = await response.json();
    logger.log('Experiment created successfully', `id=${result.id}`);

    return {
      success: true,
      experimentId: result.id,
      experimentUrl: `https://app.convert.com/experiments/${result.id}`,
      data: result,
      logs: logger.entries()
    };
  } catch (error) {
    logger.error('Failed to create experiment', error.message);
    throw error;
  }
}
```

### Method 5: Update handleMessage

**Find the `handleMessage` method and add this case in the switch statement:**

```javascript
case 'CREATE_CONVERT_EXPERIMENT':
  const experiment = await this.createConvertExperiment(message.data);
  sendResponse({ success: true, data: experiment });
  break;

case 'GET_CONVERT_API_KEYS':
  const keys = await this.getConvertAPIKeys();
  sendResponse({ success: true, keys });
  break;
```

---

## 🧪 Testing the Implementation

### Test 1: Check API Keys are Stored

Open DevTools console:
```javascript
chrome.storage.local.get(['convertApiKeys'], (result) => {
  console.log('Stored Convert API keys:', result.convertApiKeys);
});
```

### Test 2: Check CSS Wrapping Works

In service worker console:
```javascript
// Simulate the method
const css = 'button { background: red; }';
const js = 'console.log("test");';
console.log(serviceWorker.wrapCSSInJS(css, js));
```

Expected output:
```javascript
// Inject CSS via dynamic style tag
(function() {
  const style = document.createElement('style');
  style.setAttribute('data-convert-variation', 'true');
  style.textContent = `button { background: red; }`;
  document.head.appendChild(style);
})();

console.log("test");
```

### Test 3: Settings Page Opens

1. Right-click extension icon
2. Click "Options"
3. Should see settings page
4. Add a test API key
5. Verify it saves

---

## 📦 Optional: Sidepanel UI (For Visual Interface)

If you want a UI to create experiments, add to `sidepanel/sidepanel.html`:

**Before the closing `</div>` of main content:**

```html
<!-- Convert.com Integration -->
<div class="section" id="convertSection" style="display: none; margin-top: 24px; padding: 20px; background: #f0f9ff; border-radius: 8px; border: 2px solid #0ea5e9;">
  <h3 style="margin-bottom: 16px; color: #0c4a6e;">🚀 Create Experiment in Convert.com</h3>
  
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div>
      <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">API Key</label>
      <select id="convertApiKeySelect" class="input" style="width: 100%;">
        <option value="">-- Select API Key --</option>
      </select>
      <button 
        onclick="chrome.runtime.openOptionsPage()" 
        style="margin-top: 6px; padding: 4px 8px; font-size: 12px; background: none; border: none; color: #0ea5e9; cursor: pointer; text-decoration: underline;"
      >
        ⚙️ Manage API Keys
      </button>
    </div>
    
    <div>
      <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">Project ID</label>
      <input 
        type="text" 
        id="convertProjectId" 
        class="input" 
        placeholder="Enter Convert.com Project ID"
        style="width: 100%;"
      >
    </div>
    
    <div>
      <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">Experiment Name</label>
      <input 
        type="text" 
        id="convertExperimentName" 
        class="input" 
        placeholder="E.g., CTA Button Test"
        style="width: 100%;"
      >
    </div>
    
    <button 
      id="createConvertExperimentBtn" 
      class="btn btn-primary" 
      style="width: 100%; margin-top: 8px;"
    >
      Create Experiment in Convert.com
    </button>
    
    <div id="convertStatus"></div>
  </div>
</div>
```

And add to `sidepanel/sidepanel.js`:

**In the init() or initialization section:**

```javascript
// Load Convert API keys on startup
async loadConvertAPIKeys() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_CONVERT_API_KEYS' 
    });
    
    if (response.success && response.keys && response.keys.length > 0) {
      const select = document.getElementById('convertApiKeySelect');
      if (select) {
        select.innerHTML = '<option value="">-- Select API Key --</option>' +
          response.keys.map(key => 
            `<option value="${key.id}">${key.label}</option>`
          ).join('');
        
        // Show the Convert section
        const section = document.getElementById('convertSection');
        if (section) {
          section.style.display = 'block';
        }
      }
    }
  } catch (error) {
    console.error('Failed to load Convert API keys:', error);
  }
}

// Create experiment
async createConvertExperiment() {
  const apiKeyId = document.getElementById('convertApiKeySelect')?.value;
  const projectId = document.getElementById('convertProjectId')?.value?.trim();
  const experimentName = document.getElementById('convertExperimentName')?.value?.trim();
  
  if (!apiKeyId || !projectId || !experimentName) {
    alert('Please fill in all fields');
    return;
  }
  
  const btn = document.getElementById('createConvertExperimentBtn');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  
  try {
    // Get the selected API key
    const keysResponse = await chrome.runtime.sendMessage({ 
      type: 'GET_CONVERT_API_KEYS' 
    });
    const selectedKey = keysResponse.keys.find(k => k.id === apiKeyId);
    
    // Create experiment
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_CONVERT_EXPERIMENT',
      data: {
        apiKey: selectedKey.apiKey,
        projectId,
        name: experimentName,
        description: this.lastDescription || '',
        url: this.currentPageData?.url || window.location.href,
        variations: this.generatedCode?.variations || []
      }
    });
    
    if (response.success) {
      const status = document.getElementById('convertStatus');
      status.innerHTML = `<div style="padding: 12px; background: #d1fae5; color: #065f46; border-radius: 6px; margin-top: 12px;">
        ✅ Experiment created! <a href="${response.data.experimentUrl}" target="_blank" style="color: #059669; text-decoration: underline;">Open in Convert.com</a>
      </div>`;
    }
  } catch (error) {
    alert('Failed to create experiment: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Experiment in Convert.com';
  }
}

// Call in init
this.loadConvertAPIKeys();

// Add event listener
document.getElementById('createConvertExperimentBtn')?.addEventListener('click', () => {
  this.createConvertExperiment();
});
```

---

## ✅ Done!

After adding the code above:

1. ✅ Settings page works
2. ✅ API keys can be stored
3. ✅ Service worker can create experiments
4. ✅ (Optional) UI to create experiments

### What You Can Do Now:
- Store multiple Convert.com API keys
- Generate experiment code
- Push to Convert.com via API
- All CSS injected via JavaScript (Convert requirement)

### To Test End-to-End:
1. Add Convert.com API key in settings
2. Generate code for a page
3. (If UI added) Fill in Project ID and name
4. Click "Create Experiment"
5. Check Convert.com dashboard!

---

**Need help?** Check CONVERT_INTEGRATION_GUIDE.md for detailed explanations.

**Ready for advanced features?** See QUICKSTART.md for next steps (interactive testing, per-variation editing, AI feedback loop).
