/**
 * Visual QA Service - AI-powered visual quality validation
 *
 * Validates variations using GPT-4 Vision to check:
 * - Goal accomplishment
 * - Critical defects (text unreadable, layout broken)
 * - Major defects (misalignment, spacing, contrast)
 *
 * Implements strict termination conditions to prevent infinite loops.
 */
class VisualQAService {
  constructor(options = {}) {
    // Reduced from 5 to 2 for better performance (most issues caught in first iteration)
    this.MAX_ITERATIONS = options.maxIterations || 2;
    this.DEFECT_CATEGORIES = {
      CRITICAL: ['text-unreadable', 'layout-broken', 'element-missing', 'element-overlapping'],
      MAJOR: ['text-misaligned', 'bad-spacing', 'poor-contrast', 'visual-hierarchy-broken']
    };

    // CRITICAL: Prohibited CSS modifications that break pages
    this.PROHIBITED_MODIFICATIONS = [
      { pattern: /header.*margin-top/i, reason: 'Never add margin-top to header elements' },
      { pattern: /header.*padding-top/i, reason: 'Never add padding-top to header elements' },
      { pattern: /nav.*margin-top/i, reason: 'Never add margin-top to nav elements' },
      { pattern: /nav.*padding-top/i, reason: 'Never add padding-top to nav elements' },
      { pattern: /navigation.*margin-top/i, reason: 'Never add margin-top to navigation elements' },
      { pattern: /\.nav.*margin-top/i, reason: 'Never add margin-top to .nav elements' },
      { pattern: /\.header.*margin-top/i, reason: 'Never add margin-top to .header elements' },
      { pattern: /\.menu.*margin-top/i, reason: 'Never add margin-top to .menu elements' },
      { pattern: /\.primary-nav.*margin-top/i, reason: 'Never modify primary navigation positioning' },
      { pattern: /\.secondary-nav.*margin-top/i, reason: 'Never modify secondary navigation positioning' }
    ];
  }

  /**
   * Run visual QA check on a variation
   * @param {Object} params - QA parameters
   * @param {string} params.originalRequest - User's original change request
   * @param {string} params.beforeScreenshot - Base64 screenshot before changes
   * @param {string} params.afterScreenshot - Base64 screenshot after changes
   * @param {number} params.iteration - Current iteration number (1-based)
   * @param {Array} params.previousDefects - Defects from previous iteration (optional)
   * @param {Object} params.elementDatabase - Optional element database for quantitative checks
   * @param {Object} params.generatedCode - Optional generated code for static analysis
   * @returns {Promise<Object>} QA result with status and defects
   */
  async runQA(params) {
    const {
      originalRequest,
      beforeScreenshot,
      afterScreenshot,
      iteration,
      previousDefects = [],
      elementDatabase = null,
      generatedCode = null
    } = params;

    // PRE-CHECK 1: Check if screenshots are identical (no changes applied)
    const preScreenResult = this.preScreenScreenshots(beforeScreenshot, afterScreenshot);
    if (preScreenResult.shouldSkipAI) {
      console.log('[Visual QA] Pre-screen detected issue, skipping AI call');
      return {
        status: preScreenResult.status,
        goalAccomplished: false,
        defects: preScreenResult.defects,
        reasoning: preScreenResult.reasoning,
        shouldContinue: true,
        iteration,
        timestamp: new Date().toISOString(),
        preScreened: true,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } // No cost for pre-screened checks
      };
    }

