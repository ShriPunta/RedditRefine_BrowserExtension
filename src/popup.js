class PopupManager {
    constructor() {
        this.settings = { keywords: [], subreddits: [], enabled: true };
        this.counters = { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() };
        this.filteredKeywords = [];
        this.filteredSubreddits = [];
        this.currentTab = 'keywords';
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadCounters();
        this.setupEventListeners();
        this.setupTabs();
        this.renderAll();
        this.updateAllStats();
        this.updateCounterDisplay();

        // Request fresh counter data from content script
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id, { type: 'requestCounters' });
            }
        } catch (error) {
            // Ignore if content script not available
        }
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
        this.filteredSubreddits = [...this.settings.subreddits];
    }

    async loadCounters() {
        try {
            const result = await browser.storage.local.get(['politicalFilterCounters']);
            if (result.politicalFilterCounters) {
                this.counters = result.politicalFilterCounters;

                // Reset daily counter if it's a new day
                const today = new Date().toDateString();
                if (this.counters.lastResetDate !== today) {
                    this.counters.dailyRemoved = 0;
                    this.counters.lastResetDate = today;
                    await this.saveCounters();
                }
            }
        } catch (error) {
            console.error('Failed to load counters:', error);
        }
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

    async saveCounters() {
        try {
            await browser.storage.local.set({ politicalFilterCounters: this.counters });
        } catch (error) {
            console.error('Failed to save counters:', error);
        }
    }

    updateCounterDisplay() {
        const totalElement = document.getElementById('totalCounter');
        const dailyElement = document.getElementById('dailyCounter');

        if (totalElement) {
            totalElement.textContent = this.counters.totalRemoved.toLocaleString();
        }

        if (dailyElement) {
            dailyElement.textContent = this.counters.dailyRemoved.toLocaleString();
        }
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active content
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(`${tabName}-tab`).classList.add('active');

                this.currentTab = tabName;
            });
        });
    }

    setupEventListeners() {
        // Enable/disable toggle
        document.getElementById('enableFilter').addEventListener('change', (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
        });

        // Keywords tab
        document.getElementById('keywordSearchInput').addEventListener('input', (e) => {
            this.filterKeywords(e.target.value);
        });

        document.getElementById('keywordAddBtn').addEventListener('click', () => {
            this.addKeyword();
        });

        document.getElementById('keywordAddInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addKeyword();
            }
        });

        // Subreddits tab
        document.getElementById('subredditSearchInput').addEventListener('input', (e) => {
            this.filterSubreddits(e.target.value);
        });

        document.getElementById('subredditAddBtn').addEventListener('click', () => {
            this.addSubreddit();
        });

        document.getElementById('subredditAddInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addSubreddit();
            }
        });

        // Listen for counter updates from content script
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'countersUpdated') {
                    this.counters = message.counters;
                    this.updateCounterDisplay();
                }
            });
        }

        // Refresh counters on popup open
        this.refreshCounters();
    }

    async refreshCounters() {
        await this.loadCounters();
        this.updateCounterDisplay();
    }

    // Keywords methods
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

        if (this.filteredKeywords.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div>No keywords found</div>
                </div>
            `;
            return;
        }

        this.filteredKeywords.forEach((keyword) => {
            const item = document.createElement('div');
            item.className = 'list-item';
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
        const input = document.getElementById('keywordAddInput');
        const keyword = input.value.trim().toLowerCase();

        if (keyword && !this.settings.keywords.includes(keyword)) {
            this.settings.keywords.push(keyword);
            this.settings.keywords.sort();
            this.filteredKeywords = [...this.settings.keywords];

            // Clear search and input
            document.getElementById('keywordSearchInput').value = '';
            input.value = '';

            this.renderKeywords();
            this.updateKeywordStats();
            this.saveSettings();
        }
    }

    removeKeyword(keyword) {
        this.settings.keywords = this.settings.keywords.filter(k => k !== keyword);
        this.filteredKeywords = this.filteredKeywords.filter(k => k !== keyword);

        this.renderKeywords();
        this.updateKeywordStats();
        this.saveSettings();
    }

    updateKeywordStats() {
        const stats = document.getElementById('keywordStats');
        stats.textContent = `📝 Total keywords: ${this.settings.keywords.length}`;
    }

    // Subreddits methods
    filterSubreddits(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredSubreddits = this.settings.subreddits.filter(subreddit =>
            subreddit.toLowerCase().includes(term)
        );
        this.renderSubreddits();
    }

    renderSubreddits() {
        const container = document.getElementById('subredditsContainer');
        container.innerHTML = '';

        if (this.filteredSubreddits.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div>No subreddits found</div>
                </div>
            `;
            return;
        }

        this.filteredSubreddits.forEach((subreddit) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span>${subreddit}</span>
                <button class="delete-btn" data-subreddit="${subreddit}">Delete</button>
            `;

            item.querySelector('.delete-btn').addEventListener('click', () => {
                this.removeSubreddit(subreddit);
            });

            container.appendChild(item);
        });
    }

    addSubreddit() {
        const input = document.getElementById('subredditAddInput');
        let subreddit = input.value.trim().toLowerCase();

        // Add r/ prefix if not present
        if (subreddit && !subreddit.startsWith('r/')) {
            subreddit = 'r/' + subreddit;
        }

        if (subreddit && subreddit !== 'r/' && !this.settings.subreddits.includes(subreddit)) {
            this.settings.subreddits.push(subreddit);
            this.settings.subreddits.sort();
            this.filteredSubreddits = [...this.settings.subreddits];

            // Clear search and input
            document.getElementById('subredditSearchInput').value = '';
            input.value = '';

            this.renderSubreddits();
            this.updateSubredditStats();
            this.saveSettings();
        }
    }

    removeSubreddit(subreddit) {
        this.settings.subreddits = this.settings.subreddits.filter(s => s !== subreddit);
        this.filteredSubreddits = this.filteredSubreddits.filter(s => s !== subreddit);

        this.renderSubreddits();
        this.updateSubredditStats();
        this.saveSettings();
    }

    updateSubredditStats() {
        const stats = document.getElementById('subredditStats');
        stats.textContent = `📋 Total subreddits: ${this.settings.subreddits.length}`;
    }

    // Combined methods
    renderAll() {
        this.renderKeywords();
        this.renderSubreddits();
    }

    updateAllStats() {
        this.updateKeywordStats();
        this.updateSubredditStats();
    }
}

// Initialize popup
new PopupManager();