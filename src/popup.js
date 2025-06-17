class PopupManager {
    constructor() {
        this.settings = { keywords: [], enabled: true };
        this.filteredKeywords = [];
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.renderKeywords();
        this.updateStats();
    }

    async loadSettings() {
        try {
            const result = await browser.storage.local.get(['politicalFilterSettings']);
            if (result.politicalFilterSettings) {
                this.settings = result.politicalFilterSettings;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        document.getElementById('enableFilter').checked = this.settings.enabled;
        this.filteredKeywords = [...this.settings.keywords];
    }

    async saveSettings() {
        try {
            await browser.storage.local.set({ politicalFilterSettings: this.settings });

            // Notify content script of settings update
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id, { type: 'settingsUpdated' });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    setupEventListeners() {
        // Enable/disable toggle
        document.getElementById('enableFilter').addEventListener('change', (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
        });

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterKeywords(e.target.value);
        });

        // Add new keyword
        document.getElementById('addBtn').addEventListener('click', () => {
            this.addKeyword();
        });

        document.getElementById('addInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addKeyword();
            }
        });
    }

    filterKeywords(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredKeywords = this.settings.keywords.filter(keyword =>
            keyword.toLowerCase().includes(term)
        );
        this.renderKeywords();
    }

    renderKeywords() {
        const container = document.getElementById('keywordsContainer');
        container.innerHTML = '';

        this.filteredKeywords.forEach((keyword, index) => {
            const item = document.createElement('div');
            item.className = 'keyword-item';
            item.innerHTML = `
        <span>${keyword}</span>
        <button class="delete-btn" data-keyword="${keyword}">Delete</button>
      `;

            item.querySelector('.delete-btn').addEventListener('click', () => {
                this.removeKeyword(keyword);
            });

            container.appendChild(item);
        });
    }

    addKeyword() {
        const input = document.getElementById('addInput');
        const keyword = input.value.trim().toLowerCase();

        if (keyword && !this.settings.keywords.includes(keyword)) {
            this.settings.keywords.push(keyword);
            this.settings.keywords.sort();
            this.filteredKeywords = [...this.settings.keywords];

            // Clear search and input
            document.getElementById('searchInput').value = '';
            input.value = '';

            this.renderKeywords();
            this.updateStats();
            this.saveSettings();
        }
    }

    removeKeyword(keyword) {
        this.settings.keywords = this.settings.keywords.filter(k => k !== keyword);
        this.filteredKeywords = this.filteredKeywords.filter(k => k !== keyword);

        this.renderKeywords();
        this.updateStats();
        this.saveSettings();
    }

    updateStats() {
        const stats = document.getElementById('stats');
        stats.textContent = `Total keywords: ${this.settings.keywords.length}`;
    }
}

// Initialize popup
new PopupManager();