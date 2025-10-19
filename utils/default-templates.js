/**
 * Default Experiment Templates
 * Pre-built templates for common A/B test scenarios
 */

const DEFAULT_TEMPLATES = {
  'countdown-banner-pacific': {
    id: 'countdown-banner-pacific',
    name: 'Friday Countdown Banner',
    icon: '⏰',
    description: 'Fixed countdown timer to Friday midnight Pacific Time with smart visibility',
    variations: [
      {
        name: 'Friday Countdown Banner',
        description: `Add a fixed, fully visible banner at the top that says: "Sale ends soon!"

COUNTDOWN BEHAVIOR:
- Count down to this Friday at midnight Pacific Time (handle DST automatically)
- When countdown hits zero, hide the banner (do not reset)
- If end date is in the past, do not render the banner
- If time can't be computed, fail silently without blocking page interaction

DISPLAY FORMAT:
- Use four fixed-width boxes: days, hours, minutes, seconds
- Hide the days box if the value is 0
- Each box contains the number and its label: [01d][12h][34m][56s]
- Use short labels (d, h, m, s) instead of full words
- Make the banner short with all elements side-by-side
- Ensure boxes are fixed width, accessible (ARIA live region), and legible

PAGE INTEGRATION:
- Remove any existing top sticky banners
- Keep this banner fixed at the top while scrolling
- Ensure it does not overlap navigation or core page elements under any circumstances
- Add appropriate body padding to prevent content from being hidden`
      }
    ]
  },
  'button-cta-test': {
    id: 'button-cta-test',
    name: 'Button CTA Test',
    icon: '🎯',
    description: 'Test different button colors, sizes, and text to improve click-through rates',
    variations: [
      {
        name: 'Larger Green Button',
        description: 'Increase button size by 20% and change to high-contrast green (#28a745)'
      },
      {
        name: 'Red Urgency Button',
        description: 'Change button to urgent red (#dc3545) with "Limited Time" text'
      },
      {
        name: 'Blue Trust Button',
        description: 'Professional blue (#007bff) with trust badge icon'
      }
    ]
  },
  'headline-test': {
    id: 'headline-test',
    name: 'Headline Optimization',
    icon: '📰',
    description: 'Test different headline approaches to increase engagement',
    variations: [
      {
        name: 'Benefit-Focused Headline',
        description: 'Emphasize primary benefit in headline with larger, bolder text'
      },
      {
        name: 'Question-Based Headline',
        description: 'Transform headline into a compelling question that engages visitors'
      },
      {
        name: 'Number-Driven Headline',
        description: 'Add specific numbers or statistics to headline for credibility'
      }
    ]
  },
  'urgency-banner': {
    id: 'urgency-banner',
    name: 'Urgency Banner',
    icon: '⏰',
    description: 'Add time-sensitive messaging to create urgency and drive conversions',
    variations: [
      {
        name: 'Countdown Banner',
        description: 'Add banner at top with countdown timer: "Sale ends in 24 hours!"'
      },
      {
        name: 'Limited Stock Banner',
        description: 'Add inventory scarcity message: "Only 5 items left in stock"'
      },
      {
        name: 'Flash Sale Banner',
        description: 'Prominent flash sale banner with discount percentage'
      }
    ]
  },
  'social-proof': {
    id: 'social-proof',
    name: 'Social Proof',
    icon: '⭐',
    description: 'Add testimonials, reviews, or trust indicators to build credibility',
    variations: [
      {
        name: 'Customer Testimonials',
        description: 'Add 3 customer testimonials with photos below hero section'
      },
      {
        name: 'Star Ratings',
        description: 'Add 5-star rating display with review count near product title'
      },
      {
        name: 'Trust Badges',
        description: 'Add security and payment trust badges near checkout button'
      }
    ]
  },
  'sticky-cta': {
    id: 'sticky-cta',
    name: 'Sticky CTA Button',
    icon: '📌',
    description: 'Create a persistent call-to-action that follows the user as they scroll',
    variations: [
      {
        name: 'Sticky Bottom Bar',
        description: 'Fixed CTA bar at bottom of screen with primary action button'
      },
      {
        name: 'Floating Action Button',
        description: 'Circular floating button in bottom-right corner'
      },
      {
        name: 'Sticky Header CTA',
        description: 'CTA button that appears in sticky header when scrolling'
      }
    ]
  },
  'form-optimization': {
    id: 'form-optimization',
    name: 'Form Optimization',
    icon: '📝',
    description: 'Simplify and optimize form fields to reduce friction and increase completions',
    variations: [
      {
        name: 'Multi-Step Form',
        description: 'Split long form into 3 progressive steps with progress indicator'
      },
      {
        name: 'Minimal Fields',
        description: 'Remove optional fields, keeping only email and name required'
      },
      {
        name: 'Inline Validation',
        description: 'Add real-time validation feedback with green checkmarks'
      }
    ]
  },
  'hero-redesign': {
    id: 'hero-redesign',
    name: 'Hero Section Redesign',
    icon: '🎨',
    description: 'Test different hero section layouts and content approaches',
    variations: [
      {
        name: 'Video Background',
        description: 'Replace static image with autoplay background video'
      },
      {
        name: 'Split Layout',
        description: 'Two-column layout: content on left, image/demo on right'
      },
      {
        name: 'Centered Minimal',
        description: 'Clean centered layout with single headline and CTA'
      }
    ]
  },
  'exit-intent': {
    id: 'exit-intent',
    name: 'Exit Intent Popup',
    icon: '🚪',
    description: 'Capture abandoning visitors with targeted exit-intent offers',
    variations: [
      {
        name: 'Discount Popup',
        description: 'Show 10% discount code when user moves to exit'
      },
      {
        name: 'Content Offer',
        description: 'Offer free guide/ebook download on exit intent'
      },
      {
        name: 'Survey Popup',
        description: 'Quick 1-question survey to understand exit reason'
      }
    ]
  },
  'pricing-test': {
    id: 'pricing-test',
    name: 'Pricing Display Test',
    icon: '💰',
    description: 'Test different pricing presentation strategies',
    variations: [
      {
        name: 'Annual vs Monthly',
        description: 'Emphasize annual savings with "Save 20%" badge'
      },
      {
        name: 'Tiered Pricing',
        description: 'Add comparison table with 3 pricing tiers'
      },
      {
        name: 'Anchoring Price',
        description: 'Show original price crossed out with discount price'
      }
    ]
  },
  'mobile-optimization': {
    id: 'mobile-optimization',
    name: 'Mobile UX Optimization',
    icon: '📱',
    description: 'Optimize key elements specifically for mobile visitors',
    variations: [
      {
        name: 'Tap-Friendly Buttons',
        description: 'Increase button size to 48px minimum for mobile tap targets'
      },
      {
        name: 'Simplified Mobile Nav',
        description: 'Streamline navigation menu for mobile screens'
      },
      {
        name: 'Mobile-First Hero',
        description: 'Redesign hero section with mobile-optimized layout'
      }
    ]
  }
};

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEFAULT_TEMPLATES;
}
