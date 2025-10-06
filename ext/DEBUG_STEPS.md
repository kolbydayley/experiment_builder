# Chrome Extension Debug Instructions

## Step 2: Check Background Service Worker

1. **Go to Extensions Page**: `chrome://extensions/`
2. **Find the extension** and click "Details"
3. **Look for "Inspect views"** section
4. **Click "service worker"** link (this opens DevTools for the background script)

### In the Service Worker DevTools Console:
- Look for any error messages (red text)
- Check if you see the initialization message: "Convert.com Experiment Builder installed"
- Try typing: `chrome.runtime.getManifest()` and press Enter

### Copy and paste ALL console output here

## Step 3: Test Extension Icon Click

1. **Right-click the extension icon** in the Chrome toolbar
2. **Look for these options**:
   - "Open Convert.com Experiment Builder"
   - Any other menu options
3. **Try left-clicking the icon** 
4. **Try right-clicking and selecting any available options**

### What happens when you click? (Describe exactly what you see or don't see)

## Step 4: Check Side Panel Permissions

1. **Go to any website** (like google.com)
2. **Try clicking the extension icon**
3. **Check if a side panel opens on the right side**
4. **Look in the right sidebar area of the browser window**

### Does anything appear on the right side of the browser?

## Step 5: Manual Side Panel Test

If the icon isn't working, try this manual approach:
1. **Right-click in empty space** on any webpage
2. **Look for extension-related context menu items**
3. **Check browser menu**: Chrome Menu → More Tools → Extensions
4. **Try keyboard shortcut**: Ctrl+Shift+X (or Cmd+Shift+X on Mac)

Please complete Steps 2-5 and share all console output and observations with me.