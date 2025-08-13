import { DEFAULT_SETTINGS } from './defaults';

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
}

interface CounterData {
    totalRemoved: number;
    dailyRemoved: number;
    lastResetDate: string;
}

class Filter {
    private settings: FilterSettings = DEFAULT_SETTINGS;
    private counters: CounterData = {
        totalRemoved: 0,
        dailyRemoved: 0,
        lastResetDate: new Date().toDateString()
    };
    private observer: MutationObserver | null = null;

    // Add this public getter method
    public getCounters(): CounterData {
        return { ...this.counters };
    }

    async init() {
        await this.loadSettings();
        await this.loadCounters();
        if (this.settings.enabled) {
            this.removePosts();
            this.setupObserver();
        }
    }

    private async loadSettings(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterSettings']);
            if (result.filterSettings) {
                this.settings = { ...this.settings, ...result.filterSettings };
            } else {
                // Save default settings
                await this.saveSettings();
            }
        } catch (error) {
            console.log('Using default settings');
        }
    }

    private async loadCounters(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['filterCounters']);
            if (result.filterCounters) {
                this.counters = { ...this.counters, ...result.filterCounters };

                // Reset daily counter if it's a new day
                const today = new Date().toDateString();
                if (this.counters.lastResetDate !== today) {
                    this.counters.dailyRemoved = 0;
                    this.counters.lastResetDate = today;
                    await this.saveCounters();
                }
            } else {
                await this.saveCounters();
            }
        } catch (error) {
            console.log('Using default counters');
        }
    }

    private async saveSettings(): Promise<void> {
        try {
            await browser.storage.local.set({ filterSettings: this.settings });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    private async saveCounters(): Promise<void> {
        try {
            await browser.storage.local.set({ filterCounters: this.counters });

            // Only try to notify popup if it might be open - wrap in try-catch to handle when popup isn't available
            try {
                await browser.runtime.sendMessage({
                    type: 'countersUpdated',
                    counters: this.counters
                });
            } catch (error) {
                // Silently ignore - popup probably isn't open
                // This is normal behavior when popup is closed
            }
        } catch (error) {
            console.error('Failed to save counters:', error);
        }
    }

    private async incrementCounters(): Promise<void> {
        this.counters.totalRemoved++;
        this.counters.dailyRemoved++;
        await this.saveCounters();
    }

    private setupObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        if (element.tagName === 'ARTICLE' ||
                            element.tagName === 'SHREDDIT-POST' ||
                            element.querySelector('article') ||
                            element.querySelector('shreddit-post')) {
                            shouldCheck = true;
                        }
                    }
                });
            });

            if (shouldCheck) {
                this.removePosts();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    private removePosts(): void {
        const posts = document.querySelectorAll('article[aria-label], shreddit-post');

        posts.forEach((post) => {
            let shouldRemove = false;
            let reason = '';
            let matchedKeyword = '';
            let postUrl = '';
            let postTitle = '';

            // Get post URL and title from shreddit-post attributes
            const shredditPost = post.tagName === 'SHREDDIT-POST' ? post : post.querySelector('shreddit-post');
            if (shredditPost) {
                const permalink = shredditPost.getAttribute('permalink');
                if (permalink) {
                    postUrl = `https://www.reddit.com${permalink}`;
                }
                postTitle = shredditPost.getAttribute('post-title') || '';
            }

            // Check aria-label for filter keywords (for article elements)
            if (post.tagName === 'ARTICLE') {
                const ariaLabel = post.getAttribute('aria-label') || '';
                postTitle = ariaLabel; // Use aria-label as title if we don't have it from shreddit-post
                const matchResult = this.findMatchingKeyword(ariaLabel);
                if (matchResult) {
                    shouldRemove = true;
                    matchedKeyword = matchResult;
                    reason = `keyword "${matchedKeyword}" matched`;
                }
            }

            // Check subreddit name (for both article and shreddit-post elements)
            const subredditName = post.getAttribute('subreddit-prefixed-name') ||
                (shredditPost ? shredditPost.getAttribute('subreddit-prefixed-name') : '');
            if (subredditName && this.isBlockedSubreddit(subredditName)) {
                shouldRemove = true;
                reason = `blocked subreddit: ${subredditName}`;
            }

            // Also check if this is a shreddit-post inside an article
            if (post.tagName === 'SHREDDIT-POST') {
                const parentArticle = post.closest('article');
                if (parentArticle) {
                    const ariaLabel = parentArticle.getAttribute('aria-label') || '';
                    if (!postTitle) postTitle = ariaLabel;
                    const matchResult = this.findMatchingKeyword(ariaLabel);
                    if (matchResult) {
                        shouldRemove = true;
                        matchedKeyword = matchResult;
                        reason = `keyword "${matchedKeyword}" matched`;
                    }
                }
            }

            if (shouldRemove) {
                console.group('🛡️ FILTERED POST');
                console.log(`📝 Title: "${postTitle}"`);
                console.log(`🎯 Reason: ${reason}`);
                if (postUrl) {
                    console.log(`🔗 URL: ${postUrl}`);
                }
                console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
                console.groupEnd();

                // Remove the top-level article if it exists, otherwise remove the post itself
                const articleParent = post.closest('article');
                const elementToRemove = articleParent || post;
                elementToRemove.remove();

                // Increment counters
                this.incrementCounters();
            }
        });
    }

    // Updated method with word boundaries to fix false positives
    private findMatchingKeyword(text: string): string | null {
        const lowerText = text.toLowerCase();
        for (const keyword of this.settings.keywords) {
            // Use word boundaries to match whole words only
            const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(lowerText)) {
                return keyword;
            }
        }
        return null;
    }


    private isBlockedSubreddit(subredditName: string): boolean {
        const lowerSubreddit = subredditName.toLowerCase();
        return this.settings.subreddits.some(blocked =>
            blocked.toLowerCase() === lowerSubreddit
        );
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

let filter: Filter | null = null;

const main = () => {
    console.log(" Filter Extension loaded");
    filter = new Filter();
    filter.init();
};

// Listen for settings updates from popup
// Listen for settings updates from popup
if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'settingsUpdated') {
            if (filter) {
                filter.destroy();
            }
            main();
        } else if (message.type === 'requestCounters') {
            // Send current counter data to popup
            try {
                browser.runtime.sendMessage({
                    type: 'countersUpdated',
                    counters: filter?.getCounters() || { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() }
                }).catch(() => {
                    // Ignore errors - popup might have closed
                });
            } catch (error) {
                // Ignore errors - popup might not be available
            }
        }
    });
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    main();
} else {
    window.addEventListener('load', main);
}