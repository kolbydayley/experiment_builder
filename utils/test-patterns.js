/**
 * Test Patterns Library
 * Reusable patterns for AI-generated test scripts
 *
 * These utilities run in MAIN world (page context) and provide
 * common testing operations like clicks, hovers, scroll, etc.
 */

// Note: This file is NOT loaded as a module - it's injected as a string
// into the page context. All functions must be self-contained.

const TestPatterns = {
  /**
   * Wait for element to exist in DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<Element>} - Resolves with element or rejects
   */
  async waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[Test] ✓ Found element: ${selector}`);
        return element;
      }
      await this.wait(100);
    }
    throw new Error(`Element not found after ${timeout}ms: ${selector}`);
  },

  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Simulate click on element
   * @param {string|Element} target - Selector or element
   * @returns {Promise<boolean>} - Success status
   */
  async simulateClick(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;

      element.click();
      console.log(`[Test] ✓ Clicked: ${typeof target === 'string' ? target : element.tagName}`);
      await this.wait(300); // Wait for any animations
      return true;
    } catch (error) {
      console.error(`[Test] ✗ Click failed:`, error);
      return false;
    }
  },

  /**
   * Simulate hover effect
   * @param {string|Element} target - Selector or element
   * @returns {Promise<boolean>} - Success status
   */
  async simulateHover(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;

      element.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      console.log(`[Test] ✓ Hovered: ${typeof target === 'string' ? target : element.tagName}`);
      await this.wait(200); // Wait for hover effect
      return true;
    } catch (error) {
      console.error(`[Test] ✗ Hover failed:`, error);
      return false;
    }
  },

  /**
   * Simulate exit intent (mouse leaving viewport)
   * @returns {Promise<boolean>} - Success status
   */
  async simulateExitIntent() {
    try {
      document.dispatchEvent(new MouseEvent('mouseout', {
        bubbles: true,
        cancelable: true,
        clientY: -10, // Mouse above viewport
        relatedTarget: null
      }));
      console.log('[Test] ✓ Exit intent triggered');
      await this.wait(500); // Wait for modal/popup
      return true;
    } catch (error) {
      console.error('[Test] ✗ Exit intent failed:', error);
      return false;
    }
  },

  /**
   * Scroll to specific position
   * @param {number} yPosition - Vertical scroll position
   * @returns {Promise<boolean>} - Success status
   */
  async scrollTo(yPosition) {
    try {
      window.scrollTo({ top: yPosition, behavior: 'smooth' });
      console.log(`[Test] ✓ Scrolled to: ${yPosition}px`);
      await this.wait(500); // Wait for scroll-triggered events
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll failed:', error);
      return false;
    }
  },

  /**
   * Scroll to specific element
   * @param {string|Element} target - Selector or element
   * @returns {Promise<boolean>} - Success status
   */
  async scrollToElement(target) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log(`[Test] ✓ Scrolled to element: ${typeof target === 'string' ? target : element.tagName}`);
      await this.wait(500);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Scroll to element failed:', error);
      return false;
    }
  },

  /**
   * Fill form input
   * @param {string|Element} target - Selector or element
   * @param {string} value - Value to fill
   * @returns {Promise<boolean>} - Success status
   */
  async fillInput(target, value) {
    try {
      const element = typeof target === 'string'
        ? await this.waitForElement(target, 3000)
        : target;

      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Test] ✓ Filled input: ${typeof target === 'string' ? target : element.tagName}`);
      return true;
    } catch (error) {
      console.error('[Test] ✗ Fill input failed:', error);
      return false;
    }
  },

  /**
   * Check if element is visible
   * @param {string|Element} target - Selector or element
   * @returns {boolean} - Visibility status
   */
  isVisible(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (!element) return false;

      const style = window.getComputedStyle(element);
      const isHidden = style.display === 'none' ||
                      style.visibility === 'hidden' ||
                      style.opacity === '0';

      return !isHidden && element.offsetParent !== null;
    } catch (error) {
      return false;
    }
  },

  /**
   * Check if element exists in DOM
   * @param {string} selector - CSS selector
   * @returns {boolean} - Existence status
   */
  exists(selector) {
    return !!document.querySelector(selector);
  },

  /**
   * Get computed style property
   * @param {string|Element} target - Selector or element
   * @param {string} property - CSS property name
   * @returns {string|null} - Property value or null
   */
  getStyle(target, property) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (!element) return null;
      return window.getComputedStyle(element)[property];
    } catch (error) {
      return null;
    }
  },

  /**
   * Check sessionStorage value
   * @param {string} key - Storage key
   * @returns {string|null} - Storage value or null
   */
  getSessionStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ SessionStorage access failed:', error);
      return null;
    }
  },

  /**
   * Check localStorage value
   * @param {string} key - Storage key
   * @returns {string|null} - Storage value or null
   */
  getLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('[Test] ✗ LocalStorage access failed:', error);
      return null;
    }
  },

  /**
   * Count elements matching selector
   * @param {string} selector - CSS selector
   * @returns {number} - Element count
   */
  countElements(selector) {
    return document.querySelectorAll(selector).length;
  },

  /**
   * Get element text content
   * @param {string|Element} target - Selector or element
   * @returns {string|null} - Text content or null
   */
  getText(target) {
    try {
      const element = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      return element ? element.textContent.trim() : null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Capture current DOM state snapshot
   * @param {string} label - Label for this state
   * @returns {Object} - State snapshot
   */
  captureState(label = 'unnamed') {
    return {
      label,
      timestamp: Date.now(),
      url: window.location.href,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  },

  /**
   * Run validation and return structured result
   * @param {string} testName - Name of the test
   * @param {boolean|Function} condition - Test condition
   * @param {string} expectedValue - Expected value description
   * @param {string} actualValue - Actual value description
   * @returns {Object} - Test result
   */
  async validate(testName, condition, expectedValue = '', actualValue = '') {
    const passed = typeof condition === 'function' ? await condition() : condition;

    const result = {
      test: testName,
      passed,
      expected: expectedValue,
      actual: actualValue,
      timestamp: Date.now()
    };

    console.log(`[Test] ${passed ? '✓' : '✗'} ${testName}`);
    if (!passed && expectedValue && actualValue) {
      console.log(`  Expected: ${expectedValue}, Actual: ${actualValue}`);
    }

    return result;
  }
};

// Export for use in test scripts
if (typeof window !== 'undefined') {
  window.TestPatterns = TestPatterns;
}
