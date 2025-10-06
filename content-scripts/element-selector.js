// Element Selector for precise targeting
// Allows users to click any element on the page to isolate it

class ElementSelector {
  constructor() {
    this.active = false;
    this.selectedElement = null;
    this.overlay = null;
    this.highlightBox = null;
    this.infoBox = null;
    this.onSelect = null;
  }

  activate(callback) {
    if (this.active) return;
    
    this.active = true;
    this.onSelect = callback;
    this.createOverlay();
    this.attachEventListeners();
    
    // Disable page interactions
    document.body.style.pointerEvents = 'none';
    this.overlay.style.pointerEvents = 'auto';
  }

  deactivate() {
    if (!this.active) return;
    
    this.active = false;
    this.removeOverlay();
    this.removeEventListeners();
    
    // Re-enable page interactions
    document.body.style.pointerEvents = '';
  }

  createOverlay() {
    // Create semi-transparent overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'convert-element-selector-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999999;
      cursor: crosshair;
    `;

    // Create highlight box
    this.highlightBox = document.createElement('div');
    this.highlightBox.id = 'convert-highlight-box';
    this.highlightBox.style.cssText = `
      position: absolute;
      border: 3px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 1000000;
      box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.3);
      transition: all 0.15s ease;
    `;

    // Create info box
    this.infoBox = document.createElement('div');
    this.infoBox.id = 'convert-info-box';
    this.infoBox.style.cssText = `
      position: absolute;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      pointer-events: none;
      z-index: 1000001;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      line-height: 1.4;
    `;

    // Create instruction banner
    const banner = document.createElement('div');
    banner.id = 'convert-selector-banner';
    banner.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      z-index: 1000002;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 16px;
    `;
    banner.innerHTML = `
      <span>🎯 <strong>Element Selection Mode</strong> - Click any element to select it</span>
      <button id="convert-cancel-selection" style="
        background: #ef4444;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">Cancel (Esc)</button>
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.infoBox);
    document.body.appendChild(banner);

    // Cancel button
    document.getElementById('convert-cancel-selection').addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
  }

  removeOverlay() {
    const elements = [
      'convert-element-selector-overlay',
      'convert-highlight-box',
      'convert-info-box',
      'convert-selector-banner'
    ];

    elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    this.overlay = null;
    this.highlightBox = null;
    this.infoBox = null;
  }

  attachEventListeners() {
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleClick = this.onClick.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);

    this.overlay.addEventListener('mousemove', this.handleMouseMove);
    this.overlay.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  removeEventListeners() {
    if (this.overlay) {
      this.overlay.removeEventListener('mousemove', this.handleMouseMove);
      this.overlay.removeEventListener('click', this.handleClick);
    }
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  onMouseMove(e) {
    const element = this.getElementFromPoint(e.clientX, e.clientY);
    if (!element || element === document.body || element === document.documentElement) {
      this.hideHighlight();
      return;
    }

    this.highlightElement(element);
  }

  onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const element = this.getElementFromPoint(e.clientX, e.clientY);
    if (!element || element === document.body || element === document.documentElement) {
      return;
    }

    this.selectElement(element);
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    }
  }

  getElementFromPoint(x, y) {
    // Temporarily hide overlay to get element underneath
    this.overlay.style.display = 'none';
    this.highlightBox.style.display = 'none';
    
    const element = document.elementFromPoint(x, y);
    
    this.overlay.style.display = 'block';
    this.highlightBox.style.display = 'block';
    
    return element;
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    
    this.highlightBox.style.top = `${rect.top + window.scrollY}px`;
    this.highlightBox.style.left = `${rect.left + window.scrollX}px`;
    this.highlightBox.style.width = `${rect.width}px`;
    this.highlightBox.style.height = `${rect.height}px`;
    this.highlightBox.style.display = 'block';

    // Update info box
    const selector = this.generateSelector(element);
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className ? `.${[...element.classList].join('.')}` : '';
    
    this.infoBox.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">&lt;${tag}${id}${classes}&gt;</div>
      <div style="font-size: 11px; color: #9ca3af;">Selector: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 2px;">${selector}</code></div>
      <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${rect.width.toFixed(0)} × ${rect.height.toFixed(0)}px</div>
    `;

