// Code formatting utilities for different output formats
class CodeFormatter {
  constructor() {
    this.indentSize = 2;
    this.maxLineLength = 120;
  }

  // Format generated code for different Convert.com contexts
  formatForConvert(codeData, format = 'standard') {
    switch (format) {
      case 'convert-editor':
        return this.formatForConvertEditor(codeData);
      case 'export-files':
        return this.formatForExport(codeData);
      case 'clipboard':
        return this.formatForClipboard(codeData);
      default:
        return this.formatStandard(codeData);
    }
  }

  // Format for Convert.com's code editor (compact, ready to paste)
  formatForConvertEditor(codeData) {
    const formatted = {};

    codeData.variations.forEach(variation => {
      const key = `variation_${variation.number}`;
      
      formatted[key] = {
        css: this.minifyCSS(variation.css),
        js: this.minifyJS(variation.js),
        name: variation.name
      };
    });

    if (codeData.globalCSS) {
      formatted.global_css = this.minifyCSS(codeData.globalCSS);
    }

    if (codeData.globalJS) {
      formatted.global_js = this.minifyJS(codeData.globalJS);
    }

    return formatted;
  }

  // Format for file export (well-formatted, documented)
  formatForExport(codeData) {
    const files = {};

    // Create variation files
    codeData.variations.forEach(variation => {
      const baseName = this.sanitizeFileName(variation.name);
      
      if (variation.css) {
        const cssContent = this.addFileHeader('CSS', variation.name) + 
                          this.formatCSS(variation.css);
        files[`${baseName}.css`] = cssContent;
      }

      if (variation.js) {
        const jsContent = this.addFileHeader('JavaScript', variation.name) + 
                         this.formatJS(variation.js);
        files[`${baseName}.js`] = jsContent;
      }
    });

    // Create global files
    if (codeData.globalCSS) {
      const globalCSS = this.addFileHeader('Global CSS', 'Shared across all variations') + 
                       this.formatCSS(codeData.globalCSS);
      files['global-experience.css'] = globalCSS;
    }

    if (codeData.globalJS) {
      const globalJS = this.addFileHeader('Global JavaScript', 'Shared across all variations') + 
                      this.formatJS(codeData.globalJS);
      files['global-experience.js'] = globalJS;
    }

    // Add README
    files['README.md'] = this.generateReadme(codeData);

    // Add Convert.com integration guide
    files['CONVERT_SETUP.md'] = this.generateConvertGuide(codeData);

    return files;
  }

  // Format for clipboard (clean, ready to use)
  formatForClipboard(codeData) {
    let output = '';

    codeData.variations.forEach((variation, index) => {
      output += `\n/* ===== VARIATION ${variation.number}: ${variation.name.toUpperCase()} ===== */\n\n`;
      
      if (variation.css) {
        output += `/* Variation CSS */\n${this.formatCSS(variation.css)}\n\n`;
      }
      
      if (variation.js) {
        output += `/* Variation JavaScript */\n${this.formatJS(variation.js)}\n\n`;
      }
    });

    if (codeData.globalCSS) {
      output += `\n/* ===== GLOBAL EXPERIENCE CSS ===== */\n\n${this.formatCSS(codeData.globalCSS)}\n\n`;
    }

    if (codeData.globalJS) {
      output += `\n/* ===== GLOBAL EXPERIENCE JAVASCRIPT ===== */\n\n${this.formatJS(codeData.globalJS)}\n\n`;
    }

    return output;
  }

  // Standard formatting (for display in extension)
  formatStandard(codeData) {
    return {
      variations: codeData.variations.map(v => ({
        ...v,
        css: this.formatCSS(v.css),
        js: this.formatJS(v.js)
      })),
      globalCSS: this.formatCSS(codeData.globalCSS),
      globalJS: this.formatJS(codeData.globalJS)
    };
  }

  // CSS formatting
  formatCSS(css) {
    if (!css) return '';

    try {
      // Split into rules
      const rules = css.split('}').map(rule => rule.trim()).filter(rule => rule);
      
      return rules.map(rule => {
        if (!rule.includes('{')) return rule;

        const [selector, properties] = rule.split('{');
        const cleanSelector = selector.trim();
        const cleanProperties = properties ? properties.trim() : '';

        if (!cleanProperties) return `${cleanSelector} {}`;

        // Format properties
        const formattedProps = cleanProperties
          .split(';')
          .map(prop => prop.trim())
          .filter(prop => prop)
          .map(prop => `  ${prop};`)
          .join('\n');

        return `${cleanSelector} {\n${formattedProps}\n}`;
      }).join('\n\n') + (rules.length > 0 ? '\n' : '');

    } catch (error) {
      console.warn('CSS formatting failed:', error);
      return css; // Return original if formatting fails
    }
  }

