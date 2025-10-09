# Intelligent Context Capture System - Implementation Plan

## Problem Statement

Current system has two extremes:
- **Full page mode**: Sends 50 elements × 2000 chars = 100k chars (exceeds token limits)
- **Element selection**: Sends only 1 element (too little context for AI)

## Solution: Hierarchical Context with Proximity Scoring

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                          │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Select Element  │   OR    │   Full Page      │         │
│  └────────┬─────────┘         └────────┬─────────┘         │
└───────────┼──────────────────────────────┼──────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│              CONTEXT BUILDER (NEW)                         │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Level 1:    │  │  Level 2:    │  │  Level 3:      │  │
│  │  Primary     │  │  Proximity   │  │  Structure     │  │
│  │  (Full)      │  │  (Medium)    │  │  (Light)       │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
│         │                 │                   │            │
│         └─────────────────┴───────────────────┘            │
│                           │                                │
└───────────────────────────┼────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               HIERARCHICAL CONTEXT                           │
│  {                                                          │
│    mode: "element-focused" | "full-page",                  │
│    primary: [...],      // 1 element × 2000 chars          │
│    proximity: [...],    // 5-8 elements × 500 chars        │
│    structure: [...],    // 10-12 elements × 100 chars      │
│    metadata: {...}      // paths, colors, fonts            │
│  }                                                          │
│                                                            │
│  Total: ~5,500-11,500 chars (~1,400-2,900 tokens) ✓       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  PROMPT GENERATION                           │
│  - Formats context for AI                                   │
│  - Adds explicit instructions about focus                   │
│  - Includes visual context (screenshot)                     │
└─────────────────────────────────────────────────────────────┘
```

## Data Structure

### Element Selection Mode

```javascript
{
  mode: "element-focused",

  // LEVEL 1: Primary target (FULL detail)
  primary: [
    {
      level: "primary",
      selector: "button.hero-cta",
      tag: "button",
      text: "Get Started Now",
      innerHTML: "<span>Get Started</span><svg>...</svg>",
      attributes: { id: "cta-main", "data-track": "hero-click" },
      visual: {
        position: { x: 520, y: 340, width: 180, height: 48 },
        computedStyles: {
          backgroundColor: "#2563eb",
          color: "#ffffff",
          fontSize: "16px",
          borderRadius: "8px",
          // ... 15 key properties
        }
      },
      context: {
        parent: { selector: "div.hero-content", tag: "div" },
        section: { tag: "section", classes: ["hero", "main"] },
        path: "body > main > section.hero > div.hero-content > button.hero-cta",
        nearbyText: "Start your free trial today | No credit card required"
      }
    }
  ],

  // LEVEL 2: Proximity context (MEDIUM detail)
  proximity: [
    {
      level: "proximity",
      proximityType: "parent", // or "sibling" or "nearby"
      parentLevel: 0,           // 0 = direct parent, 1 = grandparent, etc.
      selector: "div.hero-content",
      tag: "div",
      text: "Transform your workflow...",
      visual: {
        dimensions: { width: 600, height: 400 },
        styles: {
          backgroundColor: "transparent",
          display: "flex"
        }
      }
    },
    {
      level: "proximity",
      proximityType: "sibling",
      selector: "h1.hero-heading",
      tag: "h1",
      text: "Transform your workflow",
      visual: { ... }
    },
    {
      level: "proximity",
      proximityType: "nearby",
      distance: 120, // pixels
      selector: "a.secondary-link",
      tag: "a",
      text: "Learn more",
      visual: { ... }
    }
  ],

  // LEVEL 3: Page structure (LIGHT detail)
  structure: [
    {
      level: "structure",
      selector: "header",
      tag: "header",
      role: "banner",
      id: "site-header"
    },
    {
      level: "structure",
      selector: "nav",
      tag: "nav",
      role: "navigation"
    },
    {
      level: "structure",
      selector: "section.hero",
      tag: "section",
      role: "section",
      classes: ["hero", "main"]
    }
    // ... more landmarks
  ],

  metadata: {
    url: "https://example.com",
    title: "Product Page",
    viewport: { width: 1920, height: 1080 },
    colorScheme: {
      background: "#ffffff",
      text: "#1f2937",
      primary: "#2563eb"
    },
    fontFamilies: ["Inter", "system-ui"],
    focusPath: "body > main > section.hero > div.hero-content > button.hero-cta",
    estimatedTokens: 1420
  }
}
```

### Full Page Mode

```javascript
{
  mode: "full-page",

  // LEVEL 1: Top interactive elements (15 elements, MEDIUM detail)
  primary: [
    {
      level: "primary",
      selector: "button.hero-cta",
      tag: "button",
      importance: 45, // scored by position, size, classes
      text: "Get Started",
      visual: { ... },
      // No innerHTML/outerHTML in full page mode (saves tokens)
    },
    // ... 14 more important interactive elements
  ],

  // LEVEL 2: Empty in full page mode
  proximity: [],

  // LEVEL 3: Page structure (12 landmarks)
  structure: [
    { selector: "header", tag: "header", role: "banner" },
    { selector: "nav", tag: "nav", role: "navigation" },
    // ... 10 more structural elements
  ],

  metadata: {
    // Same as element mode, but no focusPath
    estimatedTokens: 2850
  }
}
```

## Token Budget Comparison

| Mode | Level 1 | Level 2 | Level 3 | Metadata | Total Tokens |
|------|---------|---------|---------|----------|--------------|
| **Element Selection** | 1 elem × 500 tokens | 8 elem × 125 tokens | 12 elem × 25 tokens | 100 tokens | **~1,900 tokens** ✓ |
| **Full Page** | 15 elem × 125 tokens | 0 | 12 elem × 25 tokens | 100 tokens | **~2,375 tokens** ✓ |
| **Old Full Page** | 50 elem × 500 tokens | - | - | - | **~25,000 tokens** ✗ |

## Implementation Steps

### Step 1: Create ContextBuilder utility ✓ DONE
- [x] Created `/utils/context-builder.js`
- [x] Hierarchical capture methods
- [x] Proximity detection algorithm
- [x] Importance scoring

### Step 2: Integrate into content script
- [ ] Import ContextBuilder in `page-capture.js`
- [ ] Replace `buildElementDatabase()` with `ContextBuilder.buildContext()`
- [ ] Add backward compatibility layer
- [ ] Update `capturePageData()` to accept `selectedElement` parameter

### Step 3: Update sidepanel element selection
- [ ] Pass selected element to `capturePageData()`
- [ ] Update UI to show context stats (primary/proximity/structure counts)

### Step 4: Update prompt generation
- [ ] Modify `buildCodeGenerationPrompt()` in `utils/chatgpt-api.js`
- [ ] Format hierarchical context for AI
- [ ] Add explicit focus instructions when element is selected
- [ ] Include proximity context description

### Step 5: Add HTML import
- [ ] Add `<script src="../utils/context-builder.js"></script>` to manifest.json content_scripts

### Step 6: Testing
- [ ] Test element selection mode (should be ~1,900 tokens)
- [ ] Test full page mode (should be ~2,375 tokens)
- [ ] Verify AI can still generate correct code
- [ ] Compare quality vs old approach

## Prompt Format (Example)

### Element-Focused Mode

```
You are generating Convert.com A/B test code.