    // Position info box above or below element
    const infoBoxHeight = 80; // Approximate
    let top = rect.top + window.scrollY - infoBoxHeight - 10;
    
    if (top < window.scrollY + 80) {
      // Position below if not enough space above
      top = rect.bottom + window.scrollY + 10;
    }

    this.infoBox.style.top = `${top}px`;
    this.infoBox.style.left = `${rect.left + window.scrollX}px`;
    this.infoBox.style.display = 'block';
  }

  hideHighlight() {
    if (this.highlightBox) {
      this.highlightBox.style.display = 'none';
    }
    if (this.infoBox) {
      this.infoBox.style.display = 'none';
    }
  }

  async selectElement(element) {
    this.selectedElement = element;
    
    // Capture element data
    const elementData = await this.captureElementData(element);
    
    // Deactivate selector
    this.deactivate();
    
    // Send to extension
    if (this.onSelect) {
      this.onSelect(elementData);
    }

    // Send message to background
    chrome.runtime.sendMessage({
      type: 'ELEMENT_SELECTED',
      data: elementData
    });
  }

  cancel() {
    this.deactivate();
    
    chrome.runtime.sendMessage({
      type: 'ELEMENT_SELECTION_CANCELLED'
    });
  }

  async captureElementData(element) {
    const rect = element.getBoundingClientRect();
    const selector = this.generateSelector(element);
    const computedStyle = window.getComputedStyle(element);
    
    // Get key styles
    const styles = {
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontFamily: computedStyle.fontFamily,
      padding: computedStyle.padding,
      margin: computedStyle.margin,
      border: computedStyle.border,
      borderRadius: computedStyle.borderRadius,
      width: computedStyle.width,
      height: computedStyle.height,
      display: computedStyle.display,
      position: computedStyle.position
    };

    // Capture element screenshot
    const screenshot = await this.captureElementScreenshot(element);

    // Get context (parent and siblings)
    const context = {
      parent: {
        tag: element.parentElement?.tagName.toLowerCase(),
        selector: element.parentElement ? this.generateSelector(element.parentElement) : null,
        html: element.parentElement?.outerHTML.substring(0, 500)
      },
      siblings: Array.from(element.parentElement?.children || [])
        .filter(el => el !== element)
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          selector: this.generateSelector(el)
        }))
    };

    return {
      selector,
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: element.className ? Array.from(element.classList) : [],
      html: element.outerHTML,
      innerHTML: element.innerHTML,
      textContent: element.textContent?.trim().substring(0, 200),
      dimensions: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      },
      styles,
      screenshot,
      context,
      xpath: this.getXPath(element)
    };
  }

  async captureElementScreenshot(element) {
    try {
      // Scroll element into view
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      
      // Wait a moment for scroll
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use Chrome's capture API
      const screenshot = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_ELEMENT_SCREENSHOT',
          rect: element.getBoundingClientRect()
        }, resolve);
      });
      
      return screenshot;
    } catch (error) {
      console.warn('Element screenshot failed:', error);
      return null;
    }
  }

  generateSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Build path from classes
    const classes = element.className ? 
      Array.from(element.classList)
        .filter(c => c && !c.startsWith('convert-'))
        .slice(0, 2)
        .join('.') : '';
    
    const tag = element.tagName.toLowerCase();
    let selector = tag + (classes ? `.${classes}` : '');

    // Add nth-child if needed for uniqueness
    if (document.querySelectorAll(selector).length > 1) {
      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    return selector;
  }

  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    if (element === document.body) {
      return '/html/body';
    }

    let path = '';
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.nodeName.toLowerCase();
      const pathIndex = index > 0 ? `[${index + 1}]` : '';
      path = `/${tagName}${pathIndex}${path}`;

      current = current.parentNode;
    }

    return path;
  }
}

// Initialize when content script loads
let elementSelector = null;

// Listen for messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_ELEMENT_SELECTION') {
    if (!elementSelector) {
      elementSelector = new ElementSelector();
    }
    
    elementSelector.activate((elementData) => {
      sendResponse({ success: true, data: elementData });
    });
    
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'STOP_ELEMENT_SELECTION') {
    if (elementSelector) {
      elementSelector.deactivate();
    }
    sendResponse({ success: true });
  }
});

console.log('✅ Element selector loaded');
