/**
 * Convert.com Experiment Cleanup Manager
 *
 * Singleton that runs in MAIN world (page context) to track and cleanup
 * all dynamically created elements, intervals, and modifications.
 *
 * This solves the context boundary issue where content scripts can't access
 * page context variables/intervals.
 */

(function() {
  'use strict';

  // Prevent re-initialization
  if (window.ConvertCleanupManager) {
    console.log('[Cleanup Manager] Already initialized, skipping');
    return;
  }

  window.ConvertCleanupManager = {
    // Tracking arrays
    intervals: [],
    timeouts: [],
    elements: [],
    styleSheets: [],
    modifiedElements: new Map(), // element => original values

    // Metadata for debugging
    metadata: {
      initialized: new Date().toISOString(),
      resetCount: 0,
      lastReset: null
    },

    /**
     * Register an interval for cleanup
     */
    registerInterval(intervalId, description = '') {
      this.intervals.push({ id: intervalId, description, created: Date.now() });
      console.log(`[Cleanup Manager] Registered interval ${intervalId}${description ? ': ' + description : ''} (total: ${this.intervals.length})`);
      return intervalId;
    },

    /**
     * Register a timeout for cleanup
     */
    registerTimeout(timeoutId, description = '') {
      this.timeouts.push({ id: timeoutId, description, created: Date.now() });
      console.log(`[Cleanup Manager] Registered timeout ${timeoutId}${description ? ': ' + description : ''}`);
      return timeoutId;
    },

    /**
     * Register a DOM element for cleanup
     */
    registerElement(element, description = '') {
      if (!element || !element.nodeType) {
        console.warn('[Cleanup Manager] Attempted to register invalid element:', element);
        return null;
      }

      // Add tracking attribute
      element.setAttribute('data-convert-tracked', Date.now());

      this.elements.push({
        element,
        description,
        created: Date.now(),
        selector: this._generateSelector(element)
      });

      console.log(`[Cleanup Manager] Registered element ${this._generateSelector(element)}${description ? ': ' + description : ''} (total: ${this.elements.length})`);
      return element;
    },

    /**
     * Register a style sheet for cleanup
     */
    registerStyleSheet(styleElement, description = '') {
      if (!styleElement || styleElement.tagName !== 'STYLE') {
        console.warn('[Cleanup Manager] Attempted to register non-style element');
        return null;
      }

      this.styleSheets.push({ element: styleElement, description, created: Date.now() });
      console.log(`[Cleanup Manager] Registered stylesheet${description ? ': ' + description : ''} (total: ${this.styleSheets.length})`);
      return styleElement;
    },

    /**
     * Track element modification for restoration
     */
    trackModification(element, property, originalValue) {
      if (!this.modifiedElements.has(element)) {
        this.modifiedElements.set(element, {});
      }
      const modifications = this.modifiedElements.get(element);
      if (!(property in modifications)) {
        modifications[property] = originalValue;
        console.log(`[Cleanup Manager] Tracked modification on ${this._generateSelector(element)}.${property}`);
      }
    },

    /**
     * Reset ALL tracked items atomically
     */
    resetAll() {
      console.log('[Cleanup Manager] 🧹 Starting atomic reset...');
      const startTime = Date.now();

      const summary = {
        intervals: this.intervals.length,
        timeouts: this.timeouts.length,
        elements: this.elements.length,
        styleSheets: this.styleSheets.length,
        modifications: this.modifiedElements.size,
        flags: 0
      };

      // 1. Clear all intervals
      this.intervals.forEach(({ id, description }) => {
        try {
          clearInterval(id);
          console.log(`[Cleanup Manager]   ✓ Cleared interval ${id}${description ? ': ' + description : ''}`);
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to clear interval ${id}:`, e);
        }
      });
      this.intervals = [];

      // 2. Clear all timeouts
      this.timeouts.forEach(({ id, description }) => {
        try {
          clearTimeout(id);
          console.log(`[Cleanup Manager]   ✓ Cleared timeout ${id}${description ? ': ' + description : ''}`);
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to clear timeout ${id}:`, e);
        }
      });
      this.timeouts = [];

      // 3. Remove all tracked elements
      this.elements.forEach(({ element, description }) => {
        try {
          if (element && element.parentNode) {
            element.remove();
            console.log(`[Cleanup Manager]   ✓ Removed element ${this._generateSelector(element)}${description ? ': ' + description : ''}`);
          }
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to remove element:`, e);
        }
      });
      this.elements = [];

      // 4. Remove all style sheets
      this.styleSheets.forEach(({ element, description }) => {
        try {
          if (element && element.parentNode) {
            element.remove();
            console.log(`[Cleanup Manager]   ✓ Removed stylesheet${description ? ': ' + description : ''}`);
          }
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to remove stylesheet:`, e);
        }
      });
      this.styleSheets = [];

      // 5. Restore modified elements
      this.modifiedElements.forEach((modifications, element) => {
        try {
          Object.entries(modifications).forEach(([property, value]) => {
            if (property.startsWith('style.')) {
              const styleProp = property.substring(6);
              element.style[styleProp] = value;
            } else if (property === 'textContent') {
              element.textContent = value;
            } else if (property === 'innerHTML') {
              element.innerHTML = value;
            }
          });
          console.log(`[Cleanup Manager]   ✓ Restored ${Object.keys(modifications).length} properties on element`);
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to restore element:`, e);
        }
      });
      this.modifiedElements.clear();

      // 6. Reset all data-var-applied flags (idempotency checks from generated code)
      const flaggedElements = document.querySelectorAll('[data-var-applied]');
      flaggedElements.forEach(el => {
        delete el.dataset.varApplied;
      });
      summary.flags = flaggedElements.length;
      console.log(`[Cleanup Manager]   ✓ Reset ${flaggedElements.length} data-var-applied flags`);

      // 7. Remove any orphaned tracked elements by attribute
      const trackedElements = document.querySelectorAll('[data-convert-tracked]');
      trackedElements.forEach(el => {
        try {
          el.remove();
          console.log(`[Cleanup Manager]   ✓ Removed orphaned tracked element`);
        } catch (e) {
          console.warn(`[Cleanup Manager]   ✗ Failed to remove orphaned element:`, e);
        }
      });

      // Update metadata
      this.metadata.resetCount++;
      this.metadata.lastReset = new Date().toISOString();

      const duration = Date.now() - startTime;
      console.log(`[Cleanup Manager] ✅ Reset complete in ${duration}ms:`, summary);

      return summary;
    },

    /**
     * Get current state for debugging
     */
    getState() {
      return {
        intervals: this.intervals.length,
        timeouts: this.timeouts.length,
        elements: this.elements.length,
        styleSheets: this.styleSheets.length,
        modifications: this.modifiedElements.size,
        metadata: this.metadata
      };
    },

    /**
     * Helper to generate a readable selector for debugging
     */
    _generateSelector(element) {
      if (!element) return 'null';

      let selector = element.tagName.toLowerCase();
      if (element.id) {
        selector += `#${element.id}`;
      } else if (element.className) {
        const classes = element.className.split(' ').filter(c => c).slice(0, 2);
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`;
        }
      }
      return selector;
    }
  };

  console.log('[Cleanup Manager] ✅ Initialized successfully');
  console.log('[Cleanup Manager] Version: 1.0.0');
  console.log('[Cleanup Manager] Use window.ConvertCleanupManager.resetAll() to clear all tracked items');
})();