CONTEXT MODE: Element-Focused
The user has selected a specific element to modify. Focus primarily on this element,
but you have access to its surrounding context for better decision-making.

PRIMARY TARGET ELEMENT (focus your changes here):
{
  selector: "button.hero-cta"
  tag: "button"
  text: "Get Started Now"
  current styles: {
    backgroundColor: "#2563eb"
    color: "#ffffff"
    fontSize: "16px"
    ...
  }
  location: body > main > section.hero > div.hero-content > button.hero-cta
}

PROXIMITY CONTEXT (nearby elements for reference):
- Parent: div.hero-content (flex container)
- Sibling: h1.hero-heading "Transform your workflow"
- Nearby (120px): a.secondary-link "Learn more"
... (5 more proximity elements)

PAGE STRUCTURE (semantic landmarks):
- header (site-header)
- nav (main-navigation)
- section.hero (current section containing target)
- footer
... (8 more landmarks)

PAGE METADATA:
- Color scheme: primary #2563eb, bg #ffffff
- Fonts: Inter, system-ui
- Viewport: 1920×1080

USER REQUEST:
"Make the CTA button orange with white text and add a subtle shadow"

INSTRUCTIONS:
1. Focus changes on the PRIMARY TARGET element (button.hero-cta)
2. Use provided selector (already verified to exist)
3. Consider proximity context for visual harmony
4. Generate Convert.com compatible code (CSS + JS)
```

## Benefits

1. **Token Efficient**: 75-90% reduction vs old full-page approach
2. **Context-Aware**: AI understands element relationships
3. **Flexible**: Works for both focused and broad changes
4. **Reliable**: Uses verified selectors at all levels
5. **Scalable**: Works on simple and complex pages

## Migration Path

1. **Phase 1**: Deploy ContextBuilder alongside existing system
2. **Phase 2**: A/B test: 50% use new system, 50% use old
3. **Phase 3**: Monitor AI generation quality
4. **Phase 4**: Full cutover if quality is equal or better
5. **Phase 5**: Remove old `buildElementDatabase()` code

## Success Metrics

- [ ] Token usage: <3,000 tokens per generation
- [ ] AI accuracy: ≥95% correct selector usage
- [ ] User satisfaction: ≥ current baseline
- [ ] Performance: <500ms for context building
