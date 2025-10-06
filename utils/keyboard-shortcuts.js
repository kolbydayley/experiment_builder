// Keyboard Shortcuts Manager
class KeyboardShortcuts {
  constructor(builder) {
    this.builder = builder;
    this.shortcuts = this.defineShortcuts();
    this.commandPalette = null;
  }

  defineShortcuts() {
    return {
      // Generation & Testing
      'ctrl+enter': {
        name: 'Generate Code',
        description: 'Generate experiment code',
        handler: () => this.builder.generateAndAutoTest(),
        contexts: ['default']
      },
      'ctrl+shift+t': {
        name: 'Test All',
        description: 'Test all variations',
        handler: () => this.builder.testAllVariations(),
        contexts: ['default']
      },
      
      // Page Capture
      'ctrl+shift+p': {
        name: 'Capture Page',
        description: 'Capture current page',
        handler: () => this.builder.capturePage(),
        contexts: ['default']
      },
      'ctrl+shift+e': {
        name: 'Select Element',
        description: 'Activate element selector',
        handler: () => this.activateElementSelector(),
        contexts: ['default']
      },
      
      // Navigation
      'ctrl+1': {
        name: 'Build Tab',
        description: 'Switch to Build tab',
        handler: () => this.builder.switchPanel('build'),
        contexts: ['default']
      },
      'ctrl+2': {
        name: 'Review Tab',
        description: 'Switch to Review tab',
        handler: () => this.builder.switchPanel('review'),
        contexts: ['default']
      },
      'ctrl+3': {
        name: 'Chat Tab',
        description: 'Switch to Chat tab',
        handler: () => this.builder.switchPanel('chat'),
        contexts: ['default']
      },
      'ctrl+4': {
        name: 'Convert Tab',
        description: 'Switch to Convert tab',
        handler: () => this.builder.switchPanel('convert'),
        contexts: ['default']
      },
      
      // Actions
      'ctrl+s': {
        name: 'Save Session',
        description: 'Save current session',
        handler: (e) => {
          e.preventDefault();
          this.builder.sessionManager?.saveSession();
          this.builder.showSuccess('Session saved');
        },
        contexts: ['default']
      },
      'ctrl+e': {
        name: 'Export All',
        description: 'Export all variations',
        handler: () => this.builder.exportAll(),
        contexts: ['default']
      },
      'ctrl+shift+c': {
        name: 'Clear Results',
        description: 'Clear generated results',
        handler: () => this.builder.clearResults(),
        contexts: ['default']
      },
      
      // Command Palette
      'ctrl+k': {
        name: 'Command Palette',
        description: 'Open command palette',
        handler: (e) => {
          e.preventDefault();
          this.showCommandPalette();
        },
        contexts: ['default']
      },
      
      // Modal Controls
      'escape': {
        name: 'Close Modals',
        description: 'Close all open modals',
        handler: () => this.closeAllModals(),
        contexts: ['modal']
      }
    };
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.addKeyboardHints();
  }

  handleKeyDown(e) {
    const key = this.getKeyCombo(e);
    const shortcut = this.shortcuts[key];

    if (!shortcut) return;

    // Don't trigger if user is typing in input/textarea (except specific shortcuts)
    const isInputField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (isInputField && !['ctrl+k', 'ctrl+s', 'escape'].includes(key)) {
      return;
    }

    // Check context
    const currentContext = this.getCurrentContext();
    if (shortcut.contexts && !shortcut.contexts.includes(currentContext)) {
      return;
    }

    e.preventDefault();
    shortcut.handler(e);
  }

  getKeyCombo(e) {
    const parts = [];
    
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    
    const key = e.key.toLowerCase();
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.join('+');
  }

  getCurrentContext() {
    // Check if any modals are open
    const hasOpenModal = document.querySelector('.template-modal:not(.hidden), .examples-modal:not(.hidden), .command-palette');
    if (hasOpenModal) return 'modal';
    
    return 'default';
  }

  activateElementSelector() {
    const elementBtn = document.getElementById('captureModeElementBtn');
    if (elementBtn) {
      elementBtn.click();
      this.builder.capturePage();
    }
  }

  closeAllModals() {
    document.querySelectorAll('.template-modal, .examples-modal, .command-palette').forEach(modal => {
      modal.classList.add('hidden');
      modal.remove();
    });
  }

