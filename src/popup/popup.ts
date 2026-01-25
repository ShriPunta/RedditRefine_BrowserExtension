import './popup.css';
import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS } from '../defaults';
import filterPacksData from '../../filter-packs.json';

interface FilterPack {
    version: string;
    name: string;
    description: string;
    keywords: string[];
    subreddits: string[];
}

interface FilterItem {
    value: string;
    source?: string; // packId if from a pack
}

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
    minAccountAge: number;
    accountAgeFilterEnabled: boolean;
    enabledPacks?: string[]; // Track enabled pack IDs
    packVersions?: Record<string, string>; // packId -> version subscribed
    keywordSources?: Record<string, string>; // keyword -> packId
    subredditSources?: Record<string, string>; // subreddit -> packId
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
    enabled?: boolean;
}

class PopupManager {
    private settings: FilterSettings;
    private counters: FilterCounters;
    private filteredKeywords: string[];
    private filteredSubreddits: string[];
    private currentTab: string;
    private filterPacks: Record<string, FilterPack>;

    constructor() {
        this.settings = {
            ...DEFAULT_SETTINGS,
            enabledPacks: [],
            keywordSources: {},
            subredditSources: {}
        };
        this.counters = { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() };
        this.filteredKeywords = [...DEFAULT_SETTINGS.keywords];
        this.filteredSubreddits = [...DEFAULT_SETTINGS.subreddits];
        this.currentTab = 'keywords';
        this.filterPacks = filterPacksData as Record<string, FilterPack>;
        this.init();
    }

    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadCounters();

        // Check if this is first run
        await this.checkFirstRun();

        this.setupEventListeners();
        this.setupTabs();
        this.renderAll();
        this.renderPacks();
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
                this.settings = result.filterSettings as FilterSettings;
            } else {
                // Save defaults to storage for next time
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        // Auto-update subscribed packs to latest versions
        await this.updatePackVersions();

        const enableFilterEl = document.getElementById('enableFilter') as HTMLInputElement;
        if (enableFilterEl) {
            enableFilterEl.checked = this.settings.enabled;
        }
        this.updateFilterContentVisibility();
        this.filteredKeywords = [...this.settings.keywords];
        this.filteredSubreddits = [...this.settings.subreddits];

        // Initialize account age filter toggle
        const accountAgeFilterEl = document.getElementById('enableAccountAgeFilter') as HTMLInputElement;
        if (accountAgeFilterEl) {
            accountAgeFilterEl.checked = this.settings.accountAgeFilterEnabled || false;
        }

        // Initialize age filter slider
        const ageSlider = document.getElementById('ageSlider') as HTMLInputElement;
        if (ageSlider) {
            ageSlider.value = String(this.settings.minAccountAge || 12);
            this.updateAgeDisplay(this.settings.minAccountAge || 12);
        }

        // Update UI state based on account age filter setting
        this.updateAccountAgeFilterUI();
    }

    async loadCounters(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterCounters']);
            if (result.filterCounters) {
                this.counters = result.filterCounters as FilterCounters;

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
                this.updateFilterContentVisibility();
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

        // Account age filter toggle
        const accountAgeFilterEl = document.getElementById('enableAccountAgeFilter') as HTMLInputElement;
        if (accountAgeFilterEl) {
            accountAgeFilterEl.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.settings.accountAgeFilterEnabled = target.checked;
                this.updateAccountAgeFilterUI();
                this.saveSettings();

                // Notify content script specifically about account age filter toggle
                this.notifyContentScript({
                    type: 'accountAgeFilterToggled',
                    enabled: target.checked
                });
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
        if (browser.runtime) {
            browser.runtime.onMessage.addListener((message: unknown) => {
                const msg = message as Message;
                if (msg.type === 'countersUpdated' && msg.counters) {
                    this.counters = msg.counters;
                    this.updateCounterDisplay();
                }
            });
        }

        // Options button
        const optionsBtn = document.getElementById('optionsBtn');
        if (optionsBtn) {
            optionsBtn.addEventListener('click', () => {
                browser.runtime.openOptionsPage();
            });
        }

        // Refresh counters on popup open
        this.refreshCounters();

        // Onboarding modal event listeners
        const skipOnboarding = document.getElementById('skipOnboarding');
        if (skipOnboarding) {
            skipOnboarding.addEventListener('click', () => {
                this.closeOnboarding();
            });
        }

        const applyOnboarding = document.getElementById('applyOnboarding');
        if (applyOnboarding) {
            applyOnboarding.addEventListener('click', () => {
                this.applyOnboardingSelection();
            });
        }
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

        // Clear container by removing children
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (this.filteredKeywords.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';

            const icon = document.createElement('div');
            icon.className = 'empty-state-icon';
            icon.textContent = '🔍';

            const text = document.createElement('div');
            text.textContent = 'No keywords found';

            emptyState.appendChild(icon);
            emptyState.appendChild(text);
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

        // Clear container by removing children
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (this.filteredSubreddits.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';

            const icon = document.createElement('div');
            icon.className = 'empty-state-icon';
            icon.textContent = '🔍';

            const text = document.createElement('div');
            text.textContent = 'No subreddits found';

            emptyState.appendChild(icon);
            emptyState.appendChild(text);
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

    // Account age filter methods
    updateAccountAgeFilterUI(): void {
        const ageFilterContainer = document.getElementById('ageFilterContainer');
        if (!ageFilterContainer) return;

        if (this.settings.accountAgeFilterEnabled) {
            ageFilterContainer.style.display = 'block';
        } else {
            ageFilterContainer.style.display = 'none';
        }
    }

    updateFilterContentVisibility(): void {
        const filterContent = document.getElementById('filterContent');
        if (!filterContent) return;

        if (this.settings.enabled) {
            filterContent.style.display = 'block';
        } else {
            filterContent.style.display = 'none';
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

    // Filter Packs methods
    renderPacks(): void {
        const container = document.getElementById('packsContainer');
        if (!container) return;

        // Clear container
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const enabledPacks = this.settings.enabledPacks || [];

        Object.entries(this.filterPacks).forEach(([packId, pack]) => {
            const isEnabled = enabledPacks.includes(packId);
            const card = document.createElement('div');
            card.className = 'pack-card';
            if (isEnabled) {
                card.classList.add('enabled');
            }

            const header = document.createElement('div');
            header.className = 'pack-header';

            const title = document.createElement('h3');
            title.className = 'pack-title';
            title.textContent = pack.name;

            const toggle = document.createElement('button');
            toggle.className = 'pack-toggle';
            toggle.textContent = isEnabled ? 'Enabled' : 'Enable';
            toggle.addEventListener('click', () => {
                if (isEnabled) {
                    this.disablePack(packId);
                } else {
                    this.enablePack(packId);
                }
            });

            header.appendChild(title);
            header.appendChild(toggle);

            const description = document.createElement('p');
            description.className = 'pack-description';
            description.textContent = pack.description;

            const counts = document.createElement('div');
            counts.className = 'pack-counts';

            const keywordCount = document.createElement('span');
            keywordCount.textContent = `${pack.keywords.length} keywords`;

            const subredditCount = document.createElement('span');
            subredditCount.textContent = `${pack.subreddits.length} subreddits`;

            counts.appendChild(keywordCount);

            const separator = document.createElement('span');
            separator.textContent = ' • ';
            counts.appendChild(separator);
            counts.appendChild(subredditCount);

            card.appendChild(header);
            card.appendChild(description);
            card.appendChild(counts);

            container.appendChild(card);
        });
    }

    enablePack(packId: string): void {
        const pack = this.filterPacks[packId];
        if (!pack) return;

        // Initialize tracking structures if needed
        if (!this.settings.enabledPacks) this.settings.enabledPacks = [];
        if (!this.settings.packVersions) this.settings.packVersions = {};
        if (!this.settings.keywordSources) this.settings.keywordSources = {};
        if (!this.settings.subredditSources) this.settings.subredditSources = {};

        // Add pack to enabled list and track version
        if (!this.settings.enabledPacks.includes(packId)) {
            this.settings.enabledPacks.push(packId);
        }
        this.settings.packVersions[packId] = pack.version;

        // Add keywords with source tracking
        pack.keywords.forEach(keyword => {
            const kw = keyword.toLowerCase();
            if (!this.settings.keywords.includes(kw)) {
                this.settings.keywords.push(kw);
                this.settings.keywordSources![kw] = packId;
            }
        });

        // Add subreddits with source tracking
        pack.subreddits.forEach(subreddit => {
            const sub = subreddit.toLowerCase();
            const subWithPrefix = sub.startsWith('r/') ? sub : `r/${sub}`;
            if (!this.settings.subreddits.includes(subWithPrefix)) {
                this.settings.subreddits.push(subWithPrefix);
                this.settings.subredditSources![subWithPrefix] = packId;
            }
        });

        // Sort arrays
        this.settings.keywords.sort();
        this.settings.subreddits.sort();

        // Update UI
        this.filteredKeywords = [...this.settings.keywords];
        this.filteredSubreddits = [...this.settings.subreddits];
        this.renderPacks();
        this.renderAll();
        this.updateAllStats();
        this.saveSettings();
    }

    disablePack(packId: string): void {
        const pack = this.filterPacks[packId];
        if (!pack) return;

        // Remove pack from enabled list
        if (this.settings.enabledPacks) {
            this.settings.enabledPacks = this.settings.enabledPacks.filter(id => id !== packId);
        }

        // Remove keywords that came from this pack
        if (this.settings.keywordSources) {
            this.settings.keywords = this.settings.keywords.filter(kw =>
                this.settings.keywordSources![kw] !== packId
            );
            // Clean up sources
            Object.keys(this.settings.keywordSources).forEach(kw => {
                if (this.settings.keywordSources![kw] === packId) {
                    delete this.settings.keywordSources![kw];
                }
            });
        }

        // Remove subreddits that came from this pack
        if (this.settings.subredditSources) {
            this.settings.subreddits = this.settings.subreddits.filter(sub =>
                this.settings.subredditSources![sub] !== packId
            );
            // Clean up sources
            Object.keys(this.settings.subredditSources).forEach(sub => {
                if (this.settings.subredditSources![sub] === packId) {
                    delete this.settings.subredditSources![sub];
                }
            });
        }

        // Update UI
        this.filteredKeywords = [...this.settings.keywords];
        this.filteredSubreddits = [...this.settings.subreddits];
        this.renderPacks();
        this.renderAll();
        this.updateAllStats();
        this.saveSettings();
    }

    async updatePackVersions(): Promise<void> {
        if (!this.settings.enabledPacks || this.settings.enabledPacks.length === 0) {
            return;
        }

        // Initialize version tracking if missing
        if (!this.settings.packVersions) {
            this.settings.packVersions = {};
        }

        let hasUpdates = false;

        for (const packId of this.settings.enabledPacks) {
            const pack = this.filterPacks[packId];
            if (!pack) continue;

            const subscribedVersion = this.settings.packVersions[packId];

            // If no version recorded or version changed, update
            if (!subscribedVersion || subscribedVersion !== pack.version) {
                console.log(`Updating pack "${pack.name}" from ${subscribedVersion || 'unknown'} to ${pack.version}`);

                // Initialize tracking if needed
                if (!this.settings.keywordSources) this.settings.keywordSources = {};
                if (!this.settings.subredditSources) this.settings.subredditSources = {};

                // Merge new keywords
                pack.keywords.forEach(keyword => {
                    const kw = keyword.toLowerCase();
                    if (!this.settings.keywords.includes(kw)) {
                        this.settings.keywords.push(kw);
                        this.settings.keywordSources![kw] = packId;
                    }
                });

                // Merge new subreddits
                pack.subreddits.forEach(subreddit => {
                    const sub = subreddit.toLowerCase();
                    const subWithPrefix = sub.startsWith('r/') ? sub : `r/${sub}`;
                    if (!this.settings.subreddits.includes(subWithPrefix)) {
                        this.settings.subreddits.push(subWithPrefix);
                        this.settings.subredditSources![subWithPrefix] = packId;
                    }
                });

                // Update version
                this.settings.packVersions[packId] = pack.version;
                hasUpdates = true;
            }
        }

        if (hasUpdates) {
            // Sort arrays
            this.settings.keywords.sort();
            this.settings.subreddits.sort();

            // Save updated settings (also notifies content script)
            await this.saveSettings();
        }
    }

    // Onboarding methods
    async checkFirstRun(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['hasSeenOnboarding']);
            if (!result.hasSeenOnboarding) {
                this.showOnboarding();
            }
        } catch (error) {
            console.error('Failed to check first run:', error);
        }
    }

    showOnboarding(): void {
        const modal = document.getElementById('onboardingModal');
        if (!modal) return;

        // Populate packs
        const container = document.getElementById('onboardingPacks');
        if (!container) return;

        // Clear container
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        Object.entries(this.filterPacks).forEach(([packId, pack]) => {
            const item = document.createElement('div');
            item.className = 'onboarding-pack-item';
            item.dataset.packId = packId;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'onboarding-pack-checkbox';
            checkbox.id = `onboarding-${packId}`;

            const info = document.createElement('div');
            info.className = 'onboarding-pack-info';

            const name = document.createElement('div');
            name.className = 'onboarding-pack-name';
            name.textContent = pack.name;

            const description = document.createElement('div');
            description.className = 'onboarding-pack-description';
            description.textContent = pack.description;

            info.appendChild(name);
            info.appendChild(description);

            item.appendChild(checkbox);
            item.appendChild(info);

            // Click item to toggle checkbox
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                item.classList.toggle('selected', checkbox.checked);
            });

            checkbox.addEventListener('change', () => {
                item.classList.toggle('selected', checkbox.checked);
            });

            container.appendChild(item);
        });

        modal.classList.add('show');
    }

    closeOnboarding(): void {
        const modal = document.getElementById('onboardingModal');
        if (modal) {
            modal.classList.remove('show');
        }
        // Mark as seen
        browser.storage.local.set({ hasSeenOnboarding: true });
    }

    applyOnboardingSelection(): void {
        const container = document.getElementById('onboardingPacks');
        if (!container) return;

        const checkboxes = container.querySelectorAll('.onboarding-pack-checkbox');
        checkboxes.forEach((checkbox) => {
            const input = checkbox as HTMLInputElement;
            if (input.checked) {
                const packId = input.id.replace('onboarding-', '');
                this.enablePack(packId);
            }
        });

        this.closeOnboarding();
    }
}

// Initialize popup
new PopupManager();