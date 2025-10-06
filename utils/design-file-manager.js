// Design File Manager - Enhanced handling of design files with AI integration
class DesignFileManager {
  constructor() {
    this.files = [];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
  }

  async addFile(file) {
    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Process file
    const processed = await this.processFile(file);
    this.files.push(processed);
    
    return processed;
  }

  validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (file.size > this.maxFileSize) {
      return { 
        valid: false, 
        error: `File too large. Maximum size is ${this.maxFileSize / (1024 * 1024)}MB` 
      };
    }

    if (!this.supportedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: `Unsupported file type. Supported: ${this.supportedTypes.join(', ')}` 
      };
    }

    return { valid: true };
  }

  async processFile(file) {
    const processed = {
      id: this.generateId(),
      name: file.name,
      type: file.type,
      size: file.size,
      timestamp: Date.now(),
      preview: null,
      base64: null,
      dataUrl: null,
      notes: '',
      dimensions: null
    };

    // Generate preview and base64
    try {
      const dataUrl = await this.fileToDataUrl(file);
      processed.dataUrl = dataUrl;
      processed.base64 = dataUrl.split(',')[1]; // Remove data URL prefix
      processed.preview = dataUrl;

      // Get image dimensions
      if (file.type.startsWith('image/')) {
        processed.dimensions = await this.getImageDimensions(dataUrl);
      }
    } catch (error) {
      console.error('Failed to process file:', error);
      throw new Error(`Failed to process file: ${error.message}`);
    }

    return processed;
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      reader.readAsDataURL(file);
    });
  }

  getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height
        });
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      
      img.src = dataUrl;
    });
  }

  removeFile(fileId) {
    const index = this.files.findIndex(f => f.id === fileId);
    if (index !== -1) {
      this.files.splice(index, 1);
      return true;
    }
    return false;
  }

  updateFileNotes(fileId, notes) {
    const file = this.files.find(f => f.id === fileId);
    if (file) {
      file.notes = notes;
      return true;
    }
    return false;
  }

  getFiles() {
    return [...this.files];
  }

  clear() {
    this.files = [];
  }

  hasFiles() {
    return this.files.length > 0;
  }

  generateId() {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Build AI prompt with design files
  buildAIPromptWithDesigns(basePrompt, currentPageScreenshot) {
    if (this.files.length === 0) {
      return {
        type: 'text',
        content: basePrompt
      };
    }

    // Multi-modal prompt with images
    const content = [
      {
        type: 'text',
        text: basePrompt
      }
    ];

    // Add current page screenshot
    if (currentPageScreenshot) {
      content.push({
        type: 'image_url',
        image_url: {
          url: currentPageScreenshot,
          detail: 'high'
        }
      });
      
      content.push({
        type: 'text',
        text: '\n↑ CURRENT PAGE STATE (before changes)\n'
      });
    }

    // Add design files
    this.files.forEach((file, index) => {
      content.push({
        type: 'image_url',
        image_url: {
          url: file.dataUrl,
          detail: 'high'
        }
      });

      const fileContext = file.notes ? 
        `\n↑ DESIGN FILE ${index + 1}: ${file.name} - ${file.notes}\n` :
        `\n↑ DESIGN FILE ${index + 1}: ${file.name}\n`;
      
      content.push({
        type: 'text',
        text: fileContext
      });
    });

    // Add design comparison instructions
    content.push({
      type: 'text',
      text: `

DESIGN FILE INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have been provided with:
1. The CURRENT page state (screenshot)
2. ${this.files.length} DESIGN FILE(S) showing the desired end state

YOUR TASK:
→ Analyze the visual differences between current and desired states
→ Focus on these specific changes:
  • Color changes (note exact hex codes if visible)
  • Typography changes (font sizes, weights, families)
  • Spacing changes (padding, margins, gaps)
  • Layout changes (positioning, alignment, structure)
  • New or removed elements
  • Size changes (width, height, scale)

→ Generate Convert.com code to transform current → desired state
→ Prioritize CSS for visual changes, use JS only when necessary
→ Be precise with measurements and colors visible in designs
→ Maintain responsive design principles

IMPORTANT: Match the design files as closely as possible while maintaining proper Convert.com code structure.
`
    });

    return {
      type: 'multimodal',
      content
    };
  }

  // Create visual comparison HTML
  createComparisonView(currentScreenshot) {
    if (this.files.length === 0) {
      return '';
    }

    const comparisons = this.files.map((file, index) => `
      <div class="design-comparison-item">
        <div class="comparison-label">Design ${index + 1}: ${this.escapeHtml(file.name)}</div>
        <div class="comparison-images">
          <div class="comparison-image">
            <img src="${currentScreenshot}" alt="Current">
            <div class="image-label">Current</div>
          </div>
          <div class="comparison-arrow">→</div>
          <div class="comparison-image">
            <img src="${file.preview}" alt="Design">
            <div class="image-label">Design</div>
          </div>
        </div>
        ${file.notes ? `<div class="comparison-notes">${this.escapeHtml(file.notes)}</div>` : ''}
        ${file.dimensions ? `<div class="comparison-meta">${file.dimensions.width} × ${file.dimensions.height}px</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="design-comparison-view">
        <div class="comparison-header">
          <h4>Design Comparison</h4>
          <p>Current page vs. uploaded designs</p>
        </div>
        ${comparisons}
      </div>
    `;
  }

  // Handle Figma URL import
  async importFromFigma(figmaUrl) {
    // Basic Figma URL validation
    if (!figmaUrl.includes('figma.com')) {
      throw new Error('Invalid Figma URL');
    }

    // Note: Full Figma API integration would require Figma API token
    // For now, just provide instructions
    return {
      success: false,
      message: 'Figma import: Please export your design as PNG from Figma and upload it here.',
      instructions: [
        '1. Open your Figma file',
        '2. Select the frame you want to test',
        '3. Right-click → Export → PNG (2x for better quality)',
        '4. Upload the exported PNG file here'
      ]
    };
  }

  // Generate file preview HTML
  generatePreviewCard(file, index) {
    return `
      <div class="design-preview-card" data-file-id="${file.id}">
        <div class="design-preview-image">
          <img src="${file.preview}" alt="${this.escapeHtml(file.name)}">
          ${file.dimensions ? `
            <div class="image-dimensions">
              ${file.dimensions.width} × ${file.dimensions.height}
            </div>
          ` : ''}
        </div>
        <div class="design-preview-info">
          <div class="design-preview-name" title="${this.escapeHtml(file.name)}">
            ${this.escapeHtml(this.truncateName(file.name, 20))}
          </div>
          <div class="design-preview-meta">
            ${this.formatFileSize(file.size)}
          </div>
        </div>
        <div class="design-preview-actions">
          <button class="btn-icon design-annotate-btn" data-file-id="${file.id}" title="Add notes">
            ✏️
          </button>
          <button class="btn-icon design-remove-btn" data-file-id="${file.id}" title="Remove">
            🗑️
          </button>
        </div>
        <textarea 
          class="design-notes-input" 
          data-file-id="${file.id}"
          placeholder="Add notes about this design (optional)"
          rows="2"
        >${this.escapeHtml(file.notes || '')}</textarea>
      </div>
    `;
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  truncateName(name, maxLength) {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const baseName = name.substring(0, name.lastIndexOf('.'));
    const truncated = baseName.substring(0, maxLength - ext.length - 4) + '...';
    return `${truncated}.${ext}`;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DesignFileManager;
}
