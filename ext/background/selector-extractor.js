// Selector Extraction Phase - Dedicated to finding exact selectors
class SelectorExtractor {
  
  /**
   * Phase 1: Extract selectors from page based on user description
   * This runs BEFORE code generation to get exact selectors
   */
  async extractSelectors(pageData, userRequest, authToken, model = 'gpt-4o') {
    const prompt = this.buildSelectorExtractionPrompt(pageData, userRequest);
    
    const messages = [{
      role: 'system',
      content: 'You are a DOM selector extraction expert. Your ONLY job is to identify elements and return their exact selectors. You MUST return valid JSON.'
    }];

    // Add screenshot for visual matching
    if (pageData.screenshot) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: pageData.screenshot,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      });
    } else {
      messages.push({
        role: 'user',
        content: prompt
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for precision
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Selector extraction failed: ${response.status}`);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '{}';
    
    // Parse JSON response
    let selectors;
    try {
      selectors = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from markdown if needed
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        selectors = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse selector JSON');
      }
    }

    return {
      selectors,
      usage: result?.usage
    };
  }

  buildSelectorExtractionPrompt(pageData, userRequest) {
    // Extract all available selectors
    const selectorMatches = pageData.html.match(/<!-- Selector: ([^>]+) -->/g) || [];
    const availableSelectors = selectorMatches
      .map(match => match.replace(/<!-- Selector: (.*?) -->/, '$1'))
      .filter(Boolean);

    return `
**YOUR TASK: Extract exact DOM selectors for elements mentioned in the user's request**

You MUST:
1. Read the user's request carefully
2. Identify which elements they want to modify by looking at the screenshot
3. Find those elements in the HTML below
4. Extract their EXACT selectors from the HTML comments
5. Return ONLY a JSON object mapping element names to selectors

**USER REQUEST:**
${userRequest}

**AVAILABLE SELECTORS ON THIS PAGE:**
${availableSelectors.slice(0, 50).map((sel, i) => `${i + 1}. ${sel}`).join('\n')}

**HTML STRUCTURE:**
${pageData.html.substring(0, 30000)}

**INSTRUCTIONS:**
1. Look at the screenshot to visually identify the elements mentioned
2. Match those visual elements to the HTML structure
3. Extract the selector from the "<!-- Selector: ... -->" comment above that element
4. Return a JSON object with descriptive keys and exact selectors as values

**OUTPUT FORMAT (JSON ONLY):**
{
  "primaryCTA": "button#hero-cta",
  "headerNav": "nav.main-navigation",
  "headline": "h1.hero-title"
}

**RULES:**
- Use descriptive keys that match the element's purpose
- Values MUST be exact selectors from the HTML comments
- Do NOT make up selectors
- Do NOT use generic selectors like ".button" or "a"
- If an element has an ID, prefer the ID selector
- Return ONLY the JSON object, no other text
- If you can't find an exact selector, use the most specific one available

**RESPOND WITH JSON ONLY:**
`;
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectorExtractor;
} else if (typeof window !== 'undefined') {
  window.SelectorExtractor = SelectorExtractor;
}