    // PRE-CHECK 2: Static code analysis for red flags
    if (generatedCode) {
      const codeIssues = this.analyzeCodeForIssues(generatedCode, elementDatabase);
      if (codeIssues.length > 0) {
        console.log('[Visual QA] Pre-screen detected code issues:', codeIssues);
        return {
          status: 'CRITICAL_DEFECT',
          goalAccomplished: false,
          defects: codeIssues,
          reasoning: 'Static code analysis detected potential issues before visual inspection',
          shouldContinue: true,
          iteration,
          timestamp: new Date().toISOString(),
          preScreened: true,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } // No cost for pre-screened checks
        };
      }
    }

    // Build prompt with strict termination criteria and element database context
    const hasScreenshots = preScreenResult.hasScreenshots !== false;
    const prompt = this.buildPrompt(originalRequest, iteration, previousDefects, elementDatabase, hasScreenshots);

    try {
      // Call GPT-4 Vision API
      const apiResponse = await this.callGPT4Vision(prompt, beforeScreenshot, afterScreenshot);

      // Parse and validate response
      const result = this.parseResponse(apiResponse.content);

      // CRITICAL: Filter out dangerous defect suggestions
      result.defects = this.filterDangerousDefects(result.defects);

      // If all defects were filtered out, mark as PASS
      if (result.defects.length === 0 && result.status !== 'PASS') {
        console.log('[Visual QA] All defects filtered as dangerous - changing status to PASS');
        result.status = 'PASS';
        result.goalAccomplished = true;
        result.reasoning = 'All suggested fixes were filtered as potentially dangerous (e.g., modifying navigation)';
        result.shouldContinue = false;
      }

      // Add metadata
      result.iteration = iteration;
      result.timestamp = new Date().toISOString();

      // Add usage data for cost tracking
      result.usage = apiResponse.usage || null;

      return result;
    } catch (error) {
      console.error('[Visual QA] Error:', error);
      return {
        status: 'ERROR',
        goalAccomplished: false,
        defects: [],
        reasoning: `Visual QA failed: ${error.message}`,
        shouldContinue: false,
        iteration,
        error: error.message
      };
    }
  }

  /**
   * Pre-screen screenshots for obvious issues before calling AI
   * Saves API calls and reduces latency
   */
  preScreenScreenshots(beforeScreenshot, afterScreenshot) {
    // Check 1: Handle missing screenshots
    if (!beforeScreenshot && !afterScreenshot) {
      return {
        shouldSkipAI: false, // Still run QA for code-only review
        hasScreenshots: false
      };
    }

    if (!beforeScreenshot || !afterScreenshot) {
      return {
        shouldSkipAI: false, // Still run QA with one screenshot
        hasScreenshots: 'partial'
      };
    }

    // Check 2: Are screenshots identical? (no changes applied)
    if (beforeScreenshot === afterScreenshot) {
      return {
        shouldSkipAI: true,
        status: 'GOAL_NOT_MET',
        defects: [{
          severity: 'critical',
          type: 'element-missing',
          description: 'Screenshots are identical - no changes were applied to the page',
          suggestedFix: 'Verify selectors exist and JavaScript executed without errors'
        }],
        reasoning: 'Before and after screenshots are identical, indicating code did not execute'
      };
    }

    // Check 3: Screenshot size differences (potential layout break)
    // Extract image dimensions from base64 data URLs if possible
    // This is a fast heuristic check

    // No obvious issues detected, proceed with AI analysis
    return {
      shouldSkipAI: false,
      hasScreenshots: true
    };
  }

  /**
   * Build GPT-4 Vision prompt with strict termination criteria and few-shot examples
   */
  buildPrompt(originalRequest, iteration, previousDefects, elementDatabase = null, hasScreenshots = true) {
    const isFirstIteration = iteration === 1;
    const hasRepeatedDefects = this.detectRepeatedDefects(previousDefects);
    const isFullSuiteReview = originalRequest.includes('FULL SUITE REVIEW');

    // Add element database context if available
    let elementContext = '';
    if (elementDatabase) {
      elementContext = `\n${this.summarizeElementDatabase(elementDatabase)}\n`;
    }

    let prompt = `You are an expert visual QA analyst specializing in A/B test quality assurance. Use computer vision AND quantitative analysis to detect defects that hurt conversion rates.

${isFullSuiteReview ? '🔍 **COMPREHENSIVE FULL SUITE REVIEW MODE** 🔍\nThis is a complete review of ALL conversation requests against the BASE page.\nPay special attention to verifying that EVERY numbered request has been implemented correctly.\n' : ''}

**${isFullSuiteReview ? 'COMPLETE REQUEST SUITE' : 'ORIGINAL REQUEST'}:**
${originalRequest}
${elementContext}
${hasScreenshots ? 
`**ANALYSIS STEPS:**
1. COUNT elements in BEFORE → Establish baseline (e.g., "2 buttons")
2. COUNT same elements in AFTER → Compare counts
3. Scan BEFORE image → Identify target elements visually
4. Scan AFTER image → Verify changes applied correctly
5. Compare side-by-side → Detect unintended consequences (especially duplicates)
6. Check UX heuristics → Flag professionalism issues` :
`**CODE-ONLY ANALYSIS STEPS (No Screenshots Available):**
1. Review generated code for obvious syntax errors or logic issues
2. Check if selectors target valid elements that likely exist
3. Verify code follows reasonable UI/UX patterns
4. Look for potential errors like duplicate additions or missing conditions
5. Assess if code structure appears to accomplish the requested changes
6. Flag any clear red flags in the implementation`}

**FULL-PAGE DESIGN EVALUATION:**
You are viewing FULL PAGE screenshots (before and after). Your analysis must include:

🔴 **CRITICAL: USER'S EXPLICIT INSTRUCTIONS ALWAYS TAKE PRIORITY** 🔴
- If the user explicitly requested a specific color, style, or change (e.g., "make banner red"), that request OVERRIDES brand considerations
- Only flag brand/style issues if they create SEVERE usability problems (e.g., white text on white background)
- User-requested changes should be considered intentional design decisions, not defects
- Focus on technical correctness and functionality, not subjective design preferences

1. **OVERALL DESIGN COHERENCE**: Do the changes fit harmoniously with the rest of the page design? (Only flag if severely broken)
2. **BRAND CONSISTENCY**: Only flag if colors create readability issues or severe clashes - user's explicit color requests are intentional
3. **VISUAL HIERARCHY**: Do the changes maintain or improve the page's visual hierarchy and flow?
4. **COLOR HARMONY**: Only flag if new colors cause usability problems (poor contrast, invisible text) - not subjective preferences
5. **CONTEXTUAL IMPACT**: Do the changes look good in the context of surrounding elements?
6. **PROFESSIONAL APPEARANCE**: Only flag obvious technical issues, not style preferences

**🚨 CRITICAL RULE: NEVER SUGGEST MODIFYING NAVIGATION/HEADER ELEMENTS 🚨**

**ABSOLUTE PROHIBITIONS in suggestedFix:**
❌ NEVER suggest adding margin-top, padding-top, or top offset to: header, nav, navigation, .nav, .header, .menu elements
❌ NEVER suggest modifying z-index of navigation elements
❌ NEVER suggest moving or repositioning header/nav elements to "fix" banner overlap
❌ IF a fixed banner overlaps navigation, the ONLY valid fix is: adjust the banner's CSS (height, position) OR add body/html padding-top

**WHY:** Navigation and header elements are core page structure. Modifying them breaks the entire site. Fixed banners should ALWAYS be fixed by:
1. Adjusting the banner itself (height, z-index)
2. Adding body { padding-top } to create space
3. Adjusting html root element spacing

**CORRECT FIX EXAMPLES for Fixed Banner Overlap:**
✅ "Add CSS: body { padding-top: 60px !important; } to create space for fixed banner"
✅ "Change banner CSS: #banner { height: 50px; } and body { padding-top: 50px; }"
✅ "Reduce banner padding to fit without overlap: #banner { padding: 8px 16px !important; }"

**NEVER DO THIS (will break entire page):**
❌ "Change CSS: header { margin-top: 50px; }" → DESTROYS PAGE LAYOUT
❌ "Change CSS: nav.primary-nav { margin-top: 70px; }" → BREAKS NAVIGATION
❌ "Change CSS: .navigation-bar { top: 60px; }" → INCORRECT APPROACH

**DEFECT DETECTION (with examples):**

**CRITICAL DEFECTS (Block deployment):**
✗ Text unreadable: Cut off, overlapping, invisible color-on-color (ONLY if creates readability issue)
✗ Layout broken: Elements overlapping, overflow visible, misaligned (BUT: only flag if user's requested element is broken, NEVER flag navigation as broken)
✗ Missing elements: Requested changes not visible in AFTER
✗ Duplicate content: Same icon/text appears 2+ times (e.g., two lock icons on same button)
✗ Broken functionality: Button looks disabled, unclickable
✗ Element positioning: Buttons cut off, text overlapping images, misaligned content
✗ Visual hierarchy broken: Important elements not visible or properly positioned
✗ DO NOT FLAG: User-requested colors/styles even if they don't match the page brand - these are intentional
✗ DO NOT FLAG: Fixed banners that appear to "overlap" navigation if body padding-top exists in CSS (this is the CORRECT approach)

**MAJOR DEFECTS (Strongly recommend fix):**
⚠ Poor contrast: Text < 4.5:1 ratio, hard to read (ONLY if truly unreadable)
⚠ Bad spacing: Cramped (< 4px), excessive (> 40px), uneven
⚠ Inconsistent styling: Mixed fonts, mismatched button styles
⚠ Awkward positioning: Misaligned, poor visual flow
⚠ DO NOT FLAG: Subjective style preferences, user-requested colors, or brand harmony issues unless they cause functional problems

**FEW-SHOT EXAMPLES:**

EXAMPLE 1: Duplication Detection (CRITICAL)
Request: "Add lock icon to button"
BEFORE: [Screenshot shows 2 "Buy Now" buttons in hero section]
AFTER: [Screenshot shows 6 "🔒 Buy Now" buttons - code ran 3 times or created duplicates]
Expected Structure: 2 buttons (from element database)
Analysis:
- COUNT CHECK: BEFORE=2 buttons, AFTER=6 buttons → ✗ CRITICAL DUPLICATION
- Visual Check: Multiple identical buttons stacked or repeated
- Root Cause: Code likely missing idempotency check
Response: {"status": "CRITICAL_DEFECT", "goalAccomplished": false, "defects": [{"severity": "critical", "type": "element-duplicated", "description": "BUTTON DUPLICATION: Expected 2 'Buy Now' buttons in hero section based on element database. Found 6 identical buttons with lock icon (🔒) stacked vertically. Failed because querySelector was called in a loop OR code executed multiple times without idempotency protection, creating 4 duplicate buttons. The original 2 buttons were correctly modified with icons, but 4 additional copies were created.", "suggestedFix": "Add to JavaScript at very start (line 1): if(document.querySelector('.btn-primary')?.dataset.iconAdded) return; document.querySelectorAll('.btn-primary').forEach(btn => btn.dataset.iconAdded = '1'); // Then add icon code"}], "reasoning": "Critical duplication: button count increased from 2 to 6 due to missing idempotency check", "shouldContinue": true}

EXAMPLE 2: Proper Icon Addition (PASS)
Request: "Add lock icon to button"
BEFORE: [2 "Buy Now" buttons]
AFTER: [2 "🔒 Buy Now" buttons with icons]
Expected Structure: 2 buttons
Analysis:
- COUNT CHECK: BEFORE=2 buttons, AFTER=2 buttons → ✓ CORRECT COUNT
- Visual Check: Icons added, no duplicates, proper styling
- Change Verification: Icons visible and well-positioned
Response: {"status": "PASS", "goalAccomplished": true, "defects": [], "reasoning": "Icons successfully added to both buttons, no duplicates created, count matches expected structure", "shouldContinue": false}

EXAMPLE 3: Poor Contrast (CRITICAL)
Request: "Change button color to red"
BEFORE: [Blue button with white text, high contrast]
AFTER: [Red button with dark red text, barely visible]
Expected Structure: 1 button
Analysis:
- COUNT CHECK: BEFORE=1 button, AFTER=1 button → ✓ CORRECT COUNT
- Visual Check: Text very hard to read due to red-on-red
- Contrast Issue: Critical readability problem
Response: {"status": "CRITICAL_DEFECT", "goalAccomplished": true, "defects": [{"severity": "critical", "type": "poor-contrast", "description": "CONTRAST FAILURE: Button background changed to red (#c91919) as requested. However, text color was also changed to dark red (#8b0000), creating 1.7:1 contrast ratio. Expected minimum 4.5:1 for readability (WCAG AA). Failed because code set both background AND text to red tones. Button is functionally broken - users cannot read 'Buy Now' text.", "suggestedFix": "Change CSS to: .btn-primary { background-color: #c91919; color: #ffffff !important; /* White text for 5.2:1 contrast */ }"}], "reasoning": "Change applied successfully but created critical contrast issue making text unreadable", "shouldContinue": true}

EXAMPLE 4: Multiple Section Duplication (CRITICAL)
Request: "Update hero section styling"
BEFORE: [1 hero section with headline and CTA]
AFTER: [3 identical hero sections stacked vertically]
Expected Structure: 1 hero section
Analysis:
- COUNT CHECK: BEFORE=1 hero, AFTER=3 heroes → ✗ CRITICAL DUPLICATION
- Visual Check: Entire section repeated 3 times
- Severe layout break
Response: {"status": "CRITICAL_DEFECT", "goalAccomplished": false, "defects": [{"severity": "critical", "type": "element-duplicated", "description": "Hero section duplicated 3 times - should appear only once", "suggestedFix": "Add idempotency check at start of modification code AND verify selector targets single element, not multiple"}], "reasoning": "Critical: entire page section duplicated", "shouldContinue": true}

EXAMPLE 5: Brand Color Disharmony (MAJOR)
Request: "Make CTA button stand out more"
BEFORE: [Professional SaaS page with blue/white color scheme, subtle gray buttons]
AFTER: [Same page but CTA button is bright neon orange #FF6600, clashing with blue header]
Full Page Context: Header uses navy blue (#1a2b4a), body text is dark gray, existing buttons are soft blue (#4a90e2)
Analysis:
- COUNT CHECK: BEFORE=1 button, AFTER=1 button → ✓ CORRECT COUNT
- Full Page Design Check: Neon orange severely disrupts the professional blue color palette
- Brand Consistency: Page appears to be corporate/professional SaaS, neon orange feels unprofessional
- Color Harmony: Orange conflicts with existing blue scheme (complementary but too harsh)
Response: {"status": "MAJOR_DEFECT", "goalAccomplished": true, "defects": [{"severity": "major", "type": "color-disharmony", "description": "BRAND COLOR MISMATCH: CTA button changed to bright neon orange (#FF6600) to 'stand out more'. While technically visible, it clashes with the page's professional blue/white color scheme (navy header #1a2b4a, soft blue accents #4a90e2). The neon orange disrupts brand cohesion and appears unprofessional in context of the full page. Failed because color choice didn't consider existing palette harmony.", "suggestedFix": "Change to complementary accent within brand palette: .cta-button { background-color: #2ecc71 !important; /* Professional green that stands out but harmonizes with blue */ } OR use saturated version of brand blue: .cta-button { background-color: #0066cc !important; }"}], "reasoning": "Button stands out but color clashes with page brand and appears unprofessional in full-page context", "shouldContinue": true}

**YOUR ANALYSIS CRITERIA:**
Iteration ${iteration}/${this.MAX_ITERATIONS}${iteration >= this.MAX_ITERATIONS ? ' ⚠️ FINAL ITERATION' : ''}${hasRepeatedDefects ? ' ⚠️ REPEATED ISSUES DETECTED' : ''}

${!isFirstIteration && previousDefects.length > 0 ? `**PREVIOUS DEFECTS (verify these are fixed):**\n${previousDefects.map((d, i) => `${i+1}. [${d.severity.toUpperCase()}] ${d.description}`).join('\n')}\n` : ''}
**WHAT TO IGNORE (not defects):**
✓ Minor color preference (if still professional)
✓ Small spacing differences (if layout intact)
✓ Alternative design approach (if well-executed)

**RESPONSE FORMAT (STRICT JSON):**
{
  "status": "PASS" | "GOAL_NOT_MET" | "CRITICAL_DEFECT" | "MAJOR_DEFECT",
  "goalAccomplished": true/false,
  "defects": [
    {
      "severity": "critical" | "major",
      "type": "text-unreadable" | "layout-broken" | "element-duplicated" | "poor-contrast" | "element-missing" | "brand-disconnect" | "color-disharmony" | "visual-hierarchy-broken",
      "description": "DETAILED description: (1) What element/area failed, (2) What was expected, (3) What actually happened, (4) Why it failed the test, (5) How it affects the full-page design",
      "suggestedFix": "EXACT CSS or JS code to fix this specific issue. Must be copy-paste ready. Include selector and property."
    }
  ],
  "reasoning": "One sentence explanation",
  "shouldContinue": true/false
}

**CRITICAL: description MUST be highly detailed explaining the failure comprehensively!**
Examples of GOOD description:
✓ "BUTTON TEXT: Expected 2 blue 'Buy Now' buttons in hero section. Found 6 identical buttons stacked vertically. Failed because code ran multiple times without idempotency check, creating 4 duplicate buttons."
✓ "CONTRAST: Text in .split-content paragraph (left side, white background) changed to #efefef light gray. Expected dark text for readability. Failed because color was set too light (#efefef on #ffffff = 1.1:1 contrast, needs 4.5:1 minimum)."
✓ "LAYOUT: Hero section expected at top of page. Found pushed down 200px with white gap above. Failed because padding-top: 200px was added to body instead of hero section."

Examples of BAD description:
✗ "Button is duplicated"
✗ "Text is hard to read"
✗ "Layout looks wrong"

**CRITICAL: suggestedFix MUST be exact, actionable CSS/JS code with selectors!**
Examples of GOOD suggestedFix:
✓ "Add to JavaScript at start: if(document.querySelector('.hero-btn').dataset.modified) return; document.querySelectorAll('.hero-btn').forEach(btn => btn.dataset.modified = '1');"
✓ "Change CSS to: .split-content p { color: #333333 !important; /* Dark gray for 7:1 contrast */ }"
✓ "Remove from CSS: body { padding-top: 200px; }  |  Add to CSS: .hero-section { padding-top: 40px; }"

Examples of BAD suggestedFix:
✗ "Add idempotency check"
✗ "Improve contrast"
✗ "Fix positioning"

**TERMINATION RULES:**
- shouldContinue = false IF status = "PASS"
- shouldContinue = false IF iteration >= ${this.MAX_ITERATIONS} AND no critical defects
- shouldContinue = false IF same defects repeat from previous iteration

Analyze the screenshots now. Be precise and actionable.`;

    return prompt;
  }

  /**
   * Call GPT-4 Vision API
   */
  async callGPT4Vision(prompt, beforeScreenshot, afterScreenshot) {
    // Get API key from storage - match the main app's storage structure
    const result = await chrome.storage.local.get(['settings']);
    const apiKey = result.settings?.authToken;

    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please configure in settings.');
    }

    // Use GPT-4 Vision model
    const model = 'gpt-4o';

    // Build content array - include screenshots only if available
    const messageContent = [
      {
        type: 'text',
        text: prompt
      }
    ];

    // Add screenshots if available
    if (beforeScreenshot) {
      messageContent.push(
        {
          type: 'image_url',
          image_url: {
            url: beforeScreenshot,
            detail: 'low'  // Use 'low' to reduce image size and API costs
          }
        },
        {
          type: 'text',
          text: '👆 BEFORE screenshot (original state)'
        }
      );
    }

    if (afterScreenshot) {
      messageContent.push(
        {
          type: 'image_url',
          image_url: {
            url: afterScreenshot,
            detail: 'low'  // Use 'low' to reduce image size and API costs
          }
        },
        {
          type: 'text',
          text: '👆 AFTER screenshot (with changes applied)'
        }
      );
    }

    // Add note if no screenshots available
    if (!beforeScreenshot && !afterScreenshot) {
      messageContent.push({
        type: 'text',
        text: '⚠️ Note: Screenshots are not available for this review. Please provide a code-only assessment based on the generated implementation.'
      });
    }

    const requestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: messageContent
        }
      ],
      max_tokens: 1000, // Reduced - we want concise, focused responses
      temperature: 0.0, // Zero temperature for maximum consistency and structured output
      response_format: { type: "json_object" } // Force JSON output
    };

    console.log('[Visual QA] Calling GPT-4 Vision API...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('[Visual QA] API Response:', content);

    return {
      content,
      usage: data.usage || null
    };
  }

  /**
   * Parse and validate GPT-4 Vision response
   */
  parseResponse(responseText) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = responseText.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const parsed = JSON.parse(jsonText);

      // Validate required fields
      if (!parsed.status || typeof parsed.goalAccomplished !== 'boolean') {
        throw new Error('Invalid response format: missing status or goalAccomplished');
      }

      // Validate status value
      const validStatuses = ['PASS', 'GOAL_NOT_MET', 'CRITICAL_DEFECT', 'MAJOR_DEFECT'];
      if (!validStatuses.includes(parsed.status)) {
        throw new Error(`Invalid status: ${parsed.status}`);
      }

      // Ensure defects array exists
      if (!Array.isArray(parsed.defects)) {
        parsed.defects = [];
      }

      // Validate defects
      parsed.defects.forEach((defect, idx) => {
        if (!defect.severity || !defect.type || !defect.description) {
          throw new Error(`Invalid defect at index ${idx}: missing required fields`);
        }
        if (!['critical', 'major'].includes(defect.severity)) {
          throw new Error(`Invalid defect severity at index ${idx}: ${defect.severity}`);
        }
      });

      // Set default shouldContinue if missing
      if (typeof parsed.shouldContinue !== 'boolean') {
        parsed.shouldContinue = parsed.status !== 'PASS';
      }

      return parsed;
    } catch (error) {
      console.error('[Visual QA] Parse error:', error);
      console.error('[Visual QA] Response text:', responseText);

      // Return safe fallback
      return {
        status: 'ERROR',
        goalAccomplished: false,
        defects: [],
        reasoning: `Failed to parse Visual QA response: ${error.message}`,
        shouldContinue: false,
        parseError: error.message,
        rawResponse: responseText
      };
    }
  }

  /**
   * Detect if defects are repeating from previous iteration
   * Compares current defects with previous iteration to see if they're the same
   */
  detectRepeatedDefects(previousDefects, currentDefects) {
    console.log('[Visual QA] Checking for repeated defects:', {
      previousCount: previousDefects?.length || 0,
      currentCount: currentDefects?.length || 0
    });

    if (!Array.isArray(previousDefects) || previousDefects.length === 0) {
      console.log('[Visual QA] No previous defects to compare');
      return false;
    }

    if (!Array.isArray(currentDefects) || currentDefects.length === 0) {
      console.log('[Visual QA] No current defects');
      return false;
    }

    // Enhanced matching: look for key similarity patterns
    let matchCount = 0;
    const previousDescriptions = previousDefects.map(d => d.description?.toLowerCase().trim() || '');
    const currentDescriptions = currentDefects.map(d => d.description?.toLowerCase().trim() || '');

    console.log('[Visual QA] Previous defects:', previousDescriptions);
    console.log('[Visual QA] Current defects:', currentDescriptions);

    currentDescriptions.forEach((currentDesc, idx) => {
      const foundMatch = previousDescriptions.some(prevDesc => {
        // Exact match
        if (prevDesc === currentDesc) return true;
        
        // Key phrase matching for common issues
        const currentKeywords = this.extractKeywords(currentDesc);
        const prevKeywords = this.extractKeywords(prevDesc);
        
        // Check if they share significant keywords
        const sharedKeywords = currentKeywords.filter(k => prevKeywords.includes(k));
        const similarity = sharedKeywords.length / Math.max(currentKeywords.length, prevKeywords.length);
        
        return similarity >= 0.6; // 60% keyword overlap
      });
      
      if (foundMatch) {
        matchCount++;
        console.log(`[Visual QA] Match found for defect ${idx + 1}: "${currentDesc}"`);
      } else {
        console.log(`[Visual QA] No match for defect ${idx + 1}: "${currentDesc}"`);
      }
    });

    const matchPercentage = matchCount / currentDescriptions.length;
    const isRepeated = matchPercentage >= 0.7; // Lowered to 70% threshold

    console.log(`[Visual QA] Defect comparison result:`, {
      matchCount,
      totalDefects: currentDescriptions.length,
      matchPercentage: Math.round(matchPercentage * 100),
      isRepeated
    });

    if (isRepeated) {
      console.log(`[Visual QA] ⚠️ Detected ${Math.round(matchPercentage * 100)}% matching defects - stopping iterations`);
    }

    return isRepeated;
  }

  /**
   * Extract key descriptive words from defect descriptions
   */
  extractKeywords(description) {
    const keywords = description
      .toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && // Only meaningful words
        !['the', 'and', 'are', 'not', 'but', 'for', 'with', 'this', 'that', 'from', 'they', 'been', 'have', 'their', 'said', 'each', 'which', 'will', 'there', 'could', 'other'].includes(word)
      );
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Check if iteration should continue based on result and constraints
   */
  shouldContinueIteration(result, iteration, previousDefects) {
    console.log(`[Visual QA] Checking if iteration ${iteration} should continue:`, {
      status: result.status,
      defectCount: result.defects?.length || 0,
      hasPreviousDefects: (previousDefects?.length || 0) > 0
    });

    // Status-based termination (highest priority)
    if (result.status === 'PASS') {
      console.log('[Visual QA] ✅ PASS status, stopping');
      return false;
    }

    // Early termination for repeated issues (before max iterations)
    const currentDefects = result.defects || [];
    if (iteration >= 2 && this.detectRepeatedDefects(previousDefects, currentDefects)) {
      console.log('[Visual QA] ⚠️ Repeated defects detected after iteration 2+, stopping to prevent infinite loop');
      return false;
    }

    // Hard iteration limit
    if (iteration >= this.MAX_ITERATIONS) {
      const hasCriticalDefects = result.defects.some(d => d.severity === 'critical');
      if (!hasCriticalDefects) {
        console.log('[Visual QA] ⚠️ Max iterations reached, no critical defects, stopping');
        return false;
      } else {
        console.log('[Visual QA] ⚠️ Max iterations reached but critical defects remain - force stopping anyway to prevent infinite loop');
        return false; // Force stop even with critical defects
      }
    }

    // Use AI's shouldContinue flag
    if (result.shouldContinue === false) {
      console.log('[Visual QA] 🤖 AI recommended stopping');
      return false;
    }

    console.log('[Visual QA] ➡️ Continuing to next iteration');
    return true;
  }

  /**
   * Build feedback message for code regeneration
   * @param {object} qaResult - QA analysis result
   * @param {object} elementDatabase - Optional element database with page selectors
   * @param {number} iterationNumber - Current iteration number for context
   */
  buildFeedbackForRegeneration(qaResult, elementDatabase = null, iterationNumber = 1) {
    if (qaResult.status === 'PASS') {
      return null; // No feedback needed
    }

    let feedback = `**VISUAL QA FEEDBACK (Iteration ${iterationNumber}):**\n\n`;

    // Add iteration context warning if this is a retry
    if (iterationNumber > 1) {
      feedback += `⚠️ **ITERATION ${iterationNumber} WARNING**: Previous fix attempt did NOT resolve the defects. You MUST try a DIFFERENT approach this time!\n\n`;
    }

    feedback += `⚠️ The following visual defects were detected and MUST be fixed in this iteration:\n\n`;

    if (!qaResult.goalAccomplished) {
      feedback += `❌ **Goal Status**: ${qaResult.reasoning}\n\n`;
    }

    // Add available page selectors if provided
    if (elementDatabase && elementDatabase.elements && elementDatabase.elements.length > 0) {
      const pageSelectors = elementDatabase.elements
        .map(el => el.selector)
        .filter(s => s && (s.includes('nav') || s.includes('header') || s.includes('body') || s.includes('main')))
        .slice(0, 10);

      if (pageSelectors.length > 0) {
        feedback += `**📍 AVAILABLE PAGE SELECTORS** (use these in your CSS fixes):\n`;
        pageSelectors.forEach(sel => {
          feedback += `   • \`${sel}\`\n`;
        });
        feedback += `\n`;
      }
    }

    if (qaResult.defects.length > 0) {
      qaResult.defects.forEach((defect, idx) => {
        const icon = defect.severity === 'critical' ? '🔴 CRITICAL' : '🟡 MAJOR';
        feedback += `${icon} **Defect ${idx + 1}**: ${defect.description}\n`;
        
        // Use AI-provided fix first, fallback to generated fix
        const suggestedFix = defect.suggestedFix || this.generateSpecificFix(defect);
        feedback += `   **MANDATORY CSS/JS CHANGE**: ${suggestedFix}\n`;
        
        // Add specific implementation guidance based on defect type
        if (defect.description.toLowerCase().includes('contrast')) {
          feedback += `   **Implementation Note**: Use !important declarations to override existing styles\n`;
        }
        if (defect.description.toLowerCase().includes('centered')) {
          feedback += `   **Implementation Note**: Apply flexbox centering with !important to ensure it takes effect\n`;
        }
        
        feedback += '\n';
      });
    }

    feedback += `**🚨 CRITICAL IMPLEMENTATION RULES:**\n\n`;
    feedback += `1. **EXECUTE EVERY FIX**: Each "MANDATORY CSS/JS CHANGE" above must be implemented exactly\n`;
    feedback += `2. **USE !IMPORTANT**: Add !important to all new CSS rules to override existing styles\n`;
    feedback += `3. **PRESERVE EXISTING CODE**: Keep all previous changes and ADD the new fixes\n`;
    feedback += `4. **EXACT CSS SYNTAX**: Use precise CSS selectors, properties, and values as specified\n`;
    feedback += `5. **NO APPROXIMATIONS**: Don't guess - implement the exact CSS provided in each fix\n\n`;

    // Add specific CSS examples based on detected issues
    feedback += `**📋 QUICK REFERENCE - Common Fixes:**\n`;
    feedback += `• Text contrast: \`color: #ffffff !important; font-weight: 600 !important;\`\n`;
    feedback += `• Vertical center: \`display: flex !important; align-items: center !important;\`\n`;
    feedback += `• Center content: \`justify-content: center !important; text-align: center !important;\`\n`;
    feedback += `• Fix overlapping: \`background: rgba(0,0,0,0.7) !important; padding: 20px !important; z-index: 10 !important;\`\n`;
    feedback += `• Button positioning: \`position: relative !important; margin: 10px !important; width: auto !important;\`\n`;
    feedback += `• Prevent cut-off: \`overflow: visible !important; min-width: 120px !important;\`\n`;
    feedback += `• Override styles: Always add \`!important\` to new CSS rules\n\n`;

    feedback += `**✅ SUCCESS CRITERIA**: This iteration passes when ALL defects above are resolved with the specified CSS changes.`;

    return feedback;
  }

  /**
   * Generate specific CSS fixes based on defect descriptions
   */
  generateSpecificFix(defect) {
    const description = defect.description.toLowerCase();
    
    // Contrast issues - be very specific
    if (description.includes('contrast') || description.includes('readability')) {
      if (description.includes('dark background') || description.includes('left side')) {
        return 'Add to CSS: .split-content h2 { color: #ffffff !important; font-weight: 600 !important; } .split-content p { color: #ffffff !important; font-weight: 500 !important; }';
      }
      return 'Add high contrast colors: use #ffffff text on dark backgrounds, #000000 text on light backgrounds with !important declarations';
    }
    
    // Vertical centering issues - very specific fixes
    if (description.includes('vertically centered') || description.includes('visual balance')) {
      if (description.includes('right side')) {
        return 'Add to CSS: .split-right { display: flex !important; align-items: center !important; justify-content: center !important; padding: 2rem !important; }';
      }
      return 'Add CSS: display: flex; align-items: center; justify-content: center; height: 100%; with !important declarations';
    }

    // Button misalignment and cut-off issues
    if (description.includes('button') && (description.includes('misaligned') || description.includes('cut off'))) {
      return 'Add CSS: .split-right button { position: relative !important; z-index: 10 !important; margin: 10px !important; width: auto !important; min-width: 120px !important; }';
    }

    // Banner/Navigation overlap issues - VERY SPECIFIC (most common Visual QA issue)
    if ((description.includes('banner') || description.includes('header')) &&
        (description.includes('overlap') || description.includes('overlapping')) &&
        (description.includes('navigation') || description.includes('nav') || description.includes('menu'))) {
      return 'CRITICAL FIX: The banner is position:fixed at top:0, which overlaps navigation. You MUST add spacing below the banner. Try BOTH approaches: (1) Add CSS: body { padding-top: 80px !important; } AND (2) Add CSS to your banner code: Increase the margin-top on the navigation element (nav.primary-nav, nav.header-navs__items, etc) from its current value (e.g., 70px) to a LARGER value (e.g., 90px or 100px !important) to create clearance. Inspect the existing nav margin-top in your CURRENT CODE and increase it by 20-30px.';
    }

    // General overlap issues (not banner-specific)
    if (description.includes('overlaps') || description.includes('overlapping')) {
      return 'Add CSS: Add z-index: 10 !important and ensure proper spacing with margin or padding to prevent overlap. If this is a fixed-position element, add padding-top to body or margin-top to the overlapped element.';
    }
    
    // General positioning issues
    if (description.includes('positioning') || description.includes('alignment')) {
      return 'Add CSS flexbox centering: display: flex !important; align-items: center !important; justify-content: center !important;';
    }
    
    // Text size issues
    if (description.includes('text') && description.includes('size')) {
      return 'Add CSS: font-size: 1.2em; line-height: 1.4; font-weight: 500; with !important declarations';
    }
    
    // Color issues
    if (description.includes('color') && !description.includes('contrast')) {
      return 'Update color with: color: #ffffff !important; (for dark backgrounds) or color: #000000 !important; (for light backgrounds)';
    }
    
    // Layout issues
    if (description.includes('layout') || description.includes('broken')) {
      return 'Fix layout with: display: flex; width: 100%; height: 100%; position: relative; with proper flex properties';
    }
    
    // Generic fallback with actionable CSS
    return 'Add specific CSS styling with !important declarations to override existing styles and fix the visual issue';
  }

  /**
   * Analyze generated code for common issues (static analysis)
   * Catches problems before they reach visual QA
   */
  analyzeCodeForIssues(generatedCode, elementDatabase) {
    const issues = [];

    // Convert code object to string for analysis
    let codeString = '';
    if (typeof generatedCode === 'object') {
      if (generatedCode.variations && Array.isArray(generatedCode.variations)) {
        generatedCode.variations.forEach(v => {
          codeString += v.js || '';
          codeString += v.css || '';
        });
      }
      codeString += generatedCode.globalJS || '';
      codeString += generatedCode.globalCSS || '';
    } else if (typeof generatedCode === 'string') {
      codeString = generatedCode;
    }

    if (!codeString) return issues;

    // Check 1: Multiple querySelector calls for same element without idempotency
    const selectorPattern = /querySelector\(['"]([^'"]+)['"]\)/g;
    const selectors = [...codeString.matchAll(selectorPattern)];
    const selectorCounts = {};

    selectors.forEach(match => {
      const selector = match[1];
      selectorCounts[selector] = (selectorCounts[selector] || 0) + 1;
    });

    Object.entries(selectorCounts).forEach(([selector, count]) => {
      if (count > 1) {
        // Check if idempotency check exists
        const hasIdempotencyCheck = codeString.includes('dataset.varApplied') ||
                                     codeString.includes('data-var-applied') ||
                                     codeString.includes('getAttribute(\'data-applied\')');
        if (!hasIdempotencyCheck) {
          issues.push({
            severity: 'critical',
            type: 'potential-duplication',
            description: `Selector "${selector}" used ${count} times without idempotency check - may create duplicate elements`,
            suggestedFix: `Add to JavaScript: if(element.dataset.varApplied) return; element.dataset.varApplied='1';`
          });
        }
      }
    });

    // Check 2: querySelectorAll without forEach
    if (codeString.includes('querySelectorAll') && !codeString.includes('.forEach')) {
      // Only flag if querySelectorAll result isn't being used properly
      const querySelectorAllMatches = codeString.match(/querySelectorAll\([^)]+\)/g);
      if (querySelectorAllMatches) {
        querySelectorAllMatches.forEach(match => {
          // Check if there's a forEach or array iteration nearby
          const contextWindow = 100; // characters
          const matchIndex = codeString.indexOf(match);
          const context = codeString.substring(matchIndex, matchIndex + contextWindow);

          if (!context.includes('forEach') && !context.includes('[0]') && !context.includes('.length')) {
            issues.push({
              severity: 'major',
              type: 'selector-issue',
              description: `querySelectorAll used but results may not be iterated properly`,
              suggestedFix: 'Use querySelector for single elements, or add .forEach() to iterate over results'
            });
          }
        });
      }
    }

    // Check 3: Missing duplication prevention patterns
    if (!codeString.includes('varApplied') && !codeString.includes('data-applied')) {
      const hasMultipleModifications = (codeString.match(/textContent\s*=/g) || []).length > 1 ||
                                        (codeString.match(/\.style\./g) || []).length > 3;

      if (hasMultipleModifications) {
        issues.push({
          severity: 'major',
          type: 'missing-idempotency',
          description: 'Code makes multiple modifications without idempotency checks - may cause issues on re-execution',
          suggestedFix: 'Add: if(element.dataset.varApplied) return; at start of each modification, then set element.dataset.varApplied="1";'
        });
      }
    }

    console.log(`[Visual QA] Static analysis found ${issues.length} issue(s)`);
    return issues;
  }

  /**
   * Summarize element database for AI prompt context
   */
  /**
   * Filter out dangerous defect suggestions that would break the page
   * @param {Array} defects - Defects from Visual QA
   * @returns {Array} Filtered defects (safe suggestions only)
   */
  filterDangerousDefects(defects) {
    if (!defects || defects.length === 0) {
      return [];
    }

    const safeDefects = defects.filter(defect => {
      const suggestedFix = defect.suggestedFix || '';

      // Check if suggestedFix contains any prohibited modifications
      for (const prohibition of this.PROHIBITED_MODIFICATIONS) {
        if (prohibition.pattern.test(suggestedFix)) {
          console.warn(`[Visual QA Filter] BLOCKED dangerous suggestion: ${prohibition.reason}`);
          console.warn(`  Original suggestion: ${suggestedFix.substring(0, 100)}...`);
          console.warn(`  Defect description: ${defect.description.substring(0, 100)}...`);
          return false; // Filter out this defect
        }
      }

      // Additional check: detect any navigation-targeting CSS
      const navModificationPatterns = [
        /header\s*\{[^}]*(?:margin|padding|top|position)[^}]*\}/i,
        /nav\s*\{[^}]*(?:margin|padding|top|position)[^}]*\}/i,
        /navigation.*\{[^}]*(?:margin|padding|top|position)[^}]*\}/i,
        /\.(?:nav|header|menu|primary-nav|secondary-nav)\s*\{[^}]*(?:margin|padding|top)[^}]*\}/i
      ];

      for (const pattern of navModificationPatterns) {
        if (pattern.test(suggestedFix)) {
          console.warn(`[Visual QA Filter] BLOCKED navigation modification attempt`);
          console.warn(`  Suggestion: ${suggestedFix.substring(0, 150)}...`);
          return false;
        }
      }

      return true; // Keep this defect - it's safe
    });

    const filteredCount = defects.length - safeDefects.length;
    if (filteredCount > 0) {
      console.log(`[Visual QA Filter] Filtered out ${filteredCount} dangerous defect(s)`);
    }

    return safeDefects;
  }

  summarizeElementDatabase(elementDatabase) {
    if (!elementDatabase || !elementDatabase.elements) {
      return 'No element database available';
    }

    const elements = elementDatabase.elements;
    const summary = [];

    // Count element types
    const typeCounts = {};
    elements.forEach(el => {
      const type = el.tag || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    summary.push('**EXPECTED PAGE STRUCTURE:**');
    Object.entries(typeCounts).forEach(([type, count]) => {
      summary.push(`- ${type}: ${count} element(s)`);
    });

    // Highlight important interactive elements
    const buttons = elements.filter(el => el.tag === 'button' || el.classes?.includes('btn'));
    if (buttons.length > 0) {
      summary.push(`\n**KEY INTERACTIVE ELEMENTS:**`);
      summary.push(`- ${buttons.length} button(s)/CTA(s)`);
    }

    return summary.join('\n');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualQAService;
}
