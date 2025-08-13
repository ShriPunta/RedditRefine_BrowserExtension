class PopupManager {
    constructor() {
        this.settings = { keywords: [], subreddits: [], enabled: true, minAccountAge: 12, apiPaused: false };
        this.counters = { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() };
        this.filteredKeywords = [];
        this.filteredSubreddits = [];
        this.currentTab = 'keywords';
        this.rateLimitInfo = { remaining: 500, reset: Date.now() + 600000, used: 0 };
        this.rateLimitTimer = null;
        this.isApiDetailsExpanded = false;
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
                await browser.tabs.sendMessage(tabs[0].id, { type: 'requestCounters' });
            }
        } catch (error) {
            // Silently ignore if content script not available or tab doesn't support messaging
            // This happens on non-Reddit pages or extension pages
        }
    }

    async loadSettings() {
        try {
            const result = await browser.storage.local.get(['filterSettings']);
            if (result.filterSettings) {
                this.settings = result.filterSettings;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        document.getElementById('enableFilter').checked = this.settings.enabled;
        this.filteredKeywords = [...this.settings.keywords];
        this.filteredSubreddits = [...this.settings.subreddits];
        // Initialize age filter slider
        const ageSlider = document.getElementById('ageSlider');
        ageSlider.value = this.settings.minAccountAge || 12;
        this.updateAgeDisplay(this.settings.minAccountAge || 12);

        // Initialize API status
        this.updateApiStatus();
    }

    async loadCounters() {
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

    async saveSettings() {
        try {
            await browser.storage.local.set({ filterSettings: this.settings });

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
            await browser.storage.local.set({ filterCounters: this.counters });
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

        // Age filter slider
        document.getElementById('ageSlider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.settings.minAccountAge = value;
            this.updateAgeDisplay(value);
            this.saveSettings();
        });

        // API pause button
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.toggleApiPause();
        });

        // API details expand/collapse
        document.getElementById('apiStatusHeader').addEventListener('click', () => {
            this.toggleApiDetails();
        });

        document.getElementById('expandBtn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent header click
            this.toggleApiDetails();
        });

        // Listen for counter updates from content script
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'countersUpdated') {
                    this.counters = message.counters;
                    this.updateCounterDisplay();
                    // Send acknowledgment
                    sendResponse({ received: true });
                } else if (message.type === 'rateLimitUpdate') {
                    console.log(`📨 Popup received rate limit update:`, message);
                    this.updateRateLimitInfo(message.remaining, message.reset, message.used);
                    sendResponse({ received: true });
                }
                // Return true to indicate we'll send a response asynchronously (even though we're doing it synchronously)
                return true;
            });
        }

        // Refresh counters on popup open
        this.refreshCounters();

        // Start rate limit countdown if needed
        this.startRateLimitTimer();
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

    // Age filter methods
    updateAgeDisplay(months) {
        const ageValue = document.getElementById('ageValue');
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

    // API status and rate limiting methods
    updateApiStatus() {
        const indicator = document.getElementById('apiIndicator');
        const statusText = document.getElementById('apiStatusText');
        const pauseBtn = document.getElementById('pauseBtn');

        if (this.settings.apiPaused) {
            indicator.className = 'api-indicator paused';
            statusText.textContent = 'API Paused';
            pauseBtn.textContent = 'Resume';
            pauseBtn.classList.add('active');
        } else if (this.rateLimitInfo.remaining <= 50) {
            indicator.className = 'api-indicator limited';
            statusText.textContent = 'Rate Limited';
            pauseBtn.textContent = 'Pause';
            pauseBtn.classList.remove('active');
        } else {
            indicator.className = 'api-indicator';
            statusText.textContent = 'API Ready';
            pauseBtn.textContent = 'Pause';
            pauseBtn.classList.remove('active');
        }
    }

    toggleApiPause() {
        this.settings.apiPaused = !this.settings.apiPaused;
        this.updateApiStatus();
        this.saveSettings();

        // Notify content script
        this.notifyContentScript({ type: 'apiPauseToggled', paused: this.settings.apiPaused });
    }

    updateRateLimitInfo(remaining, reset, used = null) {
        console.log(`🔄 Updating popup rate limit info: ${remaining}/${remaining + (used || 0)} (was: ${this.rateLimitInfo.remaining})`);
        this.rateLimitInfo.remaining = remaining;
        this.rateLimitInfo.reset = reset;
        if (used !== null) {
            this.rateLimitInfo.used = used;
        }

        const rateLimitInfo = document.getElementById('rateLimitInfo');
        // Only show rate limit info if we have real data and it's low
        if (remaining !== 500 && remaining <= 100) {
            const resetTime = new Date(reset);
            const now = new Date();
            const minutesLeft = Math.ceil((resetTime - now) / 60000);
            rateLimitInfo.textContent = `${remaining} left (${minutesLeft}m)`;
        } else {
            rateLimitInfo.textContent = '';
        }

        this.updateApiStatus();
        this.updateRateLimitDisplay();
        this.updateCooldownDisplay();
    }

    startRateLimitTimer() {
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
        }

        this.rateLimitTimer = setInterval(() => {
            const now = Date.now();
            if (now < this.rateLimitInfo.reset) {
                // Only update if we have actual data from content script (not initial constructor values)
                if (this.rateLimitInfo.remaining !== 500 && this.rateLimitInfo.remaining <= 100) {
                    const minutesLeft = Math.ceil((this.rateLimitInfo.reset - now) / 60000);
                    const rateLimitInfo = document.getElementById('rateLimitInfo');
                    rateLimitInfo.textContent = `${this.rateLimitInfo.remaining} left (${minutesLeft}m)`;
                }

                // Update detailed displays if expanded and we have real data
                if (this.isApiDetailsExpanded && this.rateLimitInfo.remaining !== 500) {
                    this.updateCooldownDisplay();
                    this.updateRateLimitDisplay();
                }
            }
        }, 5000); // Update every 5 seconds for better precision
    }

    toggleApiDetails() {
        this.isApiDetailsExpanded = !this.isApiDetailsExpanded;
        const apiDetails = document.getElementById('apiDetails');
        const expandBtn = document.getElementById('expandBtn');

        if (this.isApiDetailsExpanded) {
            apiDetails.classList.add('expanded');
            expandBtn.classList.add('expanded');
            this.updateRateLimitDisplay();
            this.updateCooldownDisplay();
        } else {
            apiDetails.classList.remove('expanded');
            expandBtn.classList.remove('expanded');
        }
    }

    updateRateLimitDisplay() {
        const rateLimitValues = document.getElementById('rateLimitValues');
        const rateLimitFill = document.getElementById('rateLimitFill');
        const rateLimitLabel = document.getElementById('rateLimitLabel');

        const remaining = this.rateLimitInfo.remaining;
        const used = this.rateLimitInfo.used || 0;
        const total = remaining + used; // Calculate total dynamically
        const percentage = total > 0 ? (remaining / total) * 100 : 0;

        rateLimitValues.textContent = `${remaining}/${total}`;
        rateLimitFill.style.width = `${Math.max(percentage, 1)}%`; // Minimum 1% for visibility

        // Update color based on remaining requests (absolute values for Reddit's higher limits)
        rateLimitFill.className = 'progress-fill';
        if (remaining <= 50) {
            rateLimitFill.classList.add('danger');
        } else if (remaining <= 100) {
            rateLimitFill.classList.add('warning');
        }

        rateLimitLabel.textContent = `${remaining} requests remaining`;
    }

    updateCooldownDisplay() {
        const cooldownTime = document.getElementById('cooldownTime');
        const cooldownFill = document.getElementById('cooldownFill');
        const cooldownLabel = document.getElementById('cooldownLabel');
        const cooldownSection = document.getElementById('cooldownSection');

        const now = Date.now();
        const resetTime = this.rateLimitInfo.reset;

        if (now >= resetTime) {
            // Reset period has passed
            cooldownSection.classList.add('hidden');
            return;
        }

        cooldownSection.classList.remove('hidden');

        const totalResetPeriod = 10 * 60 * 1000; // 10 minutes in milliseconds  
        const timeRemaining = resetTime - now;
        const percentage = Math.max(0, (timeRemaining / totalResetPeriod) * 100);

        // Format time remaining
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        cooldownTime.textContent = timeString;
        cooldownFill.style.width = `${percentage}%`;

        if (minutes > 0) {
            cooldownLabel.textContent = `Resets in ${minutes} minute${minutes === 1 ? '' : 's'}`;
        } else {
            cooldownLabel.textContent = `Resets in ${seconds} second${seconds === 1 ? '' : 's'}`;
        }
    }

    async notifyContentScript(message) {
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await browser.tabs.sendMessage(tabs[0].id, message);
            }
        } catch (error) {
            // Silently ignore if content script not available
        }
    }
}

// Initialize popup
new PopupManager();