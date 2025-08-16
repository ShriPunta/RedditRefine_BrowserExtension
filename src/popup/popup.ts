import './popup.css';
import { DEFAULT_SETTINGS } from '../defaults';

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
    minAccountAge: number;
}

interface FilterCounters {
    totalRemoved: number;
    dailyRemoved: number;
    lastResetDate: string;
}

interface Message {
    type: string;
    counters?: FilterCounters;
    paused?: boolean;
    remaining?: number;
    reset?: number;
    used?: number;
}

class PopupManager {
    private settings: FilterSettings;
    private counters: FilterCounters;
    private filteredKeywords: string[];
    private filteredSubreddits: string[];
    private currentTab: string;

    constructor() {
        this.settings = DEFAULT_SETTINGS;
        this.counters = { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() };
        this.filteredKeywords = [...DEFAULT_SETTINGS.keywords];
        this.filteredSubreddits = [...DEFAULT_SETTINGS.subreddits];
        this.currentTab = 'keywords';
        this.init();
    }

    async init(): Promise<void> {
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
                await browser.tabs.sendMessage(tabs[0].id!, { type: 'requestCounters' });
            }
        } catch (error) {
            // Silently ignore if content script not available or tab doesn't support messaging
            // This happens on non-Reddit pages or extension pages
        }
    }

    async loadSettings(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterSettings']);
            if (result.filterSettings) {
                this.settings = result.filterSettings;
            } else {
                // Save defaults to storage for next time
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        const enableFilterEl = document.getElementById('enableFilter') as HTMLInputElement;
        if (enableFilterEl) {
            enableFilterEl.checked = this.settings.enabled;
        }
        this.filteredKeywords = [...this.settings.keywords];
        this.filteredSubreddits = [...this.settings.subreddits];

        // Initialize age filter slider
        const ageSlider = document.getElementById('ageSlider') as HTMLInputElement;
        if (ageSlider) {
            ageSlider.value = String(this.settings.minAccountAge || 12);
            this.updateAgeDisplay(this.settings.minAccountAge || 12);
        }
    }

    async loadCounters(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterCounters']);
            if (result.filterCounters) {
                this.counters = result.filterCounters;

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

    async saveSettings(): Promise<void> {
        try {
            await browser.storage.local.set({ filterSettings: this.settings });

            // Notify content script of settings update
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id!, { type: 'settingsUpdated' });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    async saveCounters(): Promise<void> {
        try {
            await browser.storage.local.set({ filterCounters: this.counters });
        } catch (error) {
            console.error('Failed to save counters:', error);
        }
    }

    updateCounterDisplay(): void {
        const totalElement = document.getElementById('totalCounter');
        const dailyElement = document.getElementById('dailyCounter');

        if (totalElement) {
            totalElement.textContent = this.counters.totalRemoved.toLocaleString();
        }

        if (dailyElement) {
            dailyElement.textContent = this.counters.dailyRemoved.toLocaleString();
        }
    }

    setupTabs(): void {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                if (!tabName) return;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active content
                tabContents.forEach(content => content.classList.remove('active'));
                const targetContent = document.getElementById(`${tabName}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                this.currentTab = tabName;
            });
        });
    }

    setupEventListeners(): void {
        // Enable/disable toggle
        const enableFilterEl = document.getElementById('enableFilter') as HTMLInputElement;
        if (enableFilterEl) {
            enableFilterEl.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.settings.enabled = target.checked;
                this.saveSettings();
            });
        }

        // Keywords tab
        const keywordSearchInput = document.getElementById('keywordSearchInput') as HTMLInputElement;
        if (keywordSearchInput) {
            keywordSearchInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.filterKeywords(target.value);
            });
        }

        const keywordAddBtn = document.getElementById('keywordAddBtn');
        if (keywordAddBtn) {
            keywordAddBtn.addEventListener('click', () => {
                this.addKeyword();
            });
        }

        const keywordAddInput = document.getElementById('keywordAddInput') as HTMLInputElement;
        if (keywordAddInput) {
            keywordAddInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addKeyword();
                }
            });
        }

        // Subreddits tab
        const subredditSearchInput = document.getElementById('subredditSearchInput') as HTMLInputElement;
        if (subredditSearchInput) {
            subredditSearchInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.filterSubreddits(target.value);
            });
        }

        const subredditAddBtn = document.getElementById('subredditAddBtn');
        if (subredditAddBtn) {
            subredditAddBtn.addEventListener('click', () => {
                this.addSubreddit();
            });
        }

        const subredditAddInput = document.getElementById('subredditAddInput') as HTMLInputElement;
        if (subredditAddInput) {
            subredditAddInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addSubreddit();
                }
            });
        }

        // Age filter slider
        const ageSlider = document.getElementById('ageSlider') as HTMLInputElement;
        if (ageSlider) {
            ageSlider.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const value = parseInt(target.value);
                this.settings.minAccountAge = value;
                this.updateAgeDisplay(value);
                this.saveSettings();
            });
        }


        // Listen for counter updates from content script
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
                if (message.type === 'countersUpdated' && message.counters) {
                    this.counters = message.counters;
                    this.updateCounterDisplay();
                    // Send acknowledgment
                    sendResponse({ received: true });
                }
                // Return true to indicate we'll send a response asynchronously (even though we're doing it synchronously)
                return true;
            });
        }

        // Refresh counters on popup open
        this.refreshCounters();
    }

    async refreshCounters(): Promise<void> {
        await this.loadCounters();
        this.updateCounterDisplay();
    }

    // Keywords methods
    filterKeywords(searchTerm: string): void {
        const term = searchTerm.toLowerCase();
        this.filteredKeywords = this.settings.keywords.filter(keyword =>
            keyword.toLowerCase().includes(term)
        );
        this.renderKeywords();
    }

    renderKeywords(): void {
        const container = document.getElementById('keywordsContainer');
        if (!container) return;

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

            const deleteBtn = item.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.removeKeyword(keyword);
                });
            }

            container.appendChild(item);
        });
    }

    addKeyword(): void {
        const input = document.getElementById('keywordAddInput') as HTMLInputElement;
        if (!input) return;

        const keyword = input.value.trim().toLowerCase();

        if (keyword && !this.settings.keywords.includes(keyword)) {
            this.settings.keywords.push(keyword);
            this.settings.keywords.sort();
            this.filteredKeywords = [...this.settings.keywords];

            // Clear search and input
            const searchInput = document.getElementById('keywordSearchInput') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
            }
            input.value = '';

            this.renderKeywords();
            this.updateKeywordStats();
            this.saveSettings();
        }
    }

    removeKeyword(keyword: string): void {
        this.settings.keywords = this.settings.keywords.filter(k => k !== keyword);
        this.filteredKeywords = this.filteredKeywords.filter(k => k !== keyword);

        this.renderKeywords();
        this.updateKeywordStats();
        this.saveSettings();
    }

    updateKeywordStats(): void {
        const stats = document.getElementById('keywordStats');
        if (stats) {
            stats.textContent = `📝 Total keywords: ${this.settings.keywords.length}`;
        }
    }

    // Subreddits methods
    filterSubreddits(searchTerm: string): void {
        const term = searchTerm.toLowerCase();
        this.filteredSubreddits = this.settings.subreddits.filter(subreddit =>
            subreddit.toLowerCase().includes(term)
        );
        this.renderSubreddits();
    }

    renderSubreddits(): void {
        const container = document.getElementById('subredditsContainer');
        if (!container) return;

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

            const deleteBtn = item.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.removeSubreddit(subreddit);
                });
            }

            container.appendChild(item);
        });
    }

    addSubreddit(): void {
        const input = document.getElementById('subredditAddInput') as HTMLInputElement;
        if (!input) return;

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
            const searchInput = document.getElementById('subredditSearchInput') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
            }
            input.value = '';

            this.renderSubreddits();
            this.updateSubredditStats();
            this.saveSettings();
        }
    }

    removeSubreddit(subreddit: string): void {
        this.settings.subreddits = this.settings.subreddits.filter(s => s !== subreddit);
        this.filteredSubreddits = this.filteredSubreddits.filter(s => s !== subreddit);

        this.renderSubreddits();
        this.updateSubredditStats();
        this.saveSettings();
    }

    updateSubredditStats(): void {
        const stats = document.getElementById('subredditStats');
        if (stats) {
            stats.textContent = `📋 Total subreddits: ${this.settings.subreddits.length}`;
        }
    }

    // Combined methods
    renderAll(): void {
        this.renderKeywords();
        this.renderSubreddits();
    }

    updateAllStats(): void {
        this.updateKeywordStats();
        this.updateSubredditStats();
    }

    // Age filter methods
    updateAgeDisplay(months: number): void {
        const ageValue = document.getElementById('ageValue');
        if (!ageValue) return;
        if (months < 12) {
            ageValue.textContent = `${months} month${months === 1 ? '' : 's'}`;
        } else {
            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            if (remainingMonths === 0) {
                ageValue.textContent = `${years} year${years === 1 ? '' : 's'}`;
            } else {
                ageValue.textContent = `${years}y ${remainingMonths}m`;
            }
        }
    }















    async notifyContentScript(message: any): Promise<void> {
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].id) {
                await browser.tabs.sendMessage(tabs[0].id, message);
            }
        } catch (error) {
            // Silently ignore if content script not available
        }
    }
}

// Initialize popup
new PopupManager();