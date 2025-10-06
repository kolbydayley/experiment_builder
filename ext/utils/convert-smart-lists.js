// Convert.com Smart Lists - Sorting, filtering, and enhanced display
class ConvertSmartLists {
  constructor() {
    this.searchCache = new Map();
  }

  sortExperiences(experiences) {
    if (!Array.isArray(experiences)) return [];

    return experiences.sort((a, b) => {
      // 1. Status priority: active > paused > draft > archived
      const statusOrder = { 
        active: 0, 
        running: 0,
        paused: 1, 
        draft: 2, 
        archived: 3,
        deleted: 4
      };
      
      const statusA = (a.status || '').toLowerCase();
      const statusB = (b.status || '').toLowerCase();
      const statusDiff = (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
      
      if (statusDiff !== 0) return statusDiff;

      // 2. Recently modified first
      const dateA = new Date(a.updated_at || a.updatedAt || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.updatedAt || b.created_at || 0);
      
      return dateB - dateA;
    });
  }

  sortProjects(projects) {
    if (!Array.isArray(projects)) return [];

    return projects.sort((a, b) => {
      // 1. Status: active > archived
      const statusOrder = { active: 0, archived: 1 };
      const statusA = (a.status || '').toLowerCase();
      const statusB = (b.status || '').toLowerCase();
      const statusDiff = (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
      
      if (statusDiff !== 0) return statusDiff;

      // 2. Recently modified
      const dateA = new Date(a.updated_at || a.updatedAt || 0);
      const dateB = new Date(b.updated_at || b.updatedAt || 0);
      
      return dateB - dateA;
    });
  }

  sortAccounts(accounts) {
    if (!Array.isArray(accounts)) return [];

    return accounts.sort((a, b) => {
      // Active accounts first
      const statusOrder = { active: 0, trial: 1, suspended: 2 };
      const statusA = (a.status || '').toLowerCase();
      const statusB = (b.status || '').toLowerCase();
      const statusDiff = (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
      
      if (statusDiff !== 0) return statusDiff;

      // Alphabetical by name
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      
      return nameA.localeCompare(nameB);
    });
  }

  enhanceExperienceDisplay(experience) {
    const statusEmoji = {
      active: '🟢',
      running: '🟢',
      paused: '⏸️',
      draft: '📝',
      archived: '📦',
      deleted: '🗑️'
    };

    const status = (experience.status || '').toLowerCase();
    const emoji = statusEmoji[status] || '⚪';
    const name = this.escapeHtml(experience.name || `Experience ${experience.id}`);
    const type = this.formatType(experience.type);
    const lastModified = this.formatRelativeTime(experience.updated_at || experience.updatedAt);

    return {
      value: experience.id,
      html: `${emoji} ${name}`,
      meta: `${type} • ${lastModified}`,
      searchText: `${name} ${type} ${status}`.toLowerCase()
    };
  }

  enhanceProjectDisplay(project) {
    const name = this.escapeHtml(project.name || `Project ${project.id}`);
    const status = project.status ? `[${project.status.toUpperCase()}]` : '';
    const type = this.formatType(project.type);
    
    return {
      value: project.id,
      html: `${status} ${name}`.trim(),
      meta: type,
      searchText: `${name} ${type} ${status}`.toLowerCase()
    };
  }

  enhanceAccountDisplay(account) {
    const name = this.escapeHtml(account.name || `Account ${account.id}`);
    const status = account.status ? `(${account.status})` : '';
    
    return {
      value: account.id,
      html: `${name} ${status}`.trim(),
      meta: null,
      searchText: `${name} ${status}`.toLowerCase()
    };
  }

  formatType(type) {
    if (!type) return '';
    
    const typeMap = {
      'a/b': 'A/B Test',
      'split_url': 'Split URL',
      'multivariate': 'MVT',
      'personalization': 'Personalization'
    };
    
    return typeMap[type.toLowerCase()] || type;
  }

  formatRelativeTime(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    
    return date.toLocaleDateString();
  }

  createEnhancedSelect(items, enhanceFn, placeholder, options = {}) {
    const includeCreate = options.includeCreate || false;
    const includeSearch = options.includeSearch || false;
    
    const selectHtml = `
      <select class="convert-enhanced-select">
        <option value="">${placeholder}</option>
        ${includeCreate ? '<option value="__create__">➕ Create New Experience</option>' : ''}
        ${items.map(item => {
          const enhanced = enhanceFn.call(this, item);
          const metaAttr = enhanced.meta ? ` data-meta="${this.escapeHtml(enhanced.meta)}"` : '';
          const searchAttr = ` data-search="${this.escapeHtml(enhanced.searchText)}"`;
          return `<option value="${enhanced.value}"${metaAttr}${searchAttr}>${enhanced.html}</option>`;
        }).join('')}
      </select>
    `;

    return selectHtml;
  }

  addSearchToSelect(selectElement) {
    if (!selectElement) return;

    // Create search wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'select-with-search';
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'select-search';
    searchInput.placeholder = '🔍 Search...';
    
    // Insert wrapper
    selectElement.parentNode.insertBefore(wrapper, selectElement);
    wrapper.appendChild(searchInput);
    wrapper.appendChild(selectElement);

    // Store original options
    const originalOptions = Array.from(selectElement.options).slice(1); // Skip first (placeholder)
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      
      if (!query) {
        // Restore all options
        this.restoreOptions(selectElement, originalOptions);
        return;
      }

      // Filter options
      const filtered = originalOptions.filter(option => {
        const searchText = option.getAttribute('data-search') || option.textContent.toLowerCase();
        return searchText.includes(query);
      });

      this.updateSelectOptions(selectElement, filtered);
    });

    // Clear search when select is focused
    selectElement.addEventListener('focus', () => {
      if (searchInput.value) {
        searchInput.value = '';
        this.restoreOptions(selectElement, originalOptions);
      }
    });
  }

  restoreOptions(selectElement, options) {
    // Keep first option (placeholder)
    while (selectElement.options.length > 1) {
      selectElement.remove(1);
    }
    
    options.forEach(option => {
      selectElement.add(option.cloneNode(true));
    });
  }

  updateSelectOptions(selectElement, options) {
    // Keep first option (placeholder)
    while (selectElement.options.length > 1) {
      selectElement.remove(1);
    }
    
    if (options.length === 0) {
      const noResults = new Option('No matches found', '', false, false);
      noResults.disabled = true;
      selectElement.add(noResults);
    } else {
      options.forEach(option => {
        selectElement.add(option.cloneNode(true));
      });
    }
  }

  groupExperiencesByStatus(experiences) {
    const groups = {
      active: [],
      paused: [],
      draft: [],
      archived: []
    };

    experiences.forEach(exp => {
      const status = (exp.status || 'draft').toLowerCase();
      if (groups[status]) {
        groups[status].push(exp);
      } else {
        groups.draft.push(exp);
      }
    });

    return groups;
  }

  createGroupedSelect(groups, enhanceFn, placeholder) {
    const groupLabels = {
      active: '🟢 Active',
      paused: '⏸️ Paused',
      draft: '📝 Drafts',
      archived: '📦 Archived'
    };

    let optionsHtml = `<option value="">${placeholder}</option>`;
    optionsHtml += '<option value="__create__">➕ Create New Experience</option>';

    Object.entries(groups).forEach(([groupKey, items]) => {
      if (items.length === 0) return;
      
      const label = groupLabels[groupKey] || groupKey;
      optionsHtml += `<optgroup label="${label}">`;
      
      items.forEach(item => {
        const enhanced = enhanceFn.call(this, item);
        optionsHtml += `<option value="${enhanced.value}" data-search="${this.escapeHtml(enhanced.searchText)}">${enhanced.html}</option>`;
      });
      
      optionsHtml += '</optgroup>';
    });

    return optionsHtml;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConvertSmartLists;
}