  showCommandPalette() {
    // Remove existing palette
    const existing = document.querySelector('.command-palette');
    if (existing) {
      existing.remove();
      return;
    }

    // Create palette
    const palette = document.createElement('div');
    palette.className = 'command-palette';
    
    const commands = this.getFilteredCommands();
    
    palette.innerHTML = `
      <input 
        type="text" 
        id="commandPaletteInput" 
        placeholder="Type a command or search..."
        autocomplete="off"
      >
      <div class="command-list" id="commandList">
        ${commands.map((cmd, idx) => `
          <div class="command-item" data-index="${idx}" data-shortcut="${cmd.shortcut}">
            <div class="command-info">
              <div class="command-name">${cmd.name}</div>
              <div class="command-description">${cmd.description}</div>
            </div>
            <div class="command-shortcut">
              ${this.formatShortcut(cmd.shortcut)}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.body.appendChild(palette);

    // Focus input
    const input = document.getElementById('commandPaletteInput');
    input.focus();

    // Handle search
    let selectedIndex = 0;
    input.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const filtered = commands.filter(cmd => 
        cmd.name.toLowerCase().includes(query) || 
        cmd.description.toLowerCase().includes(query)
      );
      
      this.renderCommandList(filtered);
      selectedIndex = 0;
      this.highlightCommand(selectedIndex);
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
      const list = document.getElementById('commandList');
      const items = list.querySelectorAll('.command-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        this.highlightCommand(selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        this.highlightCommand(selectedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = items[selectedIndex];
        if (selectedItem) {
          const shortcut = selectedItem.getAttribute('data-shortcut');
          const command = this.shortcuts[shortcut];
          if (command) {
            palette.remove();
            command.handler();
          }
        }
      } else if (e.key === 'Escape') {
        palette.remove();
      }
    });

    // Handle clicks
    palette.addEventListener('click', (e) => {
      const item = e.target.closest('.command-item');
      if (item) {
        const shortcut = item.getAttribute('data-shortcut');
        const command = this.shortcuts[shortcut];
        if (command) {
          palette.remove();
          command.handler();
        }
      }
    });

    // Close on backdrop click
    palette.addEventListener('click', (e) => {
      if (e.target === palette) {
        palette.remove();
      }
    });

    this.highlightCommand(0);
  }

  getFilteredCommands() {
    return Object.entries(this.shortcuts)
      .filter(([key, cmd]) => cmd.name !== 'Close Modals') // Don't show escape in palette
      .map(([key, cmd]) => ({
        shortcut: key,
        name: cmd.name,
        description: cmd.description
      }));
  }

  renderCommandList(commands) {
    const list = document.getElementById('commandList');
    
    if (commands.length === 0) {
      list.innerHTML = '<div class="command-empty">No commands found</div>';
      return;
    }
    
    list.innerHTML = commands.map((cmd, idx) => `
      <div class="command-item" data-index="${idx}" data-shortcut="${cmd.shortcut}">
        <div class="command-info">
          <div class="command-name">${cmd.name}</div>
          <div class="command-description">${cmd.description}</div>
        </div>
        <div class="command-shortcut">
          ${this.formatShortcut(cmd.shortcut)}
        </div>
      </div>
    `).join('');
  }

  highlightCommand(index) {
    const items = document.querySelectorAll('.command-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === index);
    });
    
    // Scroll into view
    const selected = items[index];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  formatShortcut(shortcut) {
    const parts = shortcut.split('+');
    const symbols = {
      'ctrl': '⌘',
      'shift': '⇧',
      'alt': '⌥',
      'enter': '↵'
    };
    
    return parts
      .map(part => symbols[part] || part.toUpperCase())
      .join(' ');
  }

  addKeyboardHints() {
    // Add hints to buttons
    const hints = [
      { id: 'generateBtn', shortcut: '⌘ ↵' },
      { id: 'captureBtn', shortcut: '⌘ ⇧ P' }
    ];

    hints.forEach(({ id, shortcut }) => {
      const button = document.getElementById(id);
      if (button && !button.querySelector('.keyboard-hint')) {
        const hint = document.createElement('span');
        hint.className = 'keyboard-hint';
        hint.innerHTML = `<kbd>${shortcut}</kbd>`;
        button.appendChild(hint);
      }
    });
  }

  getShortcutsList() {
    return Object.entries(this.shortcuts)
      .map(([key, cmd]) => ({
        shortcut: this.formatShortcut(key),
        name: cmd.name,
        description: cmd.description
      }));
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyboardShortcuts;
}
