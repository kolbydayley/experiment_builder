/**
 * Accessibility Tree Extractor
 *
 * Extracts and processes the browser's accessibility tree to provide a semantic,
 * filtered view of interactive elements on the page.
 *
 * Based on research from:
 * - Chrome DevTools Protocol Accessibility API
 * - Playwright MCP accessibility-first approach
 * - Stagehand's hybrid DOM + a11y tree structure
 */

class AccessibilityTreeExtractor {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds
  }

  /**
   * Extract accessibility tree from a tab
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<Array>} Filtered accessibility tree nodes
   */
  async extractAccessibilityTree(tabId) {
    console.log(`🌳 [A11yTree] Extracting accessibility tree for tab ${tabId}...`);

    // Check cache
    const cacheKey = `tab_${tabId}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`✅ [A11yTree] Using cached tree (${cached.nodes.length} nodes)`);
        return cached.nodes;
      }
    }

    try {
      // Attach debugger to access Chrome DevTools Protocol
      await chrome.debugger.attach({ tabId }, '1.3');
      console.log(`🔌 [A11yTree] Debugger attached to tab ${tabId}`);

      // Enable Accessibility domain
      await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');

      // Get full accessibility tree
      const response = await chrome.debugger.sendCommand({ tabId }, 'Accessibility.getFullAXTree');
      console.log(`📊 [A11yTree] Raw tree retrieved: ${response.nodes.length} nodes`);

      // Process and filter tree
      const processedNodes = await this.processTree(response.nodes, tabId);

      // Detach debugger
      await chrome.debugger.detach({ tabId });
      console.log(`🔌 [A11yTree] Debugger detached from tab ${tabId}`);

      // Cache result
      this.cache.set(cacheKey, {
        nodes: processedNodes,
        timestamp: Date.now()
      });

      console.log(`✅ [A11yTree] Extracted ${processedNodes.length} interactive elements`);
      return processedNodes;

    } catch (error) {
      console.error(`❌ [A11yTree] Error extracting tree:`, error);

      // Try to detach debugger even if error occurred
      try {
        await chrome.debugger.detach({ tabId });
      } catch (e) {
        // Ignore detach errors
      }

      // Fallback: return empty array
      return [];
    }
  }

  /**
   * Process raw accessibility tree nodes
   * @param {Array} nodes - Raw AX tree nodes from CDP
   * @param {number} tabId - Chrome tab ID for querying DOM
   * @returns {Promise<Array>} Processed and filtered nodes
   */
  async processTree(nodes, tabId) {
    // Interactive roles we care about
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'combobox', 'listbox', 'menuitem',
      'tab', 'checkbox', 'radio', 'switch', 'slider', 'searchbox',
      'img', 'heading', 'navigation', 'main', 'form', 'article',
      'banner', 'region', 'complementary', 'contentinfo'
    ]);

    const processedNodes = [];

    for (const node of nodes) {
      // Skip nodes without role
      if (!node.role || !node.role.value) continue;

      const role = node.role.value.toLowerCase();

      // Filter to interactive or landmark elements
      if (!interactiveRoles.has(role)) continue;

      // Extract properties
      const processed = {
        nodeId: node.nodeId,
        backendDOMNodeId: node.backendDOMNodeId,
        role: role,
        name: node.name?.value || '',
        description: node.description?.value || '',
        value: node.value?.value || '',

        // Properties
        properties: {
          focused: node.focused || false,
          disabled: node.disabled || false,
          hidden: node.hidden || false,
          pressed: node.pressed?.value,
          checked: node.checked?.value,
          expanded: node.expanded?.value,
          selected: node.selected?.value
        },

        // Layout
        boundingRect: node.chromeRole?.value === 'InlineTextBox' ? null : {
          x: node.bounds?.x || 0,
          y: node.bounds?.y || 0,
          width: node.bounds?.width || 0,
          height: node.bounds?.height || 0
        },

        // Hierarchy
        childIds: node.childIds || [],
        parentId: node.parentId || null,

        // Will be populated with DOM selector
        selector: null,
        elementSnapshot: null
      };

      // Skip invisible or zero-sized elements
      if (processed.properties.hidden) continue;
      if (processed.boundingRect &&
          (processed.boundingRect.width === 0 || processed.boundingRect.height === 0)) {
        continue;
      }

      processedNodes.push(processed);
    }

    // Map accessibility nodes back to DOM selectors (in parallel via content script)
    await this.mapToDOM(processedNodes, tabId);

    return processedNodes.filter(node => node.selector !== null);
  }

  /**
   * Map accessibility nodes to DOM selectors using Chrome DevTools Protocol
   * @param {Array} nodes - Processed accessibility nodes
   * @param {number} tabId - Chrome tab ID
   */
  async mapToDOM(nodes, tabId) {
    try {
      // Enable DOM domain
      await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');

      // Resolve each backend node ID to get selector
      for (const node of nodes) {
        if (!node.backendDOMNodeId) continue;

        try {
          // Resolve node to get nodeId
          const resolved = await chrome.debugger.sendCommand({ tabId }, 'DOM.resolveNode', {
            backendNodeId: node.backendDOMNodeId
          });

          if (resolved && resolved.object && resolved.object.objectId) {
            // Get computed selector using Runtime.callFunctionOn
            const selectorResult = await chrome.debugger.sendCommand({ tabId }, 'Runtime.callFunctionOn', {
              objectId: resolved.object.objectId,
              functionDeclaration: `function() {
                function generateSelector(el) {
                  if (el.id) return '#' + CSS.escape(el.id);
                  if (el.className && typeof el.className === 'string') {
                    const classes = el.className.trim().split(/\\s+/);
                    if (classes.length > 0) {
                      return el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
                    }
                  }
                  return el.tagName.toLowerCase();
                }
                return {
                  selector: generateSelector(this),
                  tag: this.tagName ? this.tagName.toLowerCase() : '',
                  id: this.id || null,
                  classes: this.className ? Array.from(this.classList) : [],
                  text: this.textContent ? this.textContent.substring(0, 100) : ''
                };
              }`,
              returnByValue: true
            });

            if (selectorResult && selectorResult.result && selectorResult.result.value) {
              const data = selectorResult.result.value;
              node.selector = data.selector;
              node.elementSnapshot = {
                tag: data.tag,
                id: data.id,
                classes: data.classes,
                text: data.text
              };
            }
          }
        } catch (nodeError) {
          console.warn(`⚠️ [A11yTree] Could not resolve node ${node.backendDOMNodeId}:`, nodeError);
        }
      }

      console.log(`✅ [A11yTree] Mapped ${nodes.filter(n => n.selector).length}/${nodes.length} nodes to selectors`);

    } catch (error) {
      console.warn(`⚠️ [A11yTree] Could not map to DOM selectors:`, error);
    }
  }

  /**
   * Find element by role and name
   * @param {Array} tree - Processed accessibility tree
   * @param {string} role - Element role
   * @param {string} name - Element accessible name (partial match)
   * @returns {Array} Matching nodes
   */
  findByRoleAndName(tree, role, name) {
    const nameLC = name.toLowerCase();
    return tree.filter(node =>
      node.role === role.toLowerCase() &&
      node.name.toLowerCase().includes(nameLC)
    );
  }

  /**
   * Find elements by role
   * @param {Array} tree - Processed accessibility tree
   * @param {string} role - Element role
   * @returns {Array} Matching nodes
   */
  findByRole(tree, role) {
    return tree.filter(node => node.role === role.toLowerCase());
  }

  /**
   * Clear cache (call when page changes)
   * @param {number} tabId - Optional tab ID to clear specific cache
   */
  clearCache(tabId = null) {
    if (tabId) {
      this.cache.delete(`tab_${tabId}`);
      console.log(`🧹 [A11yTree] Cleared cache for tab ${tabId}`);
    } else {
      this.cache.clear();
      console.log(`🧹 [A11yTree] Cleared all cache`);
    }
  }
}

// Export singleton instance
if (typeof window !== 'undefined') {
  window.AccessibilityTreeExtractor = AccessibilityTreeExtractor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccessibilityTreeExtractor;
}
