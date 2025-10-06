# 🎨 Editable Code Feature - Quick Guide

## Overview
You can now **edit the generated code directly in the sidepanel** and work alongside AI to refine your experiments!

## Features

### ✏️ **Direct Code Editing**
- All code blocks are now **editable textareas**
- Edit CSS and JavaScript directly in the browser
- Changes are tracked in real-time with visual indicators

### 💾 **Save & Revert**
- **Save Changes**: Click "💾 Save Changes" to commit your edits
- **Revert**: Click "↩️ Revert" to restore the original AI-generated code
- **Visual Feedback**: Modified code blocks show a "✏️ Modified" badge and orange border

### 🤖 **Refine with AI**
- Click "🤖 Refine with AI" on any variation code block
- Describe what you want to change
- AI will update just that specific code block
- Examples:
  - "Make the button 50% larger"
  - "Change color to a darker shade of blue"
  - "Add smooth transitions"
  - "Fix any selector issues"

### 🧪 **Test Your Edits**
- Click "Preview" to see your edited code on the page
- Changes work **even if you haven't saved them yet**
- The system always uses the current textarea value

## Workflow Example

1. **Generate code** with AI as usual
2. **Review** the generated CSS/JavaScript
3. **Edit directly** in the textarea if you see issues
4. **Test immediately** by clicking "Preview"
5. **Refine with AI**:
   - Click "🤖 Refine with AI"
   - Describe the change (e.g., "Make text bolder")
   - AI updates just that code block
6. **Save your changes** when you're happy
7. **Create experiment** in Convert.com with your refined code

## Benefits

✅ **Faster iteration** - No need to regenerate entire experiments
✅ **Precise control** - Edit exactly what you want
✅ **AI assistance** - Get AI help for specific tweaks
✅ **Instant testing** - Preview changes immediately
✅ **Safety net** - Easy revert if something breaks

## Tips

- **Don't save until you're sure** - You can test unsaved edits
- **Use "Refine with AI"** for complex changes instead of manual editing
- **Save frequently** once you're happy - this makes the edited version the new "original"
- **Watch for the orange border** - It means you have unsaved changes
- **Copy code anytime** - The copy button always copies the current version

## Technical Notes

- Edited code is used for all operations (Preview, Test, Create Experiment)
- The system checks for edited versions before falling back to originals
- Even unsaved changes in textareas are used when testing
- Saving updates the underlying `generatedCode` object

Enjoy working in tandem with AI! 🚀