  // JavaScript formatting
  formatJS(js) {
    if (!js) return '';

    try {
      // Basic JS formatting - add proper indentation and line breaks
      let formatted = js
        .replace(/\{\s*(?=\S)/g, '{\n  ')
        .replace(/;\s*(?=\S)/g, ';\n  ')
        .replace(/\}\s*(?=\S)/g, '}\n')
        .replace(/\n\s*\n/g, '\n');

      // Ensure proper indentation for nested blocks
      const lines = formatted.split('\n');
      let indentLevel = 0;
      
      return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        // Decrease indent for closing braces
        if (trimmed.startsWith('}')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }

        const indentedLine = '  '.repeat(indentLevel) + trimmed;

        // Increase indent for opening braces
        if (trimmed.endsWith('{')) {
          indentLevel++;
        }

        return indentedLine;
      }).join('\n');

    } catch (error) {
      console.warn('JS formatting failed:', error);
      return js; // Return original if formatting fails
    }
  }

  // CSS minification (for Convert.com editor)
  minifyCSS(css) {
    if (!css) return '';

    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/;\s*}/g, '}') // Remove last semicolon
      .replace(/\s*{\s*/g, '{') // Clean braces
      .replace(/\s*}\s*/g, '}')
      .replace(/\s*;\s*/g, ';') // Clean semicolons
      .replace(/\s*,\s*/g, ',') // Clean commas
      .trim();
  }

  // JS minification (basic)
  minifyJS(js) {
    if (!js) return '';

    return js
      .replace(/^\s*\/\/.*$/gm, '') // Remove single-line comments (only full line comments)
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\s*{\s*/g, '{') // Clean braces
      .replace(/\s*}\s*/g, '}')
      .replace(/\s*;\s*/g, ';') // Clean semicolons
      .replace(/\s*,\s*/g, ',') // Clean commas
      .trim();
  }

  // Add file headers
  addFileHeader(type, description) {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `/**
 * Convert.com A/B Test - ${type}
 * ${description}
 * 
 * Generated by Convert.com Experiment Builder Extension
 * Date: ${timestamp}
 * 
 * Instructions:
 * 1. Copy this code to the appropriate section in Convert.com
 * 2. Test thoroughly before launching the experiment
 * 3. Monitor performance and user experience
 */

`;
  }

  // Sanitize filenames
  sanitizeFileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Generate README
  generateReadme(codeData) {
    const timestamp = new Date().toISOString();
    
    return `# Convert.com A/B Test Experiment

## Overview
This experiment was generated using the Convert.com Experiment Builder Chrome Extension on ${timestamp}.

## Files Included

### Variations
${codeData.variations.map(v => `
#### ${v.name} (Variation ${v.number})
${v.css ? `- \`${this.sanitizeFileName(v.name)}.css\` - Styling changes` : ''}
${v.js ? `- \`${this.sanitizeFileName(v.name)}.js\` - JavaScript functionality` : ''}
`).join('')}

### Global Files
${codeData.globalCSS ? '- `global-experience.css` - Shared CSS across all variations' : ''}
${codeData.globalJS ? '- `global-experience.js` - Shared JavaScript across all variations' : ''}

## Implementation Guide

### Step 1: Create Experiment in Convert.com
1. Log into your Convert.com dashboard
2. Create a new experiment
3. Configure your audience and goals

### Step 2: Add Code to Variations
For each variation:
1. Go to the variation settings
2. Add CSS code to "Variation CSS" section
3. Add JavaScript code to "Variation JS" section

### Step 3: Add Global Code (if applicable)
1. Go to "Global Experience CSS/JS" sections
2. Add the global files content

### Step 4: Test & Launch
1. Preview each variation
2. Test on different devices and browsers
3. Verify tracking is working correctly
4. Launch when ready

## Technical Notes

### CSS Implementation
- All CSS includes \`!important\` rules where necessary
- Styles are optimized for performance and persistence
- Responsive design considerations included

### JavaScript Implementation
- Uses \`convert._$()\` for polling-based element selection
- Includes proper DOM ready checks
- Handles race conditions and dynamic content loading

### Browser Compatibility
- Tested for modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation for older browsers
- Mobile-responsive design

## Troubleshooting

### Common Issues
1. **Elements not found**: Verify selectors are correct and elements exist
2. **Styles not applying**: Check CSS specificity and !important usage
3. **JavaScript errors**: Ensure convert._$() is used correctly

### Debug Tips
- Use browser developer tools to inspect elements
- Check Convert.com's preview mode
- Monitor console for JavaScript errors
- Test with different user segments

## Support
For issues with the generated code or Convert.com integration:
- Check Convert.com documentation
- Contact Convert.com support
- Review experiment setup in Convert.com dashboard

---
Generated by Convert.com Experiment Builder Extension
`;
  }

  // Generate Convert.com specific setup guide
  generateConvertGuide(codeData) {
    return `# Convert.com Integration Guide

## Quick Setup Checklist

### 1. Experiment Setup
- [ ] Create new experiment in Convert.com dashboard
- [ ] Configure audience targeting
- [ ] Set up conversion goals
- [ ] Define traffic allocation

### 2. Code Implementation

#### For each variation (${codeData.variations.length} total):
${codeData.variations.map(v => `
**${v.name}:**
- [ ] Copy CSS to "Variation CSS" section
- [ ] Copy JavaScript to "Variation JS" section
- [ ] Test variation preview
`).join('')}

#### Global Experience Code:
${codeData.globalCSS ? '- [ ] Add global CSS to "Global Experience CSS"' : ''}
${codeData.globalJS ? '- [ ] Add global JavaScript to "Global Experience JS"' : ''}

### 3. Testing
- [ ] Preview all variations
- [ ] Test on mobile devices
- [ ] Verify tracking functionality
- [ ] Check performance impact

### 4. Launch
- [ ] Enable experiment
- [ ] Monitor initial results
- [ ] Check for errors in Convert.com dashboard

## Code Sections Explained

### Variation CSS
Use this for:
- Visual styling changes
- Layout modifications
- Color and typography updates
- Responsive design adjustments

### Variation JavaScript
Use this for:
- Dynamic content changes
- User interaction modifications
- Complex DOM manipulation
- Event handling

### Global Experience Code
Use this for:
- Shared functionality across variations
- Common event listeners
- Utility functions
- Tracking enhancements

## Convert.com Specific Features Used

### convert._$()
- Polling-based jQuery selector
- Waits for elements to load
- Handles dynamic content
- Prevents race conditions

Example:
\`\`\`javascript
convert._$('.button').waitUntilExists(function() {
  // Code runs when element exists
});
\`\`\`

### convert.$()
- Standard jQuery selector
- Use in Custom JavaScript sections
- For immediate DOM access
- Better for static elements

## Performance Optimization

### CSS Best Practices Applied
- Specific selectors to minimize conflicts
- !important used strategically
- Minimal impact on page load
- Responsive design patterns

### JavaScript Best Practices Applied
- Efficient DOM queries
- Event delegation where appropriate
- Minimal global scope pollution
- Error handling included

## Troubleshooting Common Issues

### Element Not Found
**Problem**: JavaScript can't find target elements
**Solution**: 
- Use convert._$().waitUntilExists()
- Verify selectors in browser console
- Check element loading timing

### Styles Not Applying  
**Problem**: CSS rules not overriding existing styles
**Solution**:
- Add !important to CSS rules
- Increase selector specificity
- Check for conflicting stylesheets

### JavaScript Errors
**Problem**: Console shows JavaScript errors
**Solution**:
- Validate all selectors exist
- Add error handling
- Test in Convert.com preview mode

## Advanced Configuration

### A/B Test Settings
- **Traffic Allocation**: Distribute evenly across variations
- **Targeting**: Configure audience rules carefully
- **Goals**: Set up conversion tracking
- **Duration**: Plan test duration for statistical significance

### Quality Assurance
- Test all user flows in each variation
- Verify mobile responsiveness
- Check performance impact
- Validate tracking accuracy

---
*This guide covers the specific implementation details for Convert.com. For general A/B testing best practices, consult Convert.com's documentation.*
`;
  }

  // Validate code syntax
  validateCode(code, type) {
    const issues = [];

    if (type === 'css') {
      // Check for unclosed braces
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push('Unmatched CSS braces detected');
      }

      // Check for missing semicolons
      if (code.includes(':') && !code.includes(';')) {
        issues.push('CSS properties may be missing semicolons');
      }
    } else if (type === 'js') {
      // Basic JS validation
      try {
        // Check for obvious syntax issues
        if (code.includes('function') && !code.includes('(')) {
          issues.push('JavaScript function syntax may be incorrect');
        }
        
        // Check for convert._$ usage
        if (code.includes('$') && !code.includes('convert._$') && !code.includes('convert.$')) {
          issues.push('Consider using convert._$() or convert.$() for jQuery selections');
        }
      } catch (error) {
        issues.push('JavaScript syntax validation failed');
      }
    }

    return issues;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeFormatter;
} else if (typeof window !== 'undefined') {
  window.CodeFormatter = CodeFormatter;
}