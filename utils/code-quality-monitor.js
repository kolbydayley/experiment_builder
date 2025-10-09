// Code Quality Monitor
// Detects code degradation over time in iterative editing sessions

class CodeQualityMonitor {
  constructor() {
    this.history = [];
    this.thresholds = {
      codeLength: 5000,        // Max reasonable code length
      duplicationScore: 0.3,   // Max 30% duplicate code
      complexityScore: 50,     // Max cyclomatic complexity
      selectorCount: 20,       // Max unique selectors
      nestedDepth: 5          // Max nesting levels
    };
  }

  /**
   * Analyze code quality and track changes over time
   * @param {Object} code - Generated code object
   * @param {string} source - 'initial', 'follow-up', or 'chat'
   * @returns {Object} Quality report with warnings
   */
  analyzeCode(code, source = 'unknown') {
    const analysis = {
      timestamp: Date.now(),
      source,
      metrics: this.calculateMetrics(code),
      issues: [],
      degradation: null,
      overallScore: 0
    };

    // Calculate overall score (0-100, higher is better)
    analysis.overallScore = this.calculateOverallScore(analysis.metrics);

    // Check for issues
    analysis.issues = this.detectIssues(analysis.metrics);

    // Detect degradation if we have history
    if (this.history.length > 0) {
      analysis.degradation = this.detectDegradation(analysis.metrics);
    }

    // Add to history
    this.history.push(analysis);

    // Limit history to last 10 analyses
    if (this.history.length > 10) {
      this.history.shift();
    }

    return analysis;
  }

  /**
   * Calculate code metrics
   */
  calculateMetrics(code) {
    let allCode = '';
    const selectors = new Set();

    // Combine all code
    if (code.variations && Array.isArray(code.variations)) {
      code.variations.forEach(v => {
        allCode += (v.css || '') + '\n' + (v.js || '') + '\n';
      });
    }
    allCode += (code.globalCSS || '') + '\n' + (code.globalJS || '');

    // Extract metrics
    const metrics = {
      totalLength: allCode.length,
      jsLength: this.extractJS(code).length,
      cssLength: this.extractCSS(code).length,
      selectorCount: this.countSelectors(code),
      duplicateCode: this.measureDuplication(allCode),
      complexityScore: this.calculateComplexity(allCode),
      nestedDepth: this.measureNesting(allCode),
      commentRatio: this.calculateCommentRatio(allCode),
      functionCount: this.countFunctions(allCode)
    };

    return metrics;
  }

  /**
   * Extract all JavaScript code
   */
  extractJS(code) {
    let js = '';
    if (code.variations) {
      code.variations.forEach(v => js += (v.js || '') + '\n');
    }
    js += (code.globalJS || '');
    return js;
  }

  /**
   * Extract all CSS code
   */
  extractCSS(code) {
    let css = '';
    if (code.variations) {
      code.variations.forEach(v => css += (v.css || '') + '\n');
    }
    css += (code.globalCSS || '');
    return css;
  }

  /**
   * Count unique selectors
   */
  countSelectors(code) {
    const selectors = new Set();
    const allCode = this.extractJS(code) + this.extractCSS(code);

    // JS selectors
    const jsPatterns = [
      /querySelector\(['"`]([^'"`]+)['"`]\)/g,
      /querySelectorAll\(['"`]([^'"`]+)['"`]\)/g,
      /waitForElement\(['"`]([^'"`]+)['"`]/g
    ];

    jsPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(allCode)) !== null) {
        selectors.add(match[1]);
      }
    });

    // CSS selectors
    const cssPattern = /([.#\[\w-]+(?:[\s>+~][.#\[\w-]+)*)\s*\{/g;
    let cssMatch;
    while ((cssMatch = cssPattern.exec(allCode)) !== null) {
      selectors.add(cssMatch[1]);
    }

    return selectors.size;
  }

  /**
   * Measure code duplication (0-1, higher is worse)
   */
  measureDuplication(code) {
    const lines = code.split('\n').filter(line => line.trim().length > 10);
    const lineCounts = {};
    let duplicates = 0;

    lines.forEach(line => {
      const normalized = line.trim();
      lineCounts[normalized] = (lineCounts[normalized] || 0) + 1;
    });

    Object.values(lineCounts).forEach(count => {
      if (count > 1) {
        duplicates += count - 1;
      }
    });

    return lines.length > 0 ? duplicates / lines.length : 0;
  }

  /**
   * Calculate cyclomatic complexity (simplified)
   */
  calculateComplexity(code) {
    let complexity = 1; // Base complexity

    // Count decision points
    const patterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\b\?\s*[^:]+:/g,  // Ternary operators
      /&&/g,
      /\|\|/g
    ];

    patterns.forEach(pattern => {
      const matches = code.match(pattern);
      complexity += (matches ? matches.length : 0);
    });

    return complexity;
  }

  /**
   * Measure maximum nesting depth
   */
  measureNesting(code) {
    let maxDepth = 0;
    let currentDepth = 0;

    for (let char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  /**
   * Calculate comment-to-code ratio
   */
  calculateCommentRatio(code) {
    const commentPattern = /\/\*[\s\S]*?\*\/|\/\/.*/g;
    const comments = code.match(commentPattern) || [];
    const commentLength = comments.join('').length;
    const totalLength = code.length;

    return totalLength > 0 ? commentLength / totalLength : 0;
  }

  /**
   * Count function definitions
   */
  countFunctions(code) {
    const functionPattern = /function\s+\w+|=>\s*\{|const\s+\w+\s*=\s*function/g;
    const matches = code.match(functionPattern) || [];
    return matches.length;
  }

  /**
   * Calculate overall quality score (0-100)
   */
  calculateOverallScore(metrics) {
    let score = 100;

    // Penalize length
    if (metrics.totalLength > this.thresholds.codeLength) {
      score -= Math.min(20, (metrics.totalLength - this.thresholds.codeLength) / 200);
    }

    // Penalize duplication
    if (metrics.duplicateCode > this.thresholds.duplicationScore) {
      score -= (metrics.duplicateCode - this.thresholds.duplicationScore) * 50;
    }

    // Penalize complexity
    if (metrics.complexityScore > this.thresholds.complexityScore) {
      score -= Math.min(20, (metrics.complexityScore - this.thresholds.complexityScore) / 5);
    }

    // Penalize nesting
    if (metrics.nestedDepth > this.thresholds.nestedDepth) {
      score -= (metrics.nestedDepth - this.thresholds.nestedDepth) * 10;
    }

    // Penalize selector count
    if (metrics.selectorCount > this.thresholds.selectorCount) {
      score -= Math.min(10, (metrics.selectorCount - this.thresholds.selectorCount));
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect specific issues
   */
  detectIssues(metrics) {
    const issues = [];

    if (metrics.totalLength > this.thresholds.codeLength) {
      issues.push({
        severity: 'major',
        type: 'code-too-long',
        message: `Code length (${metrics.totalLength} chars) exceeds recommended maximum (${this.thresholds.codeLength} chars)`,
        suggestion: 'Consider refactoring into smaller, reusable functions'
      });
    }

    if (metrics.duplicateCode > this.thresholds.duplicationScore) {
      issues.push({
        severity: 'major',
        type: 'high-duplication',
        message: `High code duplication detected (${(metrics.duplicateCode * 100).toFixed(1)}%)`,
        suggestion: 'Extract repeated code into functions or use CSS classes'
      });
    }

    if (metrics.complexityScore > this.thresholds.complexityScore) {
      issues.push({
        severity: 'major',
        type: 'high-complexity',
        message: `Code complexity (${metrics.complexityScore}) is too high`,
        suggestion: 'Break down complex logic into smaller functions'
      });
    }

    if (metrics.nestedDepth > this.thresholds.nestedDepth) {
      issues.push({
        severity: 'minor',
        type: 'deep-nesting',
        message: `Deep nesting detected (${metrics.nestedDepth} levels)`,
        suggestion: 'Flatten conditional logic and extract nested blocks'
      });
    }

    if (metrics.selectorCount > this.thresholds.selectorCount) {
      issues.push({
        severity: 'minor',
        type: 'too-many-selectors',
        message: `High selector count (${metrics.selectorCount})`,
        suggestion: 'Consider using fewer, more specific selectors'
      });
    }

    return issues;
  }

  /**
   * Detect degradation from previous version
   */
  detectDegradation(currentMetrics) {
    if (this.history.length === 0) return null;

    const previous = this.history[this.history.length - 1].metrics;
    const degradation = {
      detected: false,
      changes: []
    };

    // Check each metric
    const checks = [
      {
        key: 'totalLength',
        threshold: 1.5, // 50% increase
        message: 'Code length increased significantly'
      },
      {
        key: 'duplicateCode',
        threshold: 1.3, // 30% increase
        message: 'Code duplication increased'
      },
      {
        key: 'complexityScore',
        threshold: 1.4, // 40% increase
        message: 'Code complexity increased'
      },
      {
        key: 'nestedDepth',
        threshold: 1.2, // 20% increase
        message: 'Nesting depth increased'
      }
    ];

    checks.forEach(check => {
      const prevValue = previous[check.key] || 0;
      const currValue = currentMetrics[check.key] || 0;

      if (prevValue > 0 && currValue / prevValue > check.threshold) {
        degradation.detected = true;
        degradation.changes.push({
          metric: check.key,
          previous: prevValue,
          current: currValue,
          increase: ((currValue / prevValue - 1) * 100).toFixed(1) + '%',
          message: check.message
        });
      }
    });

    return degradation;
  }

  /**
   * Get quality report summary
   */
  getSummary() {
    if (this.history.length === 0) {
      return 'No quality data yet';
    }

    const latest = this.history[this.history.length - 1];
    const score = latest.overallScore;

    let status;
    if (score >= 80) status = 'Excellent';
    else if (score >= 60) status = 'Good';
    else if (score >= 40) status = 'Fair';
    else status = 'Poor';

    return {
      status,
      score: score.toFixed(1),
      issueCount: latest.issues.length,
      degraded: latest.degradation?.detected || false,
      metrics: latest.metrics
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeQualityMonitor;
} else if (typeof window !== 'undefined') {
  window.CodeQualityMonitor = CodeQualityMonitor;
}
