// Prompt Assistant - Helps users with better instructions and suggestions
class PromptAssistant {
  constructor() {
    this.templates = this.initializeTemplates();
  }

  initializeTemplates() {
    return {
      'cta-optimization': {
        name: 'CTA Button Optimization',
        description: 'Test different call-to-action button styles',
        icon: '🎯',
        variations: [
          {
            name: 'Bold Orange CTA',
            instructions: 'Change the CTA button to bold orange (#FF6B35) with white text, increase size by 20%, add subtle drop shadow (0 4px 6px rgba(0,0,0,0.1)), and smooth hover effect'
          },
          {
            name: 'Green Trust Signal',
            instructions: 'Make CTA green (#4CAF50) to convey trust, add small lock icon before text, include "100% Secure" badge below, increase padding by 25%'
          },
          {
            name: 'Large Centered CTA',
            instructions: 'Make CTA 50% larger, center it on the page, add animated arrow icon after text, use gradient background (linear-gradient to right, #667eea, #764ba2), white text'
          }
        ]
      },
      'hero-redesign': {
        name: 'Hero Section Redesign',
        description: 'Test different hero section layouts',
        icon: '🎨',
        variations: [
          {
            name: 'Image Left Layout',
            instructions: 'Move hero image to left side (50% width), text content on right side, improve spacing between elements, make heading 20% larger and bold'
          },
          {
            name: 'Centered Minimal',
            instructions: 'Center all hero content, white background, remove or fade background image, use larger typography (h1: 48px), add subtle animations on scroll'
          },
          {
            name: 'Split Screen',
            instructions: 'Create split-screen layout: left side solid color (#1a202c) with white text, right side has image, content vertically centered on both sides'
          }
        ]
      },
      'trust-signals': {
        name: 'Add Trust Signals',
        description: 'Increase credibility with trust elements',
        icon: '✅',
        variations: [
          {
            name: 'Security Badges',
            instructions: 'Add row of trust badges below CTA: SSL secure, money-back guarantee, verified reviews badge. Use subtle gray icons with text below'
          },
          {
            name: 'Social Proof',
            instructions: 'Add customer count ("Join 50,000+ happy customers") above headline, 5-star rating with review count near CTA, make text bold and prominent'
          },
          {
            name: 'Testimonial Integration',
            instructions: 'Insert short testimonial quote ("Best decision ever!") with customer photo and name above fold, add quotation marks styling, subtle background color'
          }
        ]
      },
      'urgency-scarcity': {
        name: 'Urgency & Scarcity',
        description: 'Create sense of urgency to drive conversions',
        icon: '⏰',
        variations: [
          {
            name: 'Countdown Timer',
            instructions: 'Add countdown timer above CTA showing "Offer ends in: 2h 34m 12s", use red color for urgency, make numbers large and bold'
          },
          {
            name: 'Limited Stock',
            instructions: 'Add "Only 3 left in stock!" badge in red near product/CTA, include small progress bar showing low inventory, make text bold'
          },
          {
            name: 'Limited Time Offer',
            instructions: 'Add banner at top: "24-Hour Flash Sale - 40% Off!", use contrasting color (red or orange), make dismissible, add subtle pulse animation'
          }
        ]
      },
      'form-optimization': {
        name: 'Form Optimization',
        description: 'Improve form conversion rates',
        icon: '📝',
        variations: [
          {
            name: 'Multi-Step Form',
            instructions: 'Convert single form to 3-step process, add progress bar at top, show only 2-3 fields per step, add "Next" and "Back" buttons'
          },
          {
            name: 'Reduced Fields',
            instructions: 'Remove optional fields, keep only essential ones (name, email), make inputs larger with more padding, add inline validation with green checkmarks'
          },
          {
            name: 'Inline Labels',
            instructions: 'Move labels inside input fields as placeholder text, use floating label animation when focused, increase input height to 50px, add icons inside inputs'
          }
        ]
      },
      'pricing-optimization': {
        name: 'Pricing Page Optimization',
        description: 'Test different pricing presentations',
        icon: '💰',
        variations: [
          {
            name: 'Highlighted Best Value',
            instructions: 'Add "Best Value" badge to middle pricing tier, make it 10% larger, add blue border glow effect, make CTA button more prominent'
          },
          {
            name: 'Monthly vs Annual',
            instructions: 'Add toggle switch to show monthly vs annual pricing, display savings amount in green ("Save $200/year"), make annual pricing default'
          },
          {
            name: 'Price Anchoring',
            instructions: 'Show original price struck through next to current price, display savings percentage in red badge ("Save 40%"), make current price larger and bold'
          }
        ]
      }
    };
  }

