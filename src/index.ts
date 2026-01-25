// Import the text files
import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS } from './defaults';

interface Post {
    url: string;
    title: string;
    tagName: string;
    subreddit: string;
    author: string;
    matchedKeyword: string;
    shouldRemove: boolean;
    removalReason: string;
}

interface FilterSettings {
    keywords: string[];
    subreddits: string[];
    enabled: boolean;
    minAccountAge: number; // in months
    accountAgeFilterEnabled: boolean;
}

interface CounterData {
    totalRemoved: number;
    dailyRemoved: number;
    lastResetDate: string;
}

interface UserAgeCache {
    [username: string]: {
        createdAt: Date;
        fetchedAt: Date;
    };
}

class Filter {
    public settings: FilterSettings = DEFAULT_SETTINGS;
    private counters: CounterData = {
        totalRemoved: 0,
        dailyRemoved: 0,
        lastResetDate: new Date().toDateString()
    };
    private userAgeCache: UserAgeCache = {};
    private pendingRequests = new Set<string>();
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

            // Start async processor only if account age filter is enabled
            this.updateAsyncProcessor();
        }
    }

    public updateAsyncProcessor(): void {
        // Stop existing processor if running
        if (this.asyncPostProcessorFn) {
            clearInterval(this.asyncPostProcessorFn);
            this.asyncPostProcessorFn = null;
        }

        // Start processor only if account age filter is enabled
        if (this.settings.accountAgeFilterEnabled) {
            console.log('🔄 Starting async account age processor');
            this.asyncPostProcessorFn = setInterval(() => {
                this.removePostsSecondPass();
            }, 5000); // Increased from 2s to 5s to reduce API call frequency
        } else {
            console.log('⏸️ Account age filter disabled - async processor stopped');
            // Clear the pending map since we're not processing it
            this.elementToPostMapProcessAsync.clear();
        }
    }

    private async removePostsSecondPass() {
        // Only run if account age filter is enabled
        if (!this.settings.accountAgeFilterEnabled) {
            return;
        }

        // Convert Map to array for processing
        const entries = Array.from(this.elementToPostMapProcessAsync.entries());

        // Process only first 5 entries per batch to avoid blocking during fast scrolling
        const batchSize = 5;
        const batch = entries.slice(0, batchSize);

        for (const [element, post] of batch) {
            // Check if element still exists before processing
            if (!document.contains(element)) {
                this.elementToPostMapProcessAsync.delete(element);
                continue;
            }

            // Skip posts that have been manually expanded by the user
            const articleParent = element.closest('article') || element;
            if (articleParent.getAttribute('data-reddit-filter-expanded') === 'true') {
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

                        const wasCollapsed = this.hideElementOrClosestParentArticle(ele, post.removalReason);

                        // Increment counters only if post was actually collapsed
                        if (wasCollapsed) {
                            this.incrementCounters();
                        }
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
            // Skip posts that have been manually expanded by the user
            const articleParent = ele.closest('article') || ele;
            if (articleParent.getAttribute('data-reddit-filter-expanded') === 'true') {
                return;
            }

            const post = this.convertElementToPost(ele);

            if (post.shouldRemove) {
                this.logPostInConsole(post);

                const wasCollapsed = this.hideElementOrClosestParentArticle(ele, post.removalReason);

                // Increment counters only if post was actually collapsed (not already collapsed)
                if (wasCollapsed) {
                    this.incrementCounters();
                }
            } else if (this.settings.accountAgeFilterEnabled) {
                // Only add to async processing if account age filter is enabled
                this.elementToPostMapProcessAsync.set(ele, post);
            }
        });
    }

    private hideElementOrClosestParentArticle(ele: Element, reason: string = ''): boolean {
        return this.collapsePost(ele, reason);
    }

    private collapsePost(ele: Element, reason: string): boolean {
        if (!document.contains(ele)) return false;

        const articleParent = ele.closest('article');
        const elementToCollapse = articleParent || ele;
        const htmlElement = elementToCollapse as HTMLElement;

        // Check if already collapsed to avoid duplicate processing
        if (htmlElement.querySelector('.reddit-filter-collapse-banner')) {
            return false;
        }

        // Stop video autoplay by pausing all videos in the post
        this.pauseVideosInPost(htmlElement);

        // Create collapse banner
        const banner = document.createElement('div');
        banner.className = 'reddit-filter-collapse-banner';
        banner.style.cssText = `
            background-color: #f6f7f8;
            border: 1px solid #edeff1;
            border-radius: 4px;
            padding: 8px 12px;
            margin: 4px 0;
            font-size: 12px;
            color: #7c7c83;
            cursor: pointer;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        // Create the reason text
        const reasonText = document.createElement('span');
        reasonText.textContent = `Post filtered: ${reason}`;

        // Create the show/hide button
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Show';
        toggleButton.style.cssText = `
            background: none;
            border: 1px solid #0079d3;
            color: #0079d3;
            padding: 2px 8px;
            border-radius: 2px;
            font-size: 11px;
            cursor: pointer;
        `;

        banner.appendChild(reasonText);
        banner.appendChild(toggleButton);

        // Hide the original post content
        htmlElement.style.cssText = 'position: relative;';
        // Store original children as DOM nodes instead of HTML string
        const originalChildren = Array.from(htmlElement.childNodes).map(node => node.cloneNode(true));
        // Clear content by removing children
        while (htmlElement.firstChild) {
            htmlElement.removeChild(htmlElement.firstChild);
        }
        htmlElement.appendChild(banner);

        // Store original content and collapsed state
        (htmlElement as any)._originalChildren = originalChildren;
        (htmlElement as any)._isCollapsed = true;

        // Add click handler for toggle
        const togglePost = () => {
            const isCollapsed = (htmlElement as any)._isCollapsed;

            if (isCollapsed) {
                // Show post - mark as user-expanded to prevent re-collapsing
                // Clear and restore from stored nodes
                while (htmlElement.firstChild) {
                    htmlElement.removeChild(htmlElement.firstChild);
                }
                (htmlElement as any)._originalChildren.forEach((node: Node) => {
                    htmlElement.appendChild(node.cloneNode(true));
                });
                htmlElement.setAttribute('data-reddit-filter-expanded', 'true');
                (htmlElement as any)._isCollapsed = false;
            } else {
                // Hide post - remove the expansion marker
                this.pauseVideosInPost(htmlElement);
                // Clear content by removing children
                while (htmlElement.firstChild) {
                    htmlElement.removeChild(htmlElement.firstChild);
                }
                htmlElement.appendChild(banner);
                htmlElement.removeAttribute('data-reddit-filter-expanded');
                (htmlElement as any)._isCollapsed = true;
            }

            toggleButton.textContent = (htmlElement as any)._isCollapsed ? 'Show' : 'Hide';
        };

        banner.addEventListener('click', togglePost);
        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePost();
        });

        return true;
    }

    private pauseVideosInPost(element: HTMLElement) {
        // Find and pause all video elements
        const videos = element.querySelectorAll('video');
        videos.forEach(video => {
            video.pause();
            video.currentTime = 0;
        });

        // Also handle Reddit's video players
        const redditVideos = element.querySelectorAll('shreddit-player');
        redditVideos.forEach(player => {
            const video = player.querySelector('video');
            if (video) {
                video.pause();
                video.currentTime = 0;
            }
        });
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
            // Use DOMParser instead of innerHTML for security
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Look for the cake day element using the CSS selector path
            const cakeDayElement = doc.querySelector('div.flex:nth-child(3) > p:nth-child(1) > faceplate-tooltip:nth-child(1) > span:nth-child(1) > time:nth-child(1)');

            if (!cakeDayElement) {
                // Fallback: search for any time element with data-testid="cake-day"
                const fallbackElement = doc.querySelector('time[data-testid="cake-day"]');
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
    console.log("✅ Reddit Filter Extension loaded");
    filter = new Filter();
    filter.init();
};

// Listen for settings updates from popup
interface ContentMessage {
    type: string;
    enabled?: boolean;
}

if (browser.runtime) {
    browser.runtime.onMessage.addListener((message: unknown) => {
        const msg = message as ContentMessage;
        if (msg.type === 'settingsUpdated') {
            if (filter) {
                filter.destroy();
            }
            main();
        } else if (msg.type === 'accountAgeFilterToggled') {
            if (filter) {
                // Update the setting and restart async processor
                filter.settings.accountAgeFilterEnabled = msg.enabled ?? false;
                filter.updateAsyncProcessor();
            }
        } else if (msg.type === 'requestCounters') {
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