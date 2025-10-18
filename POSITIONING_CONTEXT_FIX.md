# Positioning Context Enhancement

## Problem Identified

When adding a fixed countdown banner, the AI set `body { padding-top: 52px !important; }` which **hid the navigation beneath the banner**. The navigation was not visible because the AI didn't account for existing fixed/sticky elements.

### Root Cause

The AI was **missing critical positioning data** to understand page layout:

**Missing from context:**
- `top`, `bottom`, `left`, `right` positioning values
- `zIndex` layering information
- `width`, `height` dimensions

**Impact:** AI couldn't determine:
- Whether navigation is fixed/sticky/relative
- How tall existing navigation is
- What z-index layers exist
- How much space is needed for new elements

## Solution Implemented

### 1. Enhanced CSS Context ([context-builder.js:321-354](utils/context-builder.js#L321-L354))

Added positioning properties to `extractKeyStyles()`:

```javascript
extractKeyStyles(computed) {
  return {
    // Layout
    display: computed.display,
    position: computed.position,

    // NEW: Positioning (CRITICAL for fixed/sticky/absolute elements)
    top: computed.top,
    bottom: computed.bottom,
    left: computed.left,
    right: computed.right,
    zIndex: computed.zIndex,

    // Box model
    width: computed.width,
    height: computed.height,
    padding: computed.padding,
    margin: computed.margin,
    // ... rest of styles
  };
}
```

### 2. Enhanced Element Data ([service-worker.js:1891-1919](background/service-worker.js#L1891-L1919))

Updated `compactElementData()` to include positioning in styles object:

```javascript
styles: {
  // NEW: Positioning
  position: styles.position,
  top: styles.top,
  bottom: styles.bottom,
  left: styles.left,
  right: styles.right,
  zIndex: styles.zIndex,
  // Box model
  padding: styles.padding,
  margin: styles.margin,
  display: styles.display,
  width: styles.width,    // NEW
  height: styles.height,  // NEW
  // Flex/grid/typography...
}
```

### 3. Updated Prompt Guidance ([service-worker.js:2565-2570](background/service-worker.js#L2565-L2570))

Simplified to emphasize data availability:

```
🚨 CRITICAL: NEVER MODIFY NAVIGATION OR HEADER POSITIONING 🚨
❌ NEVER add margin-top, padding-top, or top offset to: header, nav, .nav, .header, .menu
❌ NEVER move or reposition existing fixed/sticky elements
✅ When adding new fixed elements, check element database for existing position: "fixed" or "sticky" elements
✅ Each element in database now includes positioning data: position, top, bottom, height, zIndex
✅ Use this data to avoid overlapping with existing page elements
```

## What AI Can Now Do

With positioning context, the AI can:

1. **Detect fixed/sticky navigation:**
   ```json
   {
     "selector": "nav.header",
     "styles": {
       "position": "sticky",
       "top": "0px",
       "height": "80px",
       "zIndex": "1000"
     }
   }
   ```

2. **Calculate correct spacing:**
   - See that nav is sticky with height 80px
   - Create banner with height 52px
   - Set body padding-top to accommodate both: 80 + 52 + margin

3. **Avoid z-index conflicts:**
   - See existing elements with z-index: "1000"
   - Set new banner to z-index: "9999" to appear above

4. **Respect existing layouts:**
   - Detect position: "absolute" elements with specific top/left
   - Avoid interfering with their positioning
   - Understand layering hierarchy

## Expected Behavior

**Before fix:**
```css
body { padding-top: 52px !important; }
/* Navigation at 80px height gets hidden */
```

**After fix:**
```css
body { padding-top: 142px !important; } /* 80px nav + 52px banner + 10px margin */
/* Navigation remains visible below banner */
```

## Testing Steps

1. Reload extension at `chrome://extensions/`
2. Navigate to page with sticky/fixed navigation
3. Generate a fixed banner (urgency banner template)
4. Check console logs for positioning data in element context:
   ```
   styles: {
     position: "sticky",
     top: "0px",
     height: "80px",
     zIndex: "1000"
   }
   ```
5. Verify generated CSS includes proper body padding accounting for navigation
6. Confirm navigation remains visible and properly positioned

## Broad Impact

This enhancement improves AI awareness for **all scenarios** involving positioning:

- **Fixed banners** - Account for existing navigation height
- **Sticky headers** - Understand z-index layering
- **Absolute overlays** - Respect existing positioned elements
- **Modal dialogs** - Calculate proper z-index stacking
- **Dropdown menus** - Understand relative positioning context
- **Tooltips** - Position correctly relative to anchors
- **Sidebar layouts** - Account for fixed sidebars

## Files Modified

1. [utils/context-builder.js](utils/context-builder.js) - Lines 327-333
2. [background/service-worker.js](background/service-worker.js) - Lines 1893-1899, 2565-2570

## Context Additions

**New CSS properties sent to AI:**
- `top`, `bottom`, `left`, `right` - Positioning offsets
- `zIndex` - Stacking order
- `width`, `height` - Dimensions (previously partial)

**Token cost:** ~50-100 additional chars per element (minimal)

All syntax validation passed ✅