  getSuggestionsForElement(elementData) {
    if (!elementData) {
      return this.getGeneralSuggestions();
    }

    const tag = elementData.tag?.toLowerCase();
    const classes = elementData.classes || [];
    const text = elementData.textContent?.toLowerCase() || '';

    // Button-like elements
    if (tag === 'button' || tag === 'a' || classes.some(c => /btn|button|cta/i.test(c))) {
      return [
        'Make it 30% larger with more prominent colors',
        'Change to orange (#FF6B35) with white text and add hover animation',
        'Add subtle shadow and rounded corners for modern look',
        'Include icon (arrow, checkmark) before or after text',
        'Make it pulse or gently animate to draw attention'
      ];
    }

    // Heading elements
    if (/^h[1-6]$/.test(tag)) {
      return [
        'Make it bolder and 25% larger for more impact',
        'Change font to modern sans-serif (Inter, Roboto)',
        'Add subtle color gradient to text',
        'Improve spacing above and below',
        'Add animated underline or accent'
      ];
    }

    // Image elements
    if (tag === 'img' || tag === 'picture') {
      return [
        'Add rounded corners (border-radius: 12px) and subtle shadow',
        'Implement zoom-on-hover effect',
        'Make it full-width and add aspect ratio container',
        'Add lazy loading with fade-in animation',
        'Apply filter effects (brightness, contrast adjustments)'
      ];
    }

    // Form elements
    if (tag === 'form' || tag === 'input' || tag === 'textarea' || classes.some(c => /form|input/i.test(c))) {
      return [
        'Make input fields larger with more padding',
        'Add floating labels with smooth animation',
        'Include inline validation with success/error states',
        'Add icons inside input fields for better UX',
        'Improve spacing and visual hierarchy'
      ];
    }

    // Price/pricing elements
    if (text.includes('$') || text.includes('price') || classes.some(c => /price|pricing|cost/i.test(c))) {
      return [
        'Make price larger and bolder to stand out',
        'Add "was $X now $Y" comparison with strikethrough',
        'Include savings badge or percentage off',
        'Use color psychology (green for value, red for urgency)',
        'Add subtle pulse animation to draw attention'
      ];
    }

    return this.getGeneralSuggestions();
  }

  getGeneralSuggestions() {
    return [
      'Improve visual hierarchy and readability',
      'Add modern design elements and animations',
      'Enhance colors and contrast for better engagement',
      'Make it more mobile-responsive',
      'Add trust signals or social proof elements',
      'Optimize spacing and layout',
      'Include attention-grabbing elements',
      'Modernize typography and fonts'
    ];
  }

