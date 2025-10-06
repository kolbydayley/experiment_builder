// ChatGPT API integration utilities
class ChatGPTAPI {
  constructor() {
    this.baseURL = 'https://api.openai.com/v1';
    this.model = 'gpt-4';
    this.maxTokens = 2000;
    this.temperature = 0.7;
  }

  async generateExperimentCode(pageData, userInput, settings = {}) {
    try {
      const prompt = this.buildPrompt(pageData, userInput, settings);
      const response = await this.callAPI(prompt, settings.authToken);
      return this.parseResponse(response);
    } catch (error) {
      console.error('ChatGPT API error:', error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  buildPrompt(pageData, userInput, settings) {
    const { description, designFiles, variations, preferCSS, includeDOMChecks } = userInput;
    
    let prompt = `You are an expert Convert.com A/B testing developer. Generate Convert.com-compatible experiment code based on the provided context.

CURRENT PAGE ANALYSIS:
URL: ${pageData.url}
Title: ${pageData.title}
Viewport: ${pageData.viewport?.width}x${pageData.viewport?.height}

KEY PAGE ELEMENTS DETECTED:
${this.formatElementAnalysis(pageData.elements)}

HTML STRUCTURE (excerpt):
${this.extractHTMLExcerpt(pageData.html)}

CURRENT CSS (excerpt):
${this.extractCSSExcerpt(pageData.css)}

USER REQUIREMENTS:
${description ? `Description: ${description}` : ''}
${designFiles?.length ? `Design Files: ${designFiles.length} files uploaded (analyze the visual changes needed)` : ''}

VARIATIONS TO CREATE:
${variations.map((v, i) => `${i + 1}. ${v.name}: ${v.description || 'Based on design file'}`).join('\n')}

CONVERT.COM TECHNICAL REQUIREMENTS:
- Use convert._$() for polling-based jQuery selections (handles dynamic loading)
- Use convert.$() for standard jQuery in Custom JavaScript sections  
- Prefer CSS changes when possible for better persistence and performance
- Add !important flags when CSS rules need to override existing styles
- Handle race conditions where code executes before DOM elements are fully loaded
- Include proper DOM ready checks when necessary: convert._$('.selector').waitUntilExists()

GENERATION SETTINGS:
- Prefer CSS over JavaScript: ${preferCSS ? 'YES - Minimize JS usage' : 'NO - Use JS as needed'}
- Include DOM ready checks: ${includeDOMChecks ? 'YES - Add polling/wait logic' : 'NO - Assume elements exist'}

OUTPUT FORMAT REQUIREMENTS:
Generate code in the following exact structure:

// VARIATION 1 - [VARIATION_NAME]
// VARIATION CSS
[CSS code here with selectors and !important rules as needed]

// VARIATION JAVASCRIPT
[JavaScript code here using convert._$() and proper DOM polling]

// VARIATION 2 - [VARIATION_NAME] 
// VARIATION CSS
[CSS code here]

// VARIATION JAVASCRIPT  
[JavaScript code here]

// GLOBAL EXPERIENCE CSS (if shared styles needed)
[Shared CSS across all variations]

// GLOBAL EXPERIENCE JS (if shared functionality needed)
[Shared JavaScript across all variations]

BEST PRACTICES TO FOLLOW:
1. Use CSS for visual changes (colors, fonts, sizes, spacing)
2. Use JavaScript only for dynamic behavior or complex DOM manipulation
3. Include convert._$('.element').waitUntilExists() for elements that may load asynchronously
4. Add detailed comments explaining each change
5. Ensure responsive design compatibility
6. Test selectors are specific enough to avoid unintended matches
7. Use !important judiciously for CSS overrides

Generate clean, production-ready code with comprehensive comments explaining the rationale for each change.`;

    return prompt;
  }

  formatElementAnalysis(elements) {
    if (!elements) return 'No element analysis available';
    
    let analysis = '';
    
    if (elements.buttons?.length) {
      analysis += `Buttons/CTAs Found (${elements.buttons.length}):\n`;
      elements.buttons.slice(0, 5).forEach(btn => {
        analysis += `- "${btn.text}" at ${Math.round(btn.position.x)},${Math.round(btn.position.y)} (${btn.selector})\n`;
      });
    }
    
    if (elements.text?.length) {
      analysis += `\nKey Text Elements:\n`;
      elements.text.slice(0, 3).forEach(text => {
        analysis += `- ${text.tagName.toUpperCase()}: "${text.text.substring(0, 50)}..." (${text.selector})\n`;
      });
    }
    
    if (elements.forms?.length) {
      analysis += `\nForms Found: ${elements.forms.length}\n`;
    }
    
    return analysis || 'No key elements detected';
  }

  extractHTMLExcerpt(html) {
    if (!html) return 'No HTML available';
    
    // Extract body content and limit size
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    
    // Clean up and truncate
    return bodyContent
      .replace(/\s+/g, ' ')
      .substring(0, 1500) + '...';
  }

  extractCSSExcerpt(css) {
    if (!css) return 'No CSS available';
    
    // Extract meaningful CSS rules and limit size
    const rules = css
      .split('}')
      .filter(rule => rule.includes('{') && rule.trim().length > 10)
      .slice(0, 20)
      .join('}\n');
      
    return rules.substring(0, 1000) + '...';
  }

  async callAPI(prompt, authToken) {
    if (!authToken) {
      throw new Error('No authentication token available. Please ensure you are logged into ChatGPT.');
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Convert.com Experiment Builder Extension'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Convert.com A/B testing developer who generates clean, production-ready experiment code following Convert.com best practices and technical requirements.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      
      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your OpenAI API access.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait before trying again.');
      } else if (response.status === 503) {
        throw new Error('ChatGPT service is temporarily unavailable. Please try again later.');
      }
      
      throw new Error(errorData?.error?.message || `API request failed with status ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response generated from ChatGPT');
    }

    return result.choices[0].message.content;
  }

  parseResponse(response) {
    const sections = {
      variations: [],
      globalCSS: '',
      globalJS: ''
    };

    try {
      const lines = response.split('\n');
      let currentSection = null;
      let currentContent = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Check for section headers
        if (this.isSectionHeader(trimmedLine)) {
          // Save previous section
          if (currentSection) {
            this.addParsedSection(sections, currentSection, currentContent.trim());
          }
          
          // Start new section
          currentSection = this.parseSectionHeader(trimmedLine);
          currentContent = '';
        } else if (currentSection) {
          // Accumulate content for current section
          currentContent += line + '\n';
        }
      }
      
      // Add final section
      if (currentSection) {
        this.addParsedSection(sections, currentSection, currentContent.trim());
      }

      // Validate and clean up sections
      this.validateSections(sections);
      
      return sections;
    } catch (error) {
      console.error('Response parsing error:', error);
      throw new Error('Failed to parse generated code. Please try again.');
    }
  }

  isSectionHeader(line) {
    return line.includes('//') && (
      line.match(/VARIATION\s+\d+/i) ||
      line.includes('GLOBAL EXPERIENCE CSS') ||
      line.includes('GLOBAL EXPERIENCE JS') ||
      line.includes('VARIATION CSS') ||
      line.includes('VARIATION JAVASCRIPT')
    );
  }

  parseSectionHeader(line) {
    // Parse variation info
    const variationMatch = line.match(/VARIATION\s+(\d+)[^-]*-\s*(.+?)(?:\/\/|$)/i);
    
    if (line.includes('GLOBAL EXPERIENCE CSS')) {
      return { type: 'globalCSS' };
    } else if (line.includes('GLOBAL EXPERIENCE JS')) {
      return { type: 'globalJS' };
    } else if (variationMatch) {
      const number = parseInt(variationMatch[1]);
      const name = variationMatch[2]?.trim() || `Variation ${number}`;
      
      // Determine if this is CSS or JS section
      const isCSS = line.includes('CSS');
      const isJS = line.includes('JAVASCRIPT') || line.includes(' JS');
      
      return {
        type: 'variation',
        number,
        name,
        codeType: isCSS ? 'css' : (isJS ? 'js' : 'css') // Default to CSS
      };
    }
    
    return null;
  }

  addParsedSection(sections, sectionInfo, content) {
    if (!sectionInfo || !content) return;

    if (sectionInfo.type === 'globalCSS') {
      sections.globalCSS = this.cleanCode(content, 'css');
    } else if (sectionInfo.type === 'globalJS') {
      sections.globalJS = this.cleanCode(content, 'js');
    } else if (sectionInfo.type === 'variation') {
      let variation = sections.variations.find(v => v.number === sectionInfo.number);
      
      if (!variation) {
        variation = {
          number: sectionInfo.number,
          name: sectionInfo.name,
          css: '',
          js: ''
        };
        sections.variations.push(variation);
      } else {
        // Update name if we have more info
        variation.name = sectionInfo.name;
      }
      
      if (sectionInfo.codeType === 'css') {
        variation.css = this.cleanCode(content, 'css');
      } else {
        variation.js = this.cleanCode(content, 'js');
      }
    }
  }

  cleanCode(code, type) {
    if (!code) return '';
    
    // Remove markdown code block markers
    code = code.replace(/```(css|javascript|js)?\n?/g, '');
    code = code.replace(/```\n?/g, '');
    
    // Remove extra whitespace but preserve formatting
    code = code.trim();
    
    // Validate syntax basics
    if (type === 'css') {
      // Ensure CSS has proper structure
      if (code && !code.includes('{') && !code.includes('}')) {
        // Might be a property list, wrap it
        code = `/* Generated CSS */\n.selector {\n  ${code}\n}`;
      }
    } else if (type === 'js') {
      // Ensure JS is properly wrapped
      if (code && !code.includes('function') && !code.includes('convert')) {
        code = `// Generated JavaScript\n(function() {\n  ${code}\n})();`;
      }
    }
    
    return code;
  }

  validateSections(sections) {
    // Ensure we have at least one variation
    if (sections.variations.length === 0) {
      throw new Error('No variations were generated. Please try with more specific requirements.');
    }

    // Sort variations by number
    sections.variations.sort((a, b) => a.number - b.number);

    // Validate each variation has some content
    sections.variations.forEach(variation => {
      if (!variation.css && !variation.js) {
        console.warn(`Variation ${variation.number} has no CSS or JS content`);
      }
    });

    // Clean up empty global sections
    if (!sections.globalCSS?.trim()) {
      sections.globalCSS = '';
    }
    if (!sections.globalJS?.trim()) {
      sections.globalJS = '';
    }
  }

  // Utility method to test API connectivity
  async testConnection(authToken) {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Method to get available models
  async getAvailableModels(authToken) {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.data?.map(model => model.id) || [];
      }
      
      return [];
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatGPTAPI;
} else if (typeof window !== 'undefined') {
  window.ChatGPTAPI = ChatGPTAPI;
}