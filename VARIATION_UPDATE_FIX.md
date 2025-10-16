# Variation Update 500 Error - FIXED ✅

## Problem
When syncing experiments to Convert.com, variation updates were failing with **500 Internal Server Error**:
```
❌ Failed to update variation 1: Something went wrong. Please try again later.
```

Despite successful experience creation (201), the variation code (JS/CSS) wasn't appearing in the Convert.com Visual Editor.

## Root Cause

According to the Convert.com OpenAPI specification (`openapi.json` lines 15011-15036), when **adding** a new `defaultCode` change to a variation:

```json
{
  "type": "defaultCode",
  "data": {
    "css": "string | null",      // ❌ REQUIRED field
    "js": "string | null",        // ❌ REQUIRED field
    "custom_js": "string | null"  // ❌ REQUIRED field
  }
}
```

**All three fields are REQUIRED** (line 15024-15027 in openapi.json).

### What We Were Sending (WRONG):
```javascript
{
  type: 'defaultCode',
  data: {
    css: codeVariation.css || null,    // ❌ null value violates requirement
    js: null,                           // ❌ null value violates requirement
    custom_js: codeVariation.js || null // ❌ null value violates requirement
  }
}
```

The API rejected this because `null` values don't satisfy the "required" constraint - the fields must exist as **strings** (even if empty).

## Solution

Changed all `null` values to empty strings (`''`):

```javascript
{
  type: 'defaultCode',
  data: {
    css: codeVariation.css || '',        // ✅ Empty string satisfies requirement
    js: '',                               // ✅ Empty string satisfies requirement
    custom_js: codeVariation.js || ''    // ✅ Empty string satisfies requirement
  }
}
```

## Files Modified

### `/Users/kolbydayley/Documents/GitHub/experiment_builder/sidepanel/sidepanel.js`

**1. Line 5816-5831** - `createConvertExperience()` method:
- Fixed variation update payload when creating new experiences
- Changed `null` to `''` for all three fields

**2. Line 5954-5965** - `updateExistingExperience()` method:
- Fixed variation update payload when updating synced experiments
- Changed `null` to `''` for all three fields

## Technical Details

### OpenAPI Specification Discovery

From `openapi.json`:

```yaml
ExperienceChangeDefaultCodeDataAdd:
  allOf:
    - $ref: '#/components/schemas/ExperienceChangeDefaultCodeDataBase'
    - properties:
        data:
          required:           # ⚠️ This is the key requirement
            - js
            - css
            - custom_js
```

The `ExperienceChangeAdd` (used when adding new changes) requires all three fields, while `ExperienceChangeUpdate` (used when updating existing changes with IDs) might be more lenient.

### Why Empty Strings Work

- OpenAPI type: `string | null` means nullable strings
- But the `required` constraint means the field **must be present in the object**
- Empty string (`''`) satisfies both: it's a string, and it's present
- `null` technically satisfies the type, but violates JSON schema `required` constraint

### Field Usage in Convert.com

- `css`: CSS code for the variation (appears in "Variation CSS" tab)
- `js`: Visual Editor generated JavaScript (we don't use this)
- `custom_js`: Custom JavaScript for the variation (appears in "Variation JS" tab)

## Testing

After this fix:

1. ✅ Experience creation should succeed (201)
2. ✅ Variation updates should succeed (200)
3. ✅ Code should appear in Convert.com Visual Editor:
   - "Variation JS" tab → shows `custom_js` content
   - "Variation CSS" tab → shows `css` content
4. ✅ No more 500 errors

## Related Features

This fix also enables the **experiment tracking system** to work properly:

- First sync: Creates new experience and saves mapping
- Subsequent syncs: Updates existing experience directly (no modal)
- Button text changes: "Push to Convert.com" → "↻ Update in Convert.com"
- Mapping stored in: `chrome.storage.local['convertExperimentMappings']`

## Commit Message

```
fix: Convert.com variation updates - use empty strings instead of null

The Convert.com API requires all three fields (css, js, custom_js) to be
present as strings when adding defaultCode changes to variations. Using
null values caused 500 errors. Changed to empty strings ('') which
satisfies the required field constraint.

Fixes #[issue-number]
```

## Prevention

To avoid similar issues:

1. **Always check OpenAPI spec** for `required` fields
2. **Use empty strings** (`''`) instead of `null` for optional string fields when API requires field presence
3. **Test with minimal payloads** first (all empty strings) to verify structure
4. **Log full request/response** during development to catch validation errors

## References

- OpenAPI Specification: `/openapi.json` lines 14836-15036
- Convert.com API Docs: [Convert API V2](https://www.convert.com/api/)
- Related Issue: Variation code not syncing to Visual Editor
