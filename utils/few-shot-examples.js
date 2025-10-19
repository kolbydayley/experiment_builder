/**
 * Few-Shot Examples Library
 *
 * Purpose: Teach AI by showing complete, perfect examples rather than just rules.
 * Research shows AI learns better from demonstrations than instructions.
 *
 * Each example shows:
 * 1. User request (what they asked for)
 * 2. Element database (available elements)
 * 3. Complete correct response with analysis object
 */

class FewShotExamples {
  constructor() {
    this.examples = {
      // Example 1: Text + Color (Most Common Pattern)
      textAndColor: {
        userRequest: "Change the button text to 'Click Me' and make it red",
        elementDatabase: [
          {
            selector: "button.cta-primary",
            text: "Get Started",
            tag: "button",
            visual: { backgroundColor: "#2563eb", color: "#ffffff" }
          }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "change button text to 'Click Me'",
              "change button background color to red"
            ],
            targetElements: [
              { selector: "button.cta-primary", changes: "text + color" }
            ],
            completenessCheck: {
              textChange: true,
              colorChange: true,
              sizeChange: false,
              positionChange: false,
              behaviorChange: false,
              elementCreation: false,
              allImplemented: true
            },
            reasoning: "Simple button modification using CSS for color (reliable) and JS for text content"
          },
          variations: [{
            number: 1,
            name: "Red Click Me Button",
            css: "button.cta-primary {\n  background-color: red !important;\n  color: white !important;\n}",
            js: "waitForElement('button.cta-primary', (element) => {\n  if(element.dataset.varApplied) return;\n  element.textContent = 'Click Me';\n  element.dataset.varApplied = '1';\n});"
          }],
          globalCSS: "",
          globalJS: ""
        }
      },

      // Example 2: Countdown Timer (Complex with CleanupManager)
      countdownTimer: {
        userRequest: "Add a countdown timer at the top showing days, hours, and minutes until December 31st, 2025",
        elementDatabase: [
          { selector: "body", tag: "body", text: "" },
          { selector: "header.main-header", tag: "header", text: "Welcome" }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "create new countdown timer element",
              "show days, hours, and minutes",
              "position at top of page (fixed)",
              "countdown to December 31st, 2025",
              "update timer dynamically"
            ],
            targetElements: [
              { selector: "body", changes: "prepend fixed countdown banner" }
            ],
            completenessCheck: {
              textChange: false,
              colorChange: true,
              sizeChange: false,
              positionChange: true,
              behaviorChange: true,
              elementCreation: true,
              allImplemented: true
            },
            reasoning: "Creating new fixed element with setInterval requires CleanupManager registration. Using wrapper div with explicit flex styling for horizontal layout."
          },
          variations: [{
            number: 1,
            name: "New Year Countdown",
            css: "#countdown-banner {\n  position: fixed !important;\n  top: 0 !important;\n  left: 0 !important;\n  right: 0 !important;\n  z-index: 9999 !important;\n  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%) !important;\n  color: white !important;\n  padding: 12px 20px !important;\n  display: flex !important;\n  justify-content: center !important;\n  align-items: center !important;\n}\n\n#countdown-banner .countdown-wrapper {\n  display: flex !important;\n  gap: 20px !important;\n  align-items: center !important;\n}\n\n#countdown-banner .time-box {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: center !important;\n  min-width: 60px !important;\n}\n\n#countdown-banner .time-value {\n  font-size: 24px !important;\n  font-weight: bold !important;\n  line-height: 1 !important;\n}\n\n#countdown-banner .time-label {\n  font-size: 12px !important;\n  opacity: 0.9 !important;\n  margin-top: 4px !important;\n}\n\nbody {\n  padding-top: 60px !important;\n}",
            js: "waitForElement('body', (body) => {\n  if(document.getElementById('countdown-banner')) return;\n  \n  const banner = document.createElement('div');\n  banner.id = 'countdown-banner';\n  banner.innerHTML = '<div class=\"countdown-wrapper\"><div class=\"time-box\"><div class=\"time-value\" id=\"days-value\">00</div><div class=\"time-label\">days</div></div><div class=\"time-box\"><div class=\"time-value\" id=\"hours-value\">00</div><div class=\"time-label\">hours</div></div><div class=\"time-box\"><div class=\"time-value\" id=\"minutes-value\">00</div><div class=\"time-label\">minutes</div></div></div>';\n  body.prepend(banner);\n  \n  if (window.ConvertCleanupManager) {\n    window.ConvertCleanupManager.registerElement(banner, 'countdown banner');\n  }\n  \n  const targetDate = new Date('2025-12-31T23:59:59').getTime();\n  \n  function updateCountdown() {\n    const now = Date.now();\n    const diff = targetDate - now;\n    \n    if (diff <= 0) {\n      banner.style.display = 'none';\n      return;\n    }\n    \n    const days = Math.floor(diff / (1000 * 60 * 60 * 24));\n    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));\n    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));\n    \n    document.getElementById('days-value').textContent = String(days).padStart(2, '0');\n    document.getElementById('hours-value').textContent = String(hours).padStart(2, '0');\n    document.getElementById('minutes-value').textContent = String(minutes).padStart(2, '0');\n  }\n  \n  updateCountdown();\n  const intervalId = setInterval(updateCountdown, 60000);\n  \n  if (window.ConvertCleanupManager) {\n    window.ConvertCleanupManager.registerInterval(intervalId, 'countdown update');\n  }\n});"
          }],
          globalCSS: "",
          globalJS: ""
        }
      },

      // Example 3: Hide Element (Simple)
      hideElement: {
        userRequest: "Hide the popup modal",
        elementDatabase: [
          { selector: "div.modal-popup", tag: "div", text: "Subscribe to our newsletter" }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "hide the popup modal element"
            ],
            targetElements: [
              { selector: "div.modal-popup", changes: "set display to none" }
            ],
            completenessCheck: {
              textChange: false,
              colorChange: false,
              sizeChange: false,
              positionChange: false,
              behaviorChange: true,
              elementCreation: false,
              allImplemented: true
            },
            reasoning: "Simple visibility change using CSS display:none with !important to override"
          },
          variations: [{
            number: 1,
            name: "Hide Popup Modal",
            css: "div.modal-popup {\n  display: none !important;\n}",
            js: ""
          }],
          globalCSS: "",
          globalJS: ""
        }
      },

      // Example 4: Multiple Elements (Same Change to Multiple)
      multipleElements: {
        userRequest: "Make all three CTA buttons blue",
        elementDatabase: [
          { selector: "button.cta-hero", tag: "button", text: "Get Started" },
          { selector: "button.cta-pricing", tag: "button", text: "View Plans" },
          { selector: "button.cta-footer", tag: "button", text: "Try Free" }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "change button.cta-hero background to blue",
              "change button.cta-pricing background to blue",
              "change button.cta-footer background to blue"
            ],
            targetElements: [
              { selector: "button.cta-hero", changes: "blue background" },
              { selector: "button.cta-pricing", changes: "blue background" },
              { selector: "button.cta-footer", changes: "blue background" }
            ],
            completenessCheck: {
              textChange: false,
              colorChange: true,
              sizeChange: false,
              positionChange: false,
              behaviorChange: false,
              elementCreation: false,
              allImplemented: true
            },
            reasoning: "Multiple button color change using CSS group selector for efficiency"
          },
          variations: [{
            number: 1,
            name: "Blue CTA Buttons",
            css: "button.cta-hero,\nbutton.cta-pricing,\nbutton.cta-footer {\n  background-color: #2563eb !important;\n  color: white !important;\n}",
            js: ""
          }],
          globalCSS: "",
          globalJS: ""
        }
      },

      // Example 5: Hover Effect (CSS Pseudo-class)
      hoverEffect: {
        userRequest: "Add a hover effect to the main button that makes it slightly larger and changes opacity",
        elementDatabase: [
          { selector: "button#main-cta", tag: "button", text: "Get Started" }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "add hover effect to button#main-cta",
              "scale up slightly on hover",
              "change opacity on hover",
              "add smooth transition"
            ],
            targetElements: [
              { selector: "button#main-cta", changes: "hover state with transform and opacity" }
            ],
            completenessCheck: {
              textChange: false,
              colorChange: false,
              sizeChange: true,
              positionChange: false,
              behaviorChange: true,
              elementCreation: false,
              allImplemented: true
            },
            reasoning: "CSS hover pseudo-class with transform and transition for smooth effect"
          },
          variations: [{
            number: 1,
            name: "Hover Scale Effect",
            css: "button#main-cta {\n  transition: all 0.3s ease !important;\n}\n\nbutton#main-cta:hover {\n  transform: scale(1.05) !important;\n  opacity: 0.9 !important;\n}",
            js: ""
          }],
          globalCSS: "",
          globalJS: ""
        }
      },

      // Example 6: Layout Change (Flexbox)
      layoutChange: {
        userRequest: "Make the three feature cards display horizontally instead of stacked",
        elementDatabase: [
          { selector: "div.features-container", tag: "div", text: "", styles: { display: "block" } },
          { selector: "div.feature-card", tag: "div", text: "Feature 1" }
        ],
        correctResponse: {
          analysis: {
            requestedChanges: [
              "change features-container layout to horizontal",
              "apply flexbox to container",
              "add spacing between cards"
            ],
            targetElements: [
              { selector: "div.features-container", changes: "display flex with gap" }
            ],
            completenessCheck: {
              textChange: false,
              colorChange: false,
              sizeChange: false,
              positionChange: true,
              behaviorChange: false,
              elementCreation: false,
              allImplemented: true
            },
            reasoning: "Container layout change using flexbox with gap for spacing"
          },
          variations: [{
            number: 1,
            name: "Horizontal Feature Cards",
            css: "div.features-container {\n  display: flex !important;\n  flex-direction: row !important;\n  gap: 20px !important;\n  align-items: flex-start !important;\n}\n\ndiv.feature-card {\n  flex: 1 !important;\n}",
            js: ""
          }],
          globalCSS: "",
          globalJS: ""
        }
      }
    };
  }

  /**
   * Get examples relevant to the user's request
   * @param {string} userRequest - The user's request text
   * @param {number} maxExamples - Maximum number of examples to return
   * @returns {Array} Array of relevant example objects
   */
  getRelevantExamples(userRequest, maxExamples = 2) {
    const request = userRequest.toLowerCase();
    const relevant = [];

    // Text + Color (most common pattern)
    if ((request.includes('text') || request.includes('say')) &&
        (request.includes('color') || request.includes('red') || request.includes('blue'))) {
      relevant.push(this.examples.textAndColor);
    }

    // Countdown/Timer
    if (request.includes('countdown') || request.includes('timer') || request.includes('clock')) {
      relevant.push(this.examples.countdownTimer);
    }

    // Hide/Remove
    if (request.includes('hide') || request.includes('remove') || request.includes('delete')) {
      relevant.push(this.examples.hideElement);
    }

    // Multiple elements
    if (request.includes('all') || request.includes('every') || /\d+\s+(buttons?|elements?)/i.test(request)) {
      relevant.push(this.examples.multipleElements);
    }

    // Hover effects
    if (request.includes('hover') || request.includes('mouse over')) {
      relevant.push(this.examples.hoverEffect);
    }

    // Layout changes
    if (request.includes('horizontal') || request.includes('vertical') ||
        request.includes('layout') || request.includes('flexbox')) {
      relevant.push(this.examples.layoutChange);
    }

    // Default fallback: if no specific match, use text+color as it's the most common pattern
    if (relevant.length === 0) {
      relevant.push(this.examples.textAndColor);
    }

    return relevant.slice(0, maxExamples);
  }

  /**
   * Format examples for inclusion in AI prompt
   * @param {Array} examples - Array of example objects
   * @returns {string} Formatted string for prompt
   */
  formatForPrompt(examples) {
    if (!examples || examples.length === 0) {
      return '';
    }

    let output = '\n\n**📚 LEARN FROM THESE PERFECT EXAMPLES:**\n\n';
    output += 'These show the EXACT pattern you should follow. Study them carefully.\n\n';

    examples.forEach((example, idx) => {
      output += `**EXAMPLE ${idx + 1}:**\n\n`;
      output += `User Request: "${example.userRequest}"\n\n`;

      output += `Element Database:\n`;
      output += JSON.stringify(example.elementDatabase, null, 2) + '\n\n';

      output += `CORRECT Response (COPY THIS PATTERN):\n`;
      output += JSON.stringify(example.correctResponse, null, 2) + '\n\n';
      output += '---\n\n';
    });

    output += '**Now generate code for the ACTUAL request using the same JSON structure and completeness check.**\n\n';

    return output;
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FewShotExamples;
} else if (typeof window !== 'undefined') {
  window.FewShotExamples = FewShotExamples;
}
