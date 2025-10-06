// Element Database Builder - Runs in page context
// Extracts structured metadata about all interactive elements

function buildElementDatabase() {
  console.log('🔍 Building Element Database...');
  
  const database = {
    elements: [],
    metadata: {
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      totalElements: 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };
  
  let elementId = 0;

  // Helper: Generate primary selector
  function generateSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try unique class combination
    if (element.className && typeof element.className === 'string') {
      const classes = Array.from(element.classList)
        .filter(c => !c.match(/^(is-|has-|active|selected|hover|focus)/));
      
      if (classes.length > 0) {
        const selector = '.' + classes.join('.');
        try {
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        } catch (e) {
          // Invalid selector, continue
        }
      }
    }
    
    // Build path-based selector
    const path = [];
    let current = element;
    let depth = 0;
    
    while (current && current !== document.body && depth < 4) {
      let part = current.tagName.toLowerCase();
      
      if (current.id) {
        part += `#${current.id}`;
        path.unshift(part);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = Array.from(current.classList).slice(0, 2).filter(Boolean);
        if (classes.length) {
          part += '.' + classes.join('.');
        }
      }
      
      // Add nth-child for specificity
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(child => child.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-child(${index})`;
      }
      
      path.unshift(part);
      current = current.parentElement;
      depth++;
    }
    
    return path.join(' > ');
  }

  // Helper: Generate alternative selectors
  function generateAlternatives(element) {
    const alternatives = [];
    
    if (element.id) {
      alternatives.push(`#${element.id}`);
    }
    
    if (element.className && typeof element.className === 'string') {
      const classes = Array.from(element.classList).slice(0, 3);
      if (classes.length) {
        alternatives.push(element.tagName.toLowerCase() + '.' + classes.join('.'));
      }
    }
    
    const name = element.getAttribute('name');
    if (name) {
      alternatives.push(`[name="${name}"]`);
    }
    
    const dataAttr = Array.from(element.attributes)
      .find(attr => attr.name.startsWith('data-') && attr.value);
    if (dataAttr) {
      alternatives.push(`[${dataAttr.name}="${dataAttr.value}"]`);
    }
    
    return [...new Set(alternatives)].slice(0, 3);
  }

  // Helper: Find section context
  function findSection(element) {
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName?.toLowerCase();
      if (['header', 'nav', 'main', 'footer', 'aside', 'section'].includes(tag)) {
        return tag;
      }
      
      const id = current.id?.toLowerCase();
      if (id && (id.includes('header') || id.includes('nav') || id.includes('hero') || 
                 id.includes('footer') || id.includes('main'))) {
        return id;
      }
      
      const className = current.className?.toLowerCase();
      if (className && (className.includes('header') || className.includes('hero') || 
                        className.includes('nav') || className.includes('footer'))) {
        const match = className.match(/(header|hero|nav|footer|main)/);
        return match ? match[1] : 'body';
      }
      
      current = current.parentElement;
    }
    return 'body';
  }

  // Helper: Get nearby text for context
  function getNearbyText(element) {
    const nearby = [];
    const parent = element.parentElement;
    
    if (parent) {
      // Get text from siblings
      Array.from(parent.children).forEach(child => {
        if (child !== element) {
          const text = child.textContent?.trim().substring(0, 50);
          if (text && text.length > 5) {
            nearby.push(text);
          }
        }
      });
      
      // Get text from parent
      const parentText = parent.textContent?.trim().substring(0, 100);
      const elementText = element.textContent?.trim() || '';
      if (parentText && parentText !== elementText) {
        const context = parentText.replace(elementText, '').trim().substring(0, 50);
        if (context && context.length > 5) {
          nearby.unshift(context);
        }
      }
    }
    
    return nearby.slice(0, 3);
  }

  // Helper: Calculate importance score
  function calculateImportance(element, computed) {
    let score = 0;
    
    // Size
    const rect = element.getBoundingClientRect();
    if (rect.width > 150 || rect.height > 40) score += 2;
    if (rect.width > 200 || rect.height > 50) score += 2;
    
    // Position (above the fold is more important)
    if (rect.top < window.innerHeight) score += 3;
    if (rect.top < window.innerHeight / 2) score += 2;
    
    // Styling
    const bgColor = computed.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      score += 2;
    }
    
    const fontSize = parseInt(computed.fontSize);
    if (fontSize > 16) score += 1;
    if (fontSize > 20) score += 1;
    
    // Element type
    const tag = element.tagName.toLowerCase();
    if (tag === 'button') score += 3;
    if (tag === 'a' && element.href) score += 2;
    
    // Classes indicating importance
    const className = element.className?.toLowerCase() || '';
    if (className.includes('cta') || className.includes('primary')) score += 3;
    if (className.includes('btn') || className.includes('button')) score += 2;
    
    return Math.min(10, score);
  }

  // Helper: Categorize element
  function categorizeElement(element) {
    const tag = element.tagName.toLowerCase();
    const className = element.className?.toLowerCase() || '';
    const text = element.textContent?.toLowerCase() || '';
    
    if (className.includes('cta') || 
        (tag === 'button' && (className.includes('primary') || className.includes('main')))) {
      return 'cta';
    }
    
    if (tag === 'button' || className.includes('btn') || className.includes('button')) {
      return 'button';
    }
    
    if (tag === 'a' && element.href) {
      if (element.closest('nav')) return 'navigation';
      return 'link';
    }
    
    if (['input', 'textarea', 'select'].includes(tag)) {
      return 'form-field';
    }
    
    if (tag === 'form') {
      return 'form';
    }
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      return 'heading';
    }
    
    if (tag === 'nav' || className.includes('nav')) {
      return 'navigation';
    }
    
    return 'content';
  }

  // Helper: Get depth in DOM
  function getDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement && depth < 20) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  // Main extraction logic
  const prioritySelectors = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[onclick]',
    '.btn, .button, [class*="cta"], [class*="CTA"]',
    'h1, h2, h3, h4, h5, h6',
    'form',
    'nav a',
    '[class*="nav"]',
    'p.lead, p.intro, [class*="hero"]'
  ];

  const seen = new Set();
  
  prioritySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(element => {
        // Skip if already processed or not visible
        if (seen.has(element)) return;
        if (!element.offsetParent && element.tagName.toLowerCase() !== 'option') return;
        
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        
        seen.add(element);
        
        const computed = window.getComputedStyle(element);
        const text = element.textContent?.trim() || '';
        const tag = element.tagName.toLowerCase();
        
        // Skip elements with too much text (likely containers)
        if (text.length > 500 && !['h1', 'h2', 'h3'].includes(tag)) return;
        
        const elementData = {
          id: `el_${String(elementId++).padStart(3, '0')}`,
          selector: generateSelector(element),
          alternativeSelectors: generateAlternatives(element),
          
          type: tag,
          text: text.substring(0, 150),
          ariaLabel: element.getAttribute('aria-label') || null,
          placeholder: element.getAttribute('placeholder') || null,
          title: element.getAttribute('title') || null,
          
          visual: {
            position: {
              x: Math.round(rect.x + window.scrollX),
              y: Math.round(rect.y + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            isVisible: rect.width > 0 && rect.height > 0,
            isAboveFold: rect.top < window.innerHeight,
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            borderRadius: computed.borderRadius,
            display: computed.display
          },
          
          context: {
            section: findSection(element),
            parentTag: element.parentElement?.tagName.toLowerCase(),
            parentClass: element.parentElement?.className || null,
            nearbyText: getNearbyText(element),
            siblings: element.parentElement?.children.length || 0,
            depth: getDepth(element)
          },
          
          attributes: {
            id: element.id || null,
            name: element.getAttribute('name') || null,
            href: element.getAttribute('href') || null,
            type: element.getAttribute('type') || null,
            value: element.value || null
          },
          
          metadata: {
            interactive: ['button', 'a', 'input', 'textarea', 'select'].includes(tag),
            hasClickHandler: element.onclick !== null || element.hasAttribute('onclick'),
            importance: calculateImportance(element, computed),
            category: categorizeElement(element),
            timestamp: Date.now()
          }
        };
        
        database.elements.push(elementData);
      });
    } catch (error) {
      console.warn('Error processing selector:', selector, error);
    }
  });

  // Sort by importance
  database.elements.sort((a, b) => b.metadata.importance - a.metadata.importance);
  
  database.metadata.totalElements = database.elements.length;
  
  console.log(`✅ Element Database built: ${database.elements.length} elements`);
  
  return database;
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = buildElementDatabase;
}
