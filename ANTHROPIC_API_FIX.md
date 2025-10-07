# Anthropic API "Failed to fetch" Error - Troubleshooting Guide

## Error Analysis
```
🚨 Error: "Failed to fetch" when calling Anthropic Claude API
🔍 Location: service-worker.js:985 (callClaude function)
📊 Context: Code generation request with hierarchical context system
```

## Root Cause & Fix Applied

### ✅ **Fix 1: Missing API Permissions**
**Problem:** Extension manifest was missing `https://api.anthropic.com/*` host permission

**Solution Applied:**
```json
// Updated manifest.json
"host_permissions": [
  "<all_urls>",
  "https://api.openai.com/*", 
  "https://chat.openai.com/*",
  "https://api.anthropic.com/*", // ← ADDED
  "https://api.convert.com/*"
]
```

### ✅ **Fix 2: Enhanced Error Diagnostics**
**Added comprehensive error handling:**

```javascript
// Enhanced network error detection
try {
  response = await fetch('https://api.anthropic.com/v1/messages', { ... });
} catch (fetchError) {
  if (fetchError.message.includes('Failed to fetch')) {
    throw new Error('Network error: Unable to connect to Anthropic API. Please check:\n' +
                   '1. Your internet connection\n' +
                   '2. Extension permissions (reload extension if needed)\n' +
                   '3. API key is valid in settings\n' +
                   '4. No firewall blocking api.anthropic.com');
  }
}
```

### ✅ **Fix 3: API Key Validation**
**Added upfront validation:**

```javascript
// Enhanced API key validation
if (!apiKey.startsWith('sk-ant-')) {
  throw new Error('Invalid Anthropic API key format. Keys should start with "sk-ant-"');
}

if (apiKey.length < 40) {
  throw new Error('Anthropic API key appears too short. Please check your key in settings.');
}
```

## Required Actions for User

### 🔄 **Step 1: Reload Extension**
**CRITICAL:** After manifest changes, the extension must be reloaded:

1. Open `chrome://extensions/`
2. Find "Convert.com Experiment Builder"  
3. Click the **reload button** (↻ icon)
4. Verify permissions are updated

### 🔑 **Step 2: Verify API Key**
Check your Anthropic API key in extension settings:

**Valid format:**
- ✅ Starts with: `sk-ant-`
- ✅ Length: ~60-80 characters
- ✅ Example: `sk-ant-api03-abc123...xyz789`

**Invalid formats:**
- ❌ OpenAI key: `sk-proj-...` 
- ❌ Short/incomplete key
- ❌ Missing `sk-ant-` prefix

### 🌐 **Step 3: Network Check**
Verify network connectivity:

```bash
# Test 1: Basic connectivity
ping api.anthropic.com

# Test 2: HTTPS access (should return 401 without API key)
curl -i https://api.anthropic.com/v1/messages
```

Expected response: `HTTP/2 401` (unauthorized - means API is reachable)

### 🛡️ **Step 4: Firewall/Security Check**
Common blockers:
- Corporate firewalls blocking `api.anthropic.com`
- VPN/proxy interference
- Browser extensions (ad blockers, security tools)
- Antivirus software blocking API calls

## Debugging Steps

### 📊 **Check Console Logs**
After reloading extension, look for these new diagnostic logs:

```javascript
// Expected successful flow:
🌐 Making API request to Anthropic... {model: "claude-3-5-sonnet-20240620", hasApiKey: true}
📡 API Response received: {status: 200, ok: true}
```

### 🔍 **If Still Failing:**

1. **Open DevTools** in sidebar:
   - Right-click extension sidebar → "Inspect"
   - Check Console tab for detailed error messages

2. **Test Settings Page:**
   - Go to extension settings
   - Test API connection there first
   - Verify key is saved correctly

3. **Check Network Tab:**
   - Look for failed requests to `api.anthropic.com`
   - Check if request is being blocked/cancelled

## Alternative Workarounds

### 🔄 **Option 1: Use OpenAI Instead**
If Anthropic continues failing:
1. Switch provider to "OpenAI" in settings
2. Use GPT-4o model for similar quality
3. This bypasses Anthropic network issues

### 🔧 **Option 2: API Proxy**
For corporate environments:
```javascript
// If needed, we can modify the endpoint to use a proxy
const apiUrl = settings.proxyUrl || 'https://api.anthropic.com/v1/messages';
```

## Expected Resolution

After applying these fixes and reloading the extension:

✅ **Before (Error):**
```
❌ service-worker.js:985 TypeError: Failed to fetch
```

✅ **After (Success):**
```
🌐 Making API request to Anthropic...
📡 API Response received: {status: 200, ok: true}  
🔮 Claude response: {tokens: 1234, content: "..."}
```

## Files Modified

1. **`manifest.json`** - Added Anthropic API host permissions
2. **`background/service-worker.js`** - Enhanced error handling and validation

## Testing Checklist

- [ ] Extension reloaded after manifest changes
- [ ] Valid Anthropic API key in settings (starts with `sk-ant-`)
- [ ] Network connectivity to `api.anthropic.com` verified  
- [ ] No firewall/proxy blocking API calls
- [ ] Console shows successful API request logs
- [ ] Code generation completes without "Failed to fetch" error

---

## Summary

The "Failed to fetch" error was caused by missing host permissions for `api.anthropic.com` in the extension manifest. After adding the permission and reloading the extension, the API should work correctly with enhanced error reporting for any future issues.