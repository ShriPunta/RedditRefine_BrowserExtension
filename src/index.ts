// Import the text files
import { DEFAULT_SETTINGS } from './defaults';

interface Post {
    url: string;
    title: string;
    tagName: string;
    subreddit: string;
    author: string;
    shouldRemove: boolean;
    removalReason: string;
}

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
    minAccountAge: number; // in months
    apiPaused: boolean;
}

interface CounterData {
    totalRemoved: number;
    dailyRemoved: number;
    lastResetDate: string;
}

interface RateLimitInfo {
    remaining: number;
    reset: number; // timestamp
    used: number;
}

interface UserAgeCache {
    [username: string]: {
        createdAt: Date;
        fetchedAt: Date;
    };
}

class Filter {
    private settings: FilterSettings = DEFAULT_SETTINGS;
    private counters: CounterData = {
        totalRemoved: 0,
        dailyRemoved: 0,
        lastResetDate: new Date().toDateString()
    };
    private observer: MutationObserver | null = null;
    private elementToPostMapProcessAsync: Map<Element, Post> = new Map();
    private asyncPostProcessorFn: any = null;
    // Add this public getter method
    public getCounters(): CounterData {
        return { ...this.counters };
    }

    async init() {
        await this.loadSettings();
        await this.loadCounters();
        if (this.settings.enabled) {
            // For the first load, remove the posts
            this.removePostsFirstPass();
            // Then set up the observer to handle infinite scrolling
            // This method purely sets up the observer which adds elements to elementsToProcessPostMap
            this.setupObserver();

            // Non blocking IO timeout which runs async and processes the elementsToProcessPostMap
            if (!this.asyncPostProcessorFn) {
                this.asyncPostProcessorFn = setInterval(() => {
                    this.removePostsSecondPass();
                }, 1000);
            }
        }
    }

    private async removePostsSecondPass() {
        // Convert Map to array for processing
        const entries = Array.from(this.elementToPostMapProcessAsync.entries());

        for (const [element, post] of entries) {
            // Check if element still exists before processing
            if (!document.contains(element)) {
                this.elementToPostMapProcessAsync.delete(element);
                continue;
            }

            try {
                await this.parseAuthorFromElementCalcAge(element, post);
                // Remove from map after processing (success or failure)
                this.elementToPostMapProcessAsync.delete(element);
            } catch (error) {
                console.error('Error processing element:', error);
                this.elementToPostMapProcessAsync.delete(element);
            }
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
                this.removePostsFirstPass();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    private convertElementToPost(ele: Element) {
        let postInstance: Post = {
            title: '',
            url: '',
            subreddit: '',
            matchedKeyword: '',
            author: '',
            tagName: ele.tagName,
            shouldRemove: false,
            removalReason: '',
        }

        // Get post URL and title from shreddit-post attributes
        const shredditPost = postInstance.tagName === 'SHREDDIT-POST' ? ele : ele.querySelector('shreddit-post');
        if (shredditPost) {
            const permalink = shredditPost.getAttribute('permalink');
            if (permalink) {
                postInstance.url = `https://www.reddit.com${permalink}`;
            }
            postInstance.title = shredditPost.getAttribute('post-title') || '';
        }

        // Check aria-label for filter keywords (for article elements)
        if (ele.tagName === 'ARTICLE') {
            postInstance.title = ele.getAttribute('aria-label') || '';
            const matchResult = this.findMatchingKeyword(postInstance.title);
            if (matchResult) {
                postInstance.shouldRemove = true;
                postInstance.matchedKeyword = matchResult;
                postInstance.removalReason = `keyword "${matchResult}" matched`;
            }
        }

        // Check subreddit name (for both article and shreddit-post elements)
        postInstance.subreddit = (ele.getAttribute('subreddit-prefixed-name') ||
            (shredditPost ? shredditPost.getAttribute('subreddit-prefixed-name') : '')) ?? '';
        if (postInstance.subreddit && this.isBlockedSubreddit(postInstance.subreddit)) {
            postInstance.shouldRemove = true;
            postInstance.removalReason = `blocked subreddit: ${postInstance.subreddit}`;
        }
        // If not filtered by subreddit, check for matching keyword in shreddit-post inside an article
        if (!postInstance.shouldRemove && postInstance.tagName === 'SHREDDIT-POST') {
            const parentArticle = ele.closest('article');
            if (parentArticle) {
                const ariaLabel = parentArticle.getAttribute('aria-label') || '';
                if (!postInstance.title) postInstance.title = ariaLabel;
                const matchResult = this.findMatchingKeyword(ariaLabel);
                if (matchResult) {
                    postInstance.shouldRemove = true;
                    postInstance.matchedKeyword = matchResult;
                    postInstance.removalReason = `keyword "${matchResult}" matched`;
                }
            }
        }
        return postInstance;
    }

    private fetchArticleOrShredditPostsOnPage() {
        return document.querySelectorAll('article[aria-label], shreddit-post');
    }

    private async parseAuthorFromElementCalcAge(ele: Element, post: Post) {
        // If not filtered by keywords/subreddits, check user age (only for posts that would otherwise pass)
        if (post.tagName === 'SHREDDIT-POST') {
            post.author = ele.getAttribute('author') ?? '';
            if (post.author) {
                try {
                    const createdAt = await this.fetchUserProfile(post.author);
                    if (createdAt && this.isAccountTooYoung(createdAt)) {
                        post.shouldRemove = true;
                        const ageInMonths = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                        post.removalReason = `account too young: ${post.author} (${ageInMonths.toFixed(1)} months old, minimum: ${this.settings.minAccountAge})`;

                        this.logPostInConsole(post);

                        this.removeElementOrClosestParentArticle(ele);
                    }
                } catch (error) {
                    console.error(`Error checking age for user ${post.author}:`, error);
                }
            }
        }
    }

    private removePostsFirstPass() {
        const eles = this.fetchArticleOrShredditPostsOnPage();

        eles.forEach((ele) => {
            const post = this.convertElementToPost(ele);



            if (post.shouldRemove) {
                this.logPostInConsole(post);

                this.removeElementOrClosestParentArticle(ele);

                // Increment counters
                this.incrementCounters();
            } else {
                this.elementToPostMapProcessAsync.set(ele, post);
            }
        });
    }

    private removeElementOrClosestParentArticle(ele: Element) {
        // Remove the top-level article if it exists, otherwise remove the post itself
        if (document.contains(ele)) {
            // Safe to manipulate/remove
            const articleParent = ele.closest('article');
            const elementToRemove = articleParent || ele;
            elementToRemove.remove();
        }


    }
    private logPostInConsole(post: Post) {
        console.group('🛡️ FILTERED POST');
        console.log(`📝 Title: "${post.title}"`);
        console.log(`🎯 Reason: ${post.removalReason}`);
        if (post.url) {
            console.log(`🔗 URL: ${post.url}`);
        }
        console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
        console.groupEnd();
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

    private async fetchUserProfile(username: string): Promise<Date | null> {
        // Check cache first (cache for 1 hour)
        const cached = this.userAgeCache[username];
        if (cached && (Date.now() - cached.fetchedAt.getTime()) < 3600000) {
            return cached.createdAt;
        }

        // Check if API is paused
        if (this.settings.apiPaused) {
            console.log(`🚫 API paused, skipping age check for user: ${username}`);
            return null;
        }

        // Check rate limits
        if (this.rateLimitInfo.remaining <= 5) {
            console.log(`⚠️ Rate limit low (${this.rateLimitInfo.remaining}), skipping age check for user: ${username}`);
            return null;
        }

        // Avoid duplicate requests
        if (this.pendingRequests.has(username)) {
            return null;
        }

        this.pendingRequests.add(username);

        try {
            const url = `https://www.reddit.com/svc/shreddit/profiles/profile-header-details/${username}`;
            const response = await fetch(url, {
                credentials: 'include', // Include session cookies
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': navigator.userAgent
                }
            });

            // Update rate limit info from response headers
            this.updateRateLimitFromHeaders(response);

            if (!response.ok) {
                console.log(`❌ Failed to fetch user profile for ${username}: ${response.status}`);
                return null;
            }

            const html = await response.text();
            const createdAt = this.parseAccountCreationDate(html);

            if (createdAt) {
                // Cache the result
                this.userAgeCache[username] = {
                    createdAt,
                    fetchedAt: new Date()
                };
                console.log(`✅ Fetched age for user ${username}: ${createdAt.toISOString()}`);
            }

            return createdAt;
        } catch (error) {
            console.error(`🚫 Error fetching user profile for ${username}:`, error);
            return null;
        } finally {
            this.pendingRequests.delete(username);
        }
    }

    private parseAccountCreationDate(html: string): Date | null {
        try {
            // Create a temporary DOM element to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Look for the cake day element using the CSS selector path
            const cakeDayElement = tempDiv.querySelector('div.flex:nth-child(3) > p:nth-child(1) > faceplate-tooltip:nth-child(1) > span:nth-child(1) > time:nth-child(1)');

            if (!cakeDayElement) {
                // Fallback: search for any time element with data-testid="cake-day"
                const fallbackElement = tempDiv.querySelector('time[data-testid="cake-day"]');
                if (fallbackElement) {
                    const datetime = fallbackElement.getAttribute('datetime');
                    if (datetime) {
                        return new Date(datetime);
                    }
                }
                console.log('❌ Could not find cake day element in user profile HTML');
                return null;
            }

            const datetime = cakeDayElement.getAttribute('datetime');
            if (!datetime) {
                console.log('❌ No datetime attribute found on cake day element');
                return null;
            }

            return new Date(datetime);
        } catch (error) {
            console.error('❌ Error parsing account creation date:', error);
            return null;
        }
    }

    private updateRateLimitFromHeaders(response: Response): void {
        const remaining = response.headers.get('X-Ratelimit-Remaining');
        const reset = response.headers.get('X-Ratelimit-Reset');
        const used = response.headers.get('X-Ratelimit-Used');

        if (remaining) {
            this.rateLimitInfo.remaining = parseInt(remaining, 10);
        }
        if (reset) {
            // Reset is in seconds, convert to timestamp
            this.rateLimitInfo.reset = Date.now() + (parseInt(reset, 10) * 1000);
        }
        if (used) {
            this.rateLimitInfo.used = parseInt(used, 10);
        }

        // Notify popup of rate limit update
        try {
            browser.runtime.sendMessage({
                type: 'rateLimitUpdate',
                remaining: this.rateLimitInfo.remaining,
                reset: this.rateLimitInfo.reset
            }).catch(() => {
                // Ignore errors - popup might not be open
            });
        } catch (error) {
            // Ignore errors
        }
    }

    private isAccountTooYoung(createdAt: Date): boolean {
        const now = new Date();
        const ageInMonths = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44); // Average days per month
        return ageInMonths < this.settings.minAccountAge;
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.asyncPostProcessorFn) {
            clearInterval(this.asyncPostProcessorFn);
            this.asyncPostProcessorFn = null;
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
        } else if (message.type === 'apiPauseToggled') {
            console.log(`🔄 API pause toggled: ${message.paused ? 'PAUSED' : 'RESUMED'}`);
        }
    });
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    main();
} else {
    window.addEventListener('load', main);
}