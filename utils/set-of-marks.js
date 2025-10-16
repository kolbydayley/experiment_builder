/**
 * Set-of-Mark (SoM) Prompting for Visual Grounding
 *
 * Implements Microsoft Research's Set-of-Mark technique to overlay numbered
 * labels on screenshot regions, enabling vision models to reference elements
 * by number instead of coordinates.
 *
 * Research: https://arxiv.org/abs/2310.11441
 * "Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V"
 */

class SetOfMarks {
  constructor() {
    this.markStyle = {
      boxColor: 'rgba(255, 87, 51, 0.4)',      // Vibrant orange-red with transparency
      boxBorderColor: '#FF5733',                // Solid border
      boxBorderWidth: 2,
      labelBgColor: '#FF5733',                  // Solid background for label
      labelTextColor: '#FFFFFF',                // White text
      labelFont: 'bold 14px Arial',
      labelPadding: 4
    };
  }

  /**
   * Create a marked screenshot with numbered bounding boxes
   * @param {string} screenshotDataURL - Base64 encoded screenshot
   * @param {Array} elements - Array of elements with boundingRect
   * @returns {Promise<string>} Base64 encoded marked screenshot
   */
  async createMarkedScreenshot(screenshotDataURL, elements) {
    console.log(`🏷️  [SoM] Creating marked screenshot with ${elements.length} elements...`);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original screenshot
        ctx.drawImage(img, 0, 0);

        // Draw marks for each element
        elements.forEach((element, index) => {
          const markNumber = index + 1;
          this.drawMark(ctx, element.boundingRect, markNumber);
        });

        // Convert to data URL
        const markedScreenshot = canvas.toDataURL('image/png');
        console.log(`✅ [SoM] Marked screenshot created with ${elements.length} marks`);
        resolve(markedScreenshot);
      };

      img.onerror = (error) => {
        console.error(`❌ [SoM] Failed to load screenshot:`, error);
        reject(error);
      };

      img.src = screenshotDataURL;
    });
  }

  /**
   * Draw a numbered mark on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} rect - Bounding rectangle {x, y, width, height}
   * @param {number} markNumber - Number to display
   */
  drawMark(ctx, rect, markNumber) {
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const { x, y, width, height } = rect;
    const { boxColor, boxBorderColor, boxBorderWidth, labelBgColor, labelTextColor, labelFont, labelPadding } = this.markStyle;

    // Draw bounding box
    ctx.strokeStyle = boxBorderColor;
    ctx.lineWidth = boxBorderWidth;
    ctx.fillStyle = boxColor;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    // Draw label with number
    const label = `[${markNumber}]`;
    ctx.font = labelFont;
    const labelMetrics = ctx.measureText(label);
    const labelWidth = labelMetrics.width + (labelPadding * 2);
    const labelHeight = 20;

    // Position label at top-left corner of bounding box
    let labelX = x;
    let labelY = y - labelHeight;

    // If label would be off-screen, put it inside the box
    if (labelY < 0) {
      labelY = y + 2;
    }

    // Draw label background
    ctx.fillStyle = labelBgColor;
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

    // Draw label text
    ctx.fillStyle = labelTextColor;
    ctx.textBaseline = 'top';
    ctx.fillText(label, labelX + labelPadding, labelY + 2);
  }

  /**
   * Create mini-screenshots of individual elements
   * @param {string} fullScreenshotDataURL - Full page screenshot
   * @param {Array} elements - Elements with boundingRect
   * @param {Object} options - Options {padding: 10}
   * @returns {Promise<Array>} Array of {element, screenshot} objects
   */
  async createElementScreenshots(fullScreenshotDataURL, elements, options = {}) {
    const padding = options.padding || 10;
    console.log(`📸 [SoM] Creating ${elements.length} element screenshots...`);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const screenshots = elements.map((element, index) => {
          if (!element.boundingRect || element.boundingRect.width === 0) {
            return { element, screenshot: null };
          }

          const rect = element.boundingRect;

          // Add padding
          const x = Math.max(0, rect.x - padding);
          const y = Math.max(0, rect.y - padding);
          const width = Math.min(img.width - x, rect.width + (padding * 2));
          const height = Math.min(img.height - y, rect.height + (padding * 2));

          // Create canvas for this element
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          // Draw element portion of screenshot
          ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

          // Convert to data URL
          const screenshot = canvas.toDataURL('image/png');

          return {
            element,
            screenshot,
            markNumber: index + 1
          };
        });

        console.log(`✅ [SoM] Created ${screenshots.filter(s => s.screenshot).length} element screenshots`);
        resolve(screenshots);
      };

      img.onerror = (error) => {
        console.error(`❌ [SoM] Failed to load screenshot:`, error);
        reject(error);
      };

      img.src = fullScreenshotDataURL;
    });
  }

  /**
   * Format elements as text list for AI prompt
   * @param {Array} elements - Elements with markNumber
   * @returns {string} Formatted text
   */
  formatElementList(elements) {
    return elements.map((el, index) => {
      const markNumber = index + 1;
      const role = el.role || 'element';
      const name = el.name || el.text || '';
      const selector = el.selector || '';

      return `[${markNumber}] ${role}${name ? `: "${name}"` : ''}${selector ? ` (${selector})` : ''}`;
    }).join('\n');
  }

  /**
   * Create a SoM prompt for AI
   * @param {string} userQuery - User's natural language query
   * @param {Array} elements - Elements with marks
   * @param {string} markedScreenshot - Screenshot with marks (optional)
   * @returns {Object} Prompt object {text, image}
   */
  createPrompt(userQuery, elements, markedScreenshot = null) {
    const elementList = this.formatElementList(elements);

    const promptText = `The user wants to: "${userQuery}"

Available elements (numbered on the screenshot):
${elementList}

Task: Which element(s) does the user want to modify? Reference them by their [number].

Return your answer as JSON:
{
  "interpretation": "Clear explanation of what the user wants",
  "confidence": 0.0-1.0,
  "candidates": [
    {
      "markNumber": 3,
      "selector": ".countdown-box",
      "reasoning": "Why this element matches the user's intent"
    }
  ],
  "needsDisambiguation": false
}

If multiple elements could match and you're uncertain (confidence < 0.8), set needsDisambiguation: true.`;

    return {
      text: promptText,
      image: markedScreenshot,
      hasImage: markedScreenshot !== null
    };
  }

  /**
   * Parse AI response to extract selected elements
   * @param {Object} aiResponse - AI's JSON response
   * @param {Array} elements - Original elements array
   * @returns {Object} {selectedElements, needsDisambiguation, interpretation}
   */
  parseResponse(aiResponse, elements) {
    try {
      const parsed = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;

      const selectedElements = (parsed.candidates || []).map(candidate => {
        const element = elements[candidate.markNumber - 1];
        return {
          ...element,
          ...candidate,
          matchedBy: 'som'
        };
      });

      return {
        interpretation: parsed.interpretation || '',
        confidence: parsed.confidence || 0,
        selectedElements,
        needsDisambiguation: parsed.needsDisambiguation || false,
        reasoning: parsed.candidates?.map(c => c.reasoning).join('; ') || ''
      };
    } catch (error) {
      console.error(`❌ [SoM] Failed to parse AI response:`, error);
      return {
        interpretation: '',
        confidence: 0,
        selectedElements: [],
        needsDisambiguation: true,
        error: error.message
      };
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.SetOfMarks = SetOfMarks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SetOfMarks;
}
