# Wrapper Container Styling Fix

## Problem Identified

The AI generated a countdown timer with boxes stacking **vertically** instead of **horizontally**.

### Root Cause

The generated code created this structure:
```html
<div id="sale-countdown-banner" style="display: flex">
  <span>Sale ends soon!</span>
  <div class="countdown-wrapper">  <!-- NO FLEX STYLING -->
    <div class="countdown-box">00d</div>
    <div class="countdown-box">00h</div>
    <div class="countdown-box">00m</div>
  </div>
</div>
```

**The CSS only styled:**
- `#sale-countdown-banner` (parent - has `display: flex`)
- `.countdown-box` (children)

**Missing:** `.countdown-wrapper { display: flex; }` - causing boxes to stack vertically (default `display: block`)

### Why It Happened

1. **Limited CSS context** - AI wasn't receiving flex layout properties (flexDirection, gap, justifyContent, alignItems)
2. **No wrapper styling guidance** - Prompt didn't emphasize that wrapper containers need explicit flex styling
3. **Flex doesn't cascade to grandchildren** - Flex on parent doesn't automatically apply to nested containers

## Solution Implemented

### 1. Enhanced CSS Context ([service-worker.js:1891-1910](background/service-worker.js#L1891-L1910))

Added flex and grid layout properties to element context:

```javascript
styles: {
  padding: styles.padding,
  margin: styles.margin,
  position: styles.position,
  display: styles.display,
  // NEW: Flex layout properties (critical for container styling)
  flexDirection: styles.flexDirection,
  flexWrap: styles.flexWrap,
  justifyContent: styles.justifyContent,
  alignItems: styles.alignItems,
  gap: styles.gap,
  // NEW: Grid layout properties
  gridTemplateColumns: styles.gridTemplateColumns,
  gridTemplateRows: styles.gridTemplateRows,
  gridGap: styles.gridGap,
  fontSize: styles.fontSize,
  fontWeight: styles.fontWeight
}
```

### 2. Added Wrapper Container Rules ([PROMPT_CRITICAL_RULES.txt:46-88](PROMPT_CRITICAL_RULES.txt#L46-L88))

Added comprehensive section with examples:

**Key Points:**
- When creating wrapper divs, style them explicitly
- Flex on parent does NOT inherit to grandchildren
- Each container level needs its own flex styling
- Countdown timer example showing WRONG vs CORRECT approach

### 3. Integrated into Main Prompt ([service-worker.js:2555-2563](background/service-worker.js#L2555-L2563))

Added Rule #13 to core generation prompt:

```
13. 🔴 WRAPPER CONTAINER STYLING - CRITICAL FOR LAYOUT:
    - When creating wrapper divs (class="wrapper", class="container", etc.), you MUST style them explicitly
    - If you want horizontal layout: .wrapper { display: flex !important; gap: 10px !important; }
    - Flex on parent does NOT inherit to grandchildren - style each level separately
    - COUNTDOWN TIMER EXAMPLE:
      ❌ WRONG: #banner { display: flex; } but NO .countdown-wrapper { display: flex; }
      ✅ CORRECT: #banner { display: flex; } AND .countdown-wrapper { display: flex; gap: 10px; }
    - Each element in "styles" field shows: display, flexDirection, gap, justifyContent, alignItems
    - ALWAYS check existing layout properties before creating new containers
```

## Expected Behavior After Fix

The AI should now generate:

```css
#sale-countdown-banner {
  display: flex !important;
  gap: 15px !important;
}

/* NEW: Explicit wrapper styling */
#sale-countdown-banner .countdown-wrapper {
  display: flex !important;
  gap: 10px !important;
}

#sale-countdown-banner .countdown-box {
  background: rgba(255,255,255,0.2) !important;
  padding: 8px 12px !important;
}
```

## Testing Steps

1. Reload extension at `chrome://extensions/`
2. Generate a countdown timer using the urgency banner template
3. Verify countdown boxes appear **horizontally** instead of vertically
4. Check console logs for flex layout properties in element context
5. Verify CSS includes styling for `.countdown-wrapper`

## Impact

- **Fixes:** Countdown timers, navigation menus, card grids, any dynamically created flex containers
- **Prevents:** Vertical stacking when horizontal layout is expected
- **Improves:** AI understanding of CSS cascade and layout inheritance
- **Context added:** 9 new CSS properties (flexDirection, gap, etc.) for better layout awareness

## Files Modified

1. [background/service-worker.js](background/service-worker.js) - Lines 1891-1910, 2555-2563
2. [PROMPT_CRITICAL_RULES.txt](PROMPT_CRITICAL_RULES.txt) - Lines 46-88

All syntax validation passed ✅