  enhanceVagueInstruction(instruction) {
    const lower = instruction.toLowerCase().trim();

    const enhancements = {
      'make it better': 'Improve overall visual design: enhance colors for better contrast, increase spacing for readability, modernize typography with larger fonts, add subtle animations and hover effects for better user engagement',
      
      'modernize': 'Apply contemporary design principles: use flat design with ample white space, implement modern color palette with gradients, add smooth transitions and micro-animations, ensure mobile-first responsive layout',
      
      'make it pop': 'Increase visual prominence: use bolder, more vibrant colors, increase size by 30%, add drop shadow (0 4px 12px rgba(0,0,0,0.15)), improve contrast with background, add subtle animation or gradient',
      
      'improve ux': 'Enhance user experience: improve text readability (larger fonts, better contrast), add clear hover states and focus indicators, ensure mobile responsiveness with touch-friendly sizing (44px minimum), optimize click targets and spacing',
      
      'make it stand out': 'Create strong visual contrast: use contrasting colors, increase size significantly, add border or background, implement attention-grabbing animation (pulse, glow), position prominently on page',
      
      'clean up': 'Simplify design: remove unnecessary elements, increase white space by 50%, use consistent spacing (8px grid), simplify color palette to 2-3 colors, improve visual hierarchy with size and weight',
      
      'make it professional': 'Apply professional design standards: use sophisticated color palette (blues, grays), implement consistent spacing and alignment, use professional fonts (Open Sans, Roboto), add subtle shadows and polish',
      
      'increase conversions': 'Optimize for conversions: make CTA more prominent (larger, contrasting color), add trust signals (badges, testimonials), create urgency (limited time offers), simplify user journey, add social proof elements',
      
      'test colors': 'Experiment with color variations: test primary CTA in orange (#FF6B35), green (#4CAF50), and blue (#3B82F6), ensure good contrast (4.5:1 minimum), test with and without gradients',
      
      'mobile friendly': 'Optimize for mobile devices: ensure minimum touch target size (44x44px), use responsive font sizes (16px minimum), stack elements vertically, remove horizontal scroll, test on various screen sizes'
    };

    // Check for exact matches
    if (enhancements[lower]) {
      return enhancements[lower];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(enhancements)) {
      if (lower.includes(key)) {
        return value;
      }
    }

    // If instruction is very short (< 10 chars), suggest expanding
    if (instruction.trim().length < 10) {
      return `${instruction}. Consider being more specific: What specific changes do you want? (colors, size, layout, etc.)`;
    }

    return instruction;
  }

  getExamples() {
    return {
      buttons: [
        {
          label: 'Simple Color Change',
          text: 'Change CTA button to orange (#FF6B35) with white text'
        },
        {
          label: 'Comprehensive Update',
          text: 'Make CTA 30% larger, change to green (#4CAF50), add white text, rounded corners (8px), shadow (0 4px 6px rgba(0,0,0,0.1)), and smooth hover effect that scales to 105%'
        },
        {
          label: 'With Context',
          text: 'The "Buy Now" button should be more prominent - make it larger, use urgent red color (#DC2626), add pulsing animation, and position it center-aligned below the price'
        }
      ],
      layout: [
        {
          label: 'Element Repositioning',
          text: 'Move hero image from right to left side, make it 50% width, and position text content on the right'
        },
        {
          label: 'Spacing Improvements',
          text: 'Increase spacing between all sections by 40px, add more padding inside content boxes (24px all around), improve visual breathing room'
        },
        {
          label: 'Complete Redesign',
          text: 'Convert current single-column layout to two-column grid: left side has content (60% width), right side has form (40%), add vertical divider line between'
        }
      ],
      vague: [
        {
          label: 'Vague but Works',
          text: 'Make the pricing section more eye-catching and trustworthy'
        },
        {
          label: 'Trust Building',
          text: 'Add elements that make visitors trust us more'
        },
        {
          label: 'Modernization',
          text: 'Give the page a more modern, professional look'
        }
      ]
    };
  }

  buildAIPromptWithContext(userInstruction, elementData, designFiles) {
    let prompt = '';

    // Add element context if available
    if (elementData) {
      prompt += `
TARGET ELEMENT CONTEXT:
Element: <${elementData.tag}> 
Selector: ${elementData.selector}
Current dimensions: ${Math.round(elementData.dimensions?.width)}×${Math.round(elementData.dimensions?.height)}px
Current text: "${(elementData.textContent || '').substring(0, 100)}"

`;
    }

    // Enhance vague instructions
    const enhancedInstruction = this.enhanceVagueInstruction(userInstruction);
    
    prompt += `USER INSTRUCTION:
${enhancedInstruction}

`;

    // Add design file context
    if (designFiles && designFiles.length > 0) {
      prompt += `DESIGN FILES PROVIDED: ${designFiles.length} file(s)
The design files show the desired end state. Generate code to match the design.
Focus on: colors, typography, spacing, layout, and visual hierarchy.

`;
    }

    return prompt;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptAssistant;
}
