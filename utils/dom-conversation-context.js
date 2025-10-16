/**
 * DOM Conversation Context - Maintains chat context with DOM state
 *
 * Like how code companions track file edits and conversation history,
 * but for DOM modifications and conversational experiments.
 */
class DOMConversationContext {
  constructor() {
    this.history = [];
    this.domState = {
      originalDOM: null,          // IMMUTABLE: Initial captured state
      currentDOM: null,            // Current state with all edits
      appliedEdits: [],           // Stack of edits
      rollbackStack: []           // For undo functionality
    };
    this.conversationMetadata = {
      startedAt: null,
      lastMessageAt: null,
      totalMessages: 0,
      totalEdits: 0,
      goals: []                   // User goals extracted from conversation
    };
    this.semanticIndex = null;    // Reference to DOMSemanticIndex
    this.dependencyAnalyzer = null; // Reference to DOMDependencyAnalyzer
  }

  /**
   * Initialize context with page data
   */
  initialize(pageData, semanticIndex, dependencyAnalyzer) {
    console.log('🎬 [DOMContext] Initializing conversation context...');

    // Store original DOM state (immutable)
    this.domState.originalDOM = this.clonePageData(pageData);
    this.domState.currentDOM = this.clonePageData(pageData);

    // Store references to analyzers
    this.semanticIndex = semanticIndex;
    this.dependencyAnalyzer = dependencyAnalyzer;

    // Initialize metadata
    this.conversationMetadata.startedAt = Date.now();
    this.conversationMetadata.lastMessageAt = Date.now();

    console.log(`✅ [DOMContext] Context initialized with ${pageData.elements?.length || 0} elements`);
  }

  /**
   * Add message to conversation history
   */
  addMessage(role, content, metadata = {}) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role, // 'user' or 'assistant'
      content,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        domSnapshot: this.captureCurrentState(),
        appliedEdits: [...this.domState.appliedEdits],
        conversationTurn: this.history.length
      }
    };

    this.history.push(message);

    // Update metadata
    this.conversationMetadata.totalMessages++;
    this.conversationMetadata.lastMessageAt = Date.now();

    // Extract goals from user messages
    if (role === 'user') {
      this.extractGoals(content);
    }

    console.log(`💬 [DOMContext] Added ${role} message (turn ${this.history.length})`);

    return message;
  }

  /**
   * Add edit to applied edits stack
   */
  addEdit(edit) {
    const editRecord = {
      id: `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...edit,
      appliedAt: Date.now(),
      conversationTurn: this.history.length,
      domStateBefore: this.captureCurrentState()
    };

    this.domState.appliedEdits.push(editRecord);
    this.conversationMetadata.totalEdits++;

    // Update current DOM state (simplified - would need full implementation)
    this.updateCurrentDOMState(edit);

    console.log(`✏️ [DOMContext] Applied edit: ${edit.type} on ${edit.target}`);

    return editRecord;
  }

  /**
   * Capture current DOM state snapshot
   */
  captureCurrentState() {
    return {
      editCount: this.domState.appliedEdits.length,
      lastEdit: this.domState.appliedEdits.length > 0 ?
        this.domState.appliedEdits[this.domState.appliedEdits.length - 1].id : null,
      timestamp: Date.now()
    };
  }

  /**
   * Update current DOM state with new edit
   */
  updateCurrentDOMState(edit) {
    // This is a simplified version - in production, would track actual DOM changes
    if (!this.domState.currentDOM.modifiedElements) {
      this.domState.currentDOM.modifiedElements = new Map();
    }

    this.domState.currentDOM.modifiedElements.set(edit.target, {
      selector: edit.target,
      modifications: edit,
      modifiedAt: Date.now()
    });
  }

  /**
   * Build context for AI generation
   * Like @codebase in code companions, but for DOM
   */
  buildContext(userMessage, options = {}) {
    const {
      includeFullHistory = false,
      includeOriginalDOM = false,
      relevantMessagesCount = 5
    } = options;

    console.log('📦 [DOMContext] Building AI context...');

    const context = {
      // Conversation summary
      conversation: {
        recentHistory: this.getRelevantHistory(userMessage, relevantMessagesCount),
        fullHistory: includeFullHistory ? this.history : null,
        goals: this.conversationMetadata.goals,
        totalTurns: this.history.length
      },

      // DOM state
      domState: {
        original: includeOriginalDOM ? this.domState.originalDOM : null,
        current: this.getCurrentDOMSummary(),
        modifiedElements: this.getModifiedElementsSummary(),
        totalEdits: this.domState.appliedEdits.length
      },

      // Applied edits (like git diff)
      edits: this.getEditsSummary(),

      // Dependencies (affected elements)
      affected: this.findAffectedElements(),

      // Semantic context from index
      semantic: this.semanticIndex ? {
        categories: this.semanticIndex.getCategories(),
        totalElements: this.semanticIndex.getStatistics().totalElements
      } : null,

      // User intent from current message
      intent: this.semanticIndex ?
        this.semanticIndex.parseIntent(userMessage) : null
    };

    console.log(`✅ [DOMContext] Context built (${context.conversation.recentHistory.length} recent messages, ${context.edits.length} edits)`);

    return context;
  }

  /**
   * Get relevant conversation history
   * Uses semantic similarity to find related messages
   */
  getRelevantHistory(currentMessage, count = 5) {
    // Simple approach: return last N messages
    // In production, would use semantic similarity
    const recent = this.history.slice(-count);

    return recent.map(msg => ({
      role: msg.role,
      content: msg.content,
      turn: msg.metadata.conversationTurn,
      hadEdit: msg.metadata.appliedEdits.length > 0,
      timestamp: msg.metadata.timestamp
    }));
  }

  /**
   * Get current DOM summary
   */
  getCurrentDOMSummary() {
    if (!this.domState.currentDOM) return null;

    return {
      elementCount: this.domState.currentDOM.elements?.length || 0,
      modifiedCount: this.domState.currentDOM.modifiedElements?.size || 0,
      url: this.domState.currentDOM.url,
      capturedAt: this.domState.currentDOM.timestamp
    };
  }

  /**
   * Get summary of modified elements
   */
  getModifiedElementsSummary() {
    if (!this.domState.currentDOM.modifiedElements) return [];

    return Array.from(this.domState.currentDOM.modifiedElements.values()).map(mod => ({
      selector: mod.selector,
      modificationType: mod.modifications.type,
      modifiedAt: mod.modifiedAt
    }));
  }

  /**
   * Get summary of all edits
   */
  getEditsSummary() {
    return this.domState.appliedEdits.map(edit => ({
      id: edit.id,
      type: edit.type,
      target: edit.target,
      description: this.describeEdit(edit),
      appliedAt: edit.appliedAt,
      conversationTurn: edit.conversationTurn
    }));
  }

  /**
   * Describe edit in human-readable format
   */
  describeEdit(edit) {
    switch (edit.type) {
      case 'style':
        return `Changed styles: ${Object.keys(edit.styles || {}).join(', ')}`;
      case 'content':
        return `Modified content`;
      case 'add':
        return `Added element`;
      case 'remove':
        return `Removed element`;
      case 'attribute':
        return `Changed attributes: ${Object.keys(edit.attributes || {}).join(', ')}`;
      default:
        return `Applied ${edit.type}`;
    }
  }

  /**
   * Find elements affected by current edits
   */
  findAffectedElements() {
    if (!this.dependencyAnalyzer) return [];

    const affected = new Set();

    this.domState.appliedEdits.forEach(edit => {
      const impact = this.dependencyAnalyzer.analyzeImpact(edit.target);

      if (impact && impact.dependencies) {
        const deps = impact.dependencies;

        // Add all related elements
        [
          ...(deps.children || []),
          ...(deps.siblings || []),
          ...(deps.layoutSiblings?.map(s => s.selector) || [])
        ].forEach(selector => affected.add(selector));
      }
    });

    return Array.from(affected);
  }

  /**
   * Extract goals from user message
   */
  extractGoals(message) {
    // Simple goal extraction - could use NLP for better results
    const lowerMessage = message.toLowerCase();

    // Look for goal indicators
    const goalIndicators = [
      'want to', 'need to', 'should', 'would like',
      'goal is', 'trying to', 'make sure'
    ];

    const hasGoalIndicator = goalIndicators.some(indicator =>
      lowerMessage.includes(indicator)
    );

    if (hasGoalIndicator || this.conversationMetadata.goals.length === 0) {
      // Extract and store goal
      const goal = {
        text: message,
        extractedAt: Date.now(),
        conversationTurn: this.history.length
      };

      this.conversationMetadata.goals.push(goal);
      console.log(`🎯 [DOMContext] Extracted goal: "${message.substring(0, 50)}..."`);
    }
  }

  /**
   * Search conversation history for related discussion
   */
  findRelatedDiscussion(topic) {
    const topicLower = topic.toLowerCase();

    return this.history
      .filter(msg => msg.content.toLowerCase().includes(topicLower))
      .map(msg => ({
        role: msg.role,
        message: msg.content,
        turn: msg.metadata.conversationTurn,
        edit: msg.metadata.appliedEdits.length > 0 ?
          msg.metadata.appliedEdits[msg.metadata.appliedEdits.length - 1] : null,
        timestamp: msg.metadata.timestamp
      }));
  }

  /**
   * Get conversation summary
   */
  getSummary() {
    const duration = Date.now() - this.conversationMetadata.startedAt;
    const durationMinutes = Math.floor(duration / 60000);

    return {
      ...this.conversationMetadata,
      duration: durationMinutes,
      editsPerMinute: durationMinutes > 0 ?
        (this.conversationMetadata.totalEdits / durationMinutes).toFixed(2) : 0,
      messagesPerMinute: durationMinutes > 0 ?
        (this.conversationMetadata.totalMessages / durationMinutes).toFixed(2) : 0,
      elementsModified: this.domState.currentDOM?.modifiedElements?.size || 0
    };
  }

  /**
   * Compare current state to original
   */
  getDiff() {
    const diff = {
      added: [],
      modified: [],
      removed: [],
      unchanged: []
    };

    if (!this.domState.originalDOM || !this.domState.currentDOM) {
      return diff;
    }

    // Compare elements
    const originalSelectors = new Set(
      (this.domState.originalDOM.elements || []).map(el => el.selector)
    );
    const currentSelectors = new Set(
      (this.domState.currentDOM.elements || []).map(el => el.selector)
    );
    const modifiedSelectors = this.domState.currentDOM.modifiedElements ?
      new Set(this.domState.currentDOM.modifiedElements.keys()) : new Set();

    // Find added
    currentSelectors.forEach(selector => {
      if (!originalSelectors.has(selector)) {
        diff.added.push(selector);
      }
    });

    // Find removed
    originalSelectors.forEach(selector => {
      if (!currentSelectors.has(selector)) {
        diff.removed.push(selector);
      }
    });

    // Modified
    diff.modified = Array.from(modifiedSelectors);

    // Unchanged
    originalSelectors.forEach(selector => {
      if (currentSelectors.has(selector) && !modifiedSelectors.has(selector)) {
        diff.unchanged.push(selector);
      }
    });

    return diff;
  }

  /**
   * Rollback to previous state
   */
  rollback(steps = 1) {
    if (this.domState.appliedEdits.length === 0) {
      console.warn('[DOMContext] No edits to rollback');
      return false;
    }

    // Remove last N edits
    const removedEdits = this.domState.appliedEdits.splice(-steps, steps);

    // Add to rollback stack for potential redo
    this.domState.rollbackStack.push(...removedEdits);

    console.log(`↩️ [DOMContext] Rolled back ${steps} edit(s)`);

    return true;
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.history;
  }

  /**
   * Get all applied edits
   */
  getEdits() {
    return this.domState.appliedEdits;
  }

  /**
   * Get original DOM state
   */
  getOriginalDOM() {
    return this.domState.originalDOM;
  }

  /**
   * Get current DOM state
   */
  getCurrentDOM() {
    return this.domState.currentDOM;
  }

  /**
   * Get metadata
   */
  getMetadata() {
    return this.conversationMetadata;
  }

  /**
   * Clear context (start fresh)
   */
  clear() {
    this.history = [];
    this.domState = {
      originalDOM: null,
      currentDOM: null,
      appliedEdits: [],
      rollbackStack: []
    };
    this.conversationMetadata = {
      startedAt: null,
      lastMessageAt: null,
      totalMessages: 0,
      totalEdits: 0,
      goals: []
    };

    console.log('🗑️ [DOMContext] Context cleared');
  }

  /**
   * Clone page data (deep copy)
   */
  clonePageData(pageData) {
    // Simple deep clone - in production, might need more sophisticated approach
    return JSON.parse(JSON.stringify(pageData));
  }

  /**
   * Export context for sharing/debugging
   */
  export() {
    return {
      history: this.history,
      edits: this.domState.appliedEdits,
      goals: this.conversationMetadata.goals,
      summary: this.getSummary(),
      diff: this.getDiff(),
      exportedAt: Date.now()
    };
  }

  /**
   * Import context (restore from export)
   */
  import(exportedData) {
    if (!exportedData) return false;

    try {
      this.history = exportedData.history || [];
      this.domState.appliedEdits = exportedData.edits || [];
      this.conversationMetadata.goals = exportedData.goals || [];

      // Reconstruct metadata
      if (this.history.length > 0) {
        this.conversationMetadata.startedAt = this.history[0].metadata.timestamp;
        this.conversationMetadata.lastMessageAt = this.history[this.history.length - 1].metadata.timestamp;
        this.conversationMetadata.totalMessages = this.history.length;
        this.conversationMetadata.totalEdits = this.domState.appliedEdits.length;
      }

      console.log(`📥 [DOMContext] Imported context with ${this.history.length} messages and ${this.domState.appliedEdits.length} edits`);

      return true;
    } catch (error) {
      console.error('[DOMContext] Import failed:', error);
      return false;
    }
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMConversationContext;
}
