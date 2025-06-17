// Import the text files
import defaultKeywordsText from '../default_keywords.txt';
import defaultSubredditsText from '../default_subreddits.txt';

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

const DEFAULT_KEYWORDS = (defaultKeywordsText as string)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

const DEFAULT_SUBREDDITS = (defaultSubredditsText as string)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(subreddit => `r/${subreddit}`); // Add r/ prefix back

class PoliticalFilter {
    private settings: FilterSettings = {
        keywords: DEFAULT_KEYWORDS,
        subreddits: DEFAULT_SUBREDDITS,
        enabled: true
    };
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
            this.removePoliticalPosts();
            this.setupObserver();
        }
    }

    private async loadSettings(): Promise<void> {
        try {
            const result = await browser.storage.local.get(['politicalFilterSettings']);
            if (result.politicalFilterSettings) {
                this.settings = { ...this.settings, ...result.politicalFilterSettings };
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
            const result = await browser.storage.local.get(['politicalFilterCounters']);
            if (result.politicalFilterCounters) {
                this.counters = { ...this.counters, ...result.politicalFilterCounters };

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
            await browser.storage.local.set({ politicalFilterSettings: this.settings });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    private async saveCounters(): Promise<void> {
        try {
            await browser.storage.local.set({ politicalFilterCounters: this.counters });

            // Notify popup of counter updates using runtime.sendMessage instead of tabs.sendMessage
            try {
                browser.runtime.sendMessage({
                    type: 'countersUpdated',
                    counters: this.counters
                });
            } catch (error) {
                // Ignore errors - popup might not be open
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
                this.removePoliticalPosts();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    private removePoliticalPosts(): void {
        // Check both article elements and shreddit-post elements
        const posts = document.querySelectorAll('article[aria-label], shreddit-post');

        posts.forEach((post) => {
            let shouldRemove = false;
            let reason = '';

            // Check aria-label for political keywords (for article elements)
            if (post.tagName === 'ARTICLE') {
                const ariaLabel = post.getAttribute('aria-label')?.toLowerCase() || '';
                if (this.isPolitical(ariaLabel)) {
                    shouldRemove = true;
                    reason = `political keyword in title: "${ariaLabel}"`;
                }
            }

            // Check subreddit name (for both article and shreddit-post elements)
            const subredditName = post.getAttribute('subreddit-prefixed-name') || '';
            if (subredditName && this.isBlockedSubreddit(subredditName)) {
                shouldRemove = true;
                reason = `blocked subreddit: ${subredditName}`;
            }

            // Also check if this is a shreddit-post inside an article
            if (post.tagName === 'SHREDDIT-POST') {
                const parentArticle = post.closest('article');
                if (parentArticle) {
                    const ariaLabel = parentArticle.getAttribute('aria-label')?.toLowerCase() || '';
                    if (this.isPolitical(ariaLabel)) {
                        shouldRemove = true;
                        reason = `political keyword in title: "${ariaLabel}"`;
                    }
                }
            }

            if (shouldRemove) {
                console.log('Removing post:', reason);
                // Remove the top-level article if it exists, otherwise remove the post itself
                const articleParent = post.closest('article');
                const elementToRemove = articleParent || post;
                elementToRemove.remove();

                // Increment counters
                this.incrementCounters();
            }
        });
    }

    private isPolitical(text: string): boolean {
        const lowerText = text.toLowerCase();
        return this.settings.keywords.some(keyword =>
            lowerText.includes(keyword.toLowerCase())
        );
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

let filter: PoliticalFilter | null = null;

const main = () => {
    console.log(" Filter Extension loaded");
    filter = new PoliticalFilter();
    filter.init();
};

// Listen for settings updates from popup
if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((message) => {
        // Add this to the existing message listener
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((message) => {
                if (message.type === 'settingsUpdated') {
                    if (filter) {
                        filter.destroy();
                    }
                    main();
                } else if (message.type === 'requestCounters') {
                    // Send current counter data to popup
                    browser.runtime.sendMessage({
                        type: 'countersUpdated',
                        counters: filter?.getCounters() || { totalRemoved: 0, dailyRemoved: 0, lastResetDate: new Date().toDateString() }
                    });
                }
            });
        }
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    main();
} else {
    window.addEventListener('load', main);
}