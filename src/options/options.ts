import './options.css';
import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS } from '../defaults';

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
    minAccountAge: number;
    accountAgeFilterEnabled: boolean;
}

interface FilterCounters {
    totalRemoved: number;
    dailyRemoved: number;
    lastResetDate: string;
}

class OptionsManager {
    private settings: FilterSettings;
    private counters: FilterCounters;
    private filteredKeywords: string[];
    private filteredSubreddits: string[];

    constructor() {
        this.settings = DEFAULT_SETTINGS;
        this.counters = { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() };
        this.filteredKeywords = [...DEFAULT_SETTINGS.keywords];
        this.filteredSubreddits = [...DEFAULT_SETTINGS.subreddits];
        this.init();
    }

    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadCounters();
        this.setupEventListeners();
        this.renderAll();
        this.updateAllStats();
        this.updateCounterDisplay();
    }

    async loadSettings(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterSettings']);
            if (result.filterSettings) {
                this.settings = result.filterSettings as FilterSettings;
            } else {
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

        const accountAgeFilterEl = document.getElementById('enableAccountAgeFilter') as HTMLInputElement;
        if (accountAgeFilterEl) {
            accountAgeFilterEl.checked = this.settings.accountAgeFilterEnabled || false;
        }

        const ageSlider = document.getElementById('ageSlider') as HTMLInputElement;
        if (ageSlider) {
            ageSlider.value = String(this.settings.minAccountAge || 12);
            this.updateAgeDisplay(this.settings.minAccountAge || 12);
        }

        this.updateAccountAgeFilterUI();
    }

    async loadCounters(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterCounters']);
            if (result.filterCounters) {
                this.counters = result.filterCounters as FilterCounters;

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

    setupEventListeners(): void {
        const enableFilterEl = document.getElementById('enableFilter') as HTMLInputElement;
        if (enableFilterEl) {
            enableFilterEl.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.settings.enabled = target.checked;
                this.saveSettings();
            });
        }

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

        const accountAgeFilterEl = document.getElementById('enableAccountAgeFilter') as HTMLInputElement;
        if (accountAgeFilterEl) {
            accountAgeFilterEl.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.settings.accountAgeFilterEnabled = target.checked;
                this.updateAccountAgeFilterUI();
                this.saveSettings();
            });
        }

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
    }

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

        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (this.filteredKeywords.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No keywords found';
            container.appendChild(emptyState);
            return;
        }

        this.filteredKeywords.forEach((keyword) => {
            const item = document.createElement('div');
            item.className = 'list-item';

            const span = document.createElement('span');
            span.textContent = keyword;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.setAttribute('data-keyword', keyword);
            deleteBtn.addEventListener('click', () => {
                this.removeKeyword(keyword);
            });

            item.appendChild(span);
            item.appendChild(deleteBtn);
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
            stats.textContent = `Total keywords: ${this.settings.keywords.length}`;
        }
    }

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

        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (this.filteredSubreddits.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No subreddits found';
            container.appendChild(emptyState);
            return;
        }

        this.filteredSubreddits.forEach((subreddit) => {
            const item = document.createElement('div');
            item.className = 'list-item';

            const span = document.createElement('span');
            span.textContent = subreddit;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.setAttribute('data-subreddit', subreddit);
            deleteBtn.addEventListener('click', () => {
                this.removeSubreddit(subreddit);
            });

            item.appendChild(span);
            item.appendChild(deleteBtn);
            container.appendChild(item);
        });
    }

    addSubreddit(): void {
        const input = document.getElementById('subredditAddInput') as HTMLInputElement;
        if (!input) return;

        let subreddit = input.value.trim().toLowerCase();

        if (subreddit && !subreddit.startsWith('r/')) {
            subreddit = 'r/' + subreddit;
        }

        if (subreddit && subreddit !== 'r/' && !this.settings.subreddits.includes(subreddit)) {
            this.settings.subreddits.push(subreddit);
            this.settings.subreddits.sort();
            this.filteredSubreddits = [...this.settings.subreddits];

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
            stats.textContent = `Total subreddits: ${this.settings.subreddits.length}`;
        }
    }

    renderAll(): void {
        this.renderKeywords();
        this.renderSubreddits();
    }

    updateAllStats(): void {
        this.updateKeywordStats();
        this.updateSubredditStats();
    }

    updateAccountAgeFilterUI(): void {
        const ageFilterContainer = document.getElementById('ageFilterContainer');
        if (!ageFilterContainer) return;

        if (this.settings.accountAgeFilterEnabled) {
            ageFilterContainer.style.opacity = '1';
            ageFilterContainer.style.pointerEvents = 'auto';
        } else {
            ageFilterContainer.style.opacity = '0.5';
            ageFilterContainer.style.pointerEvents = 'none';
        }
    }

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
}

new OptionsManager();
