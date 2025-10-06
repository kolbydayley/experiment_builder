// Session Manager for persisting user state across sessions
class SessionManager {
  constructor(builder) {
    this.builder = builder;
    this.SESSION_KEY = 'experimentBuilderSession';
    this.SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  async saveSession() {
    try {
      const session = {
        timestamp: Date.now(),
        version: '1.0',
        
        // Convert.com state
        convertState: {
          apiKeyId: this.builder.convertState?.apiKeyId || '',
          accountId: this.builder.convertState?.accountId || '',
          projectId: this.builder.convertState?.projectId || '',
          experienceId: this.builder.convertState?.experienceId || ''
        },
        
        // User preferences
        preferences: {
          model: this.builder.settings?.model || 'gpt-4o-mini',
          preferCSS: this.builder.settings?.preferCSS !== false,
          includeDOMChecks: this.builder.settings?.includeDOMChecks !== false,
          captureMode: this.builder.captureMode || 'full'
        },
        
        // Current work context
        context: {
          variationCount: this.builder.variations?.length || 0,
          focusedVariationId: this.builder.focusedVariationId || null,
          hasGeneratedCode: !!this.builder.generatedCode
        }
      };

      await chrome.storage.local.set({ [this.SESSION_KEY]: session });
      console.log('✅ Session saved');
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  async loadSession() {
    try {
      const result = await chrome.storage.local.get([this.SESSION_KEY]);
      const session = result?.[this.SESSION_KEY];

      if (!session) {
        console.log('No previous session found');
        return null;
      }

      // Check if session is expired
      const age = Date.now() - session.timestamp;
      if (age > this.SESSION_MAX_AGE) {
        console.log('Session expired, clearing');
        await this.clearSession();
        return null;
      }

      console.log('✅ Session loaded', session);
      return session;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  async clearSession() {
    try {
      await chrome.storage.local.remove([this.SESSION_KEY]);
      console.log('✅ Session cleared');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  showRestoreDialog(session) {
    const dialog = document.createElement('div');
    dialog.id = 'sessionRestoreDialog';
    dialog.className = 'session-restore-banner';
    
    const timeAgo = this.formatTimeAgo(session.timestamp);
    const hasConvertState = session.convertState?.projectId;
    
    dialog.innerHTML = `
      <div class="banner-content">
        <div class="banner-icon">🔄</div>
        <div class="banner-text">
          <strong>Restore previous session?</strong>
          <div class="session-details">
            ${timeAgo} • ${session.context.variationCount} variation(s)
            ${hasConvertState ? ' • Convert.com project selected' : ''}
          </div>
        </div>
        <div class="banner-actions">
          <button class="btn-small btn-primary" id="restoreSessionBtn">
            Restore
          </button>
          <button class="btn-small btn-secondary" id="dismissSessionBtn">
            Start Fresh
          </button>
        </div>
      </div>
    `;

    // Insert at top of side panel
    const sidepanel = document.querySelector('.sidepanel-container');
    if (sidepanel) {
      sidepanel.insertBefore(dialog, sidepanel.firstChild);
    }

    // Bind events
    document.getElementById('restoreSessionBtn')?.addEventListener('click', () => {
      this.applySession(session);
      dialog.remove();
    });

    document.getElementById('dismissSessionBtn')?.addEventListener('click', () => {
      this.clearSession();
      dialog.remove();
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (dialog.parentElement) {
        dialog.remove();
      }
    }, 30000);
  }

  async applySession(session) {
    try {
      console.log('Applying session...', session);

      // Restore preferences
      if (session.preferences) {
        Object.assign(this.builder.settings, session.preferences);
        this.updatePreferencesUI(session.preferences);
      }

      // Restore Convert.com state
      if (session.convertState) {
        await this.restoreConvertState(session.convertState);
      }

      // Show success message
      this.builder.showSuccess('Session restored successfully!');
      this.builder.addStatusLog('✅ Previous session restored', 'success');
    } catch (error) {
      console.error('Failed to apply session:', error);
      this.builder.showError('Failed to restore session');
    }
  }

  async restoreConvertState(convertState) {
    const elements = this.builder.getConvertElements();
    
    // Restore API key selection
    if (convertState.apiKeyId && elements.apiKeySelect) {
      elements.apiKeySelect.value = convertState.apiKeyId;
      this.builder.convertState.apiKeyId = convertState.apiKeyId;
      
      // Trigger cascade
      await this.builder.onConvertApiKeyChange();
      await this.waitForDropdown(elements.accountSelect);
      
      // Restore account
      if (convertState.accountId && elements.accountSelect) {
        elements.accountSelect.value = convertState.accountId;
        this.builder.convertState.accountId = convertState.accountId;
        
        await this.builder.onConvertAccountChange();
        await this.waitForDropdown(elements.projectSelect);
        
        // Restore project
        if (convertState.projectId && elements.projectSelect) {
          elements.projectSelect.value = convertState.projectId;
          this.builder.convertState.projectId = convertState.projectId;
          
          await this.builder.onConvertProjectChange();
          await this.waitForDropdown(elements.experienceSelect);
          
          // Restore experience
          if (convertState.experienceId && elements.experienceSelect) {
            elements.experienceSelect.value = convertState.experienceId;
            this.builder.convertState.experienceId = convertState.experienceId;
            this.builder.onConvertExperienceChange();
          }
        }
      }
    }
  }

  async waitForDropdown(element, maxWait = 3000) {
    if (!element) return;
    
    const startTime = Date.now();
    while (element.options.length <= 1 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  updatePreferencesUI(preferences) {
    // Update model select
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect && preferences.model) {
      modelSelect.value = preferences.model;
    }

    // Update checkboxes
    const preferCSSCheckbox = document.getElementById('preferCSS');
    if (preferCSSCheckbox) {
      preferCSSCheckbox.checked = preferences.preferCSS;
    }

    const includeDOMChecks = document.getElementById('includeDOMChecks');
    if (includeDOMChecks) {
      includeDOMChecks.checked = preferences.includeDOMChecks;
    }
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }

  // Auto-save on key actions
  setupAutoSave() {
    // Save on Convert.com selection changes
    const elements = this.builder.getConvertElements();
    
    if (elements.apiKeySelect) {
      elements.apiKeySelect.addEventListener('change', () => this.saveSession());
    }
    if (elements.accountSelect) {
      elements.accountSelect.addEventListener('change', () => this.saveSession());
    }
    if (elements.projectSelect) {
      elements.projectSelect.addEventListener('change', () => this.saveSession());
    }
    if (elements.experienceSelect) {
      elements.experienceSelect.addEventListener('change', () => this.saveSession());
    }

    // Save on settings changes
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
      modelSelect.addEventListener('change', () => this.saveSession());
    }

    // Save periodically during active use
    setInterval(() => {
      if (document.hasFocus()) {
        this.saveSession();
      }
    }, 60000); // Every minute

    // Save on window close
    window.addEventListener('beforeunload', () => {
      this.saveSession();
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
