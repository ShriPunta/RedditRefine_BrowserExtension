interface FilterSettings {
    keywords: string[];
    enabled: boolean;
}

const DEFAULT_KEYWORDS = [
    'trump', 'biden', 'democrat', 'republican', 'congress', 'senate', 'election',
    'vote', 'voting', 'political', 'politics', 'politician', 'government',
    'conservative', 'liberal', 'leftist', 'rightist', 'fascist', 'communist',
    'socialism', 'capitalism', 'impeach', 'campaign', 'ballot', 'maga',
    'gop', 'dnc', 'rnc', 'president', 'vice president', 'governor', 'mayor',
    'protest', 'rally', 'march', 'demonstration', 'activism', 'activist',
    'immigration', 'border', 'refugee', 'climate change', 'global warming',
    'healthcare', 'medicare', 'medicaid', 'obamacare', 'abortion', 'pro-life',
    'pro-choice', 'gun control', 'second amendment', 'nra', 'tax', 'taxes',
    'economy', 'inflation', 'recession', 'stimulus', 'welfare', 'social security',
    'supreme court', 'scotus', 'justice', 'constitutional', 'amendment',
    'freedom', 'liberty', 'patriot', 'nationalism', 'globalism', 'antifa',
    'blm', 'black lives matter', 'white supremacy', 'racism', 'discrimination',
    'lgbtq', 'transgender', 'gay rights', 'marriage equality', 'religious freedom',
    'war', 'military', 'defense', 'nato', 'ukraine', 'russia', 'china',
    'israel', 'palestine', 'middle east', 'foreign policy', 'sanctions',
    'covid', 'coronavirus', 'pandemic', 'vaccine', 'mask mandate', 'lockdown',
    'fauci', 'cdc', 'who', 'public health'
];

class PoliticalFilter {
    private settings: FilterSettings = {
        keywords: DEFAULT_KEYWORDS,
        enabled: true
    };
    private observer: MutationObserver | null = null;

    async init() {
        await this.loadSettings();
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

    private async saveSettings(): Promise<void> {
        try {
            await browser.storage.local.set({ politicalFilterSettings: this.settings });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    private setupObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        if (element.tagName === 'ARTICLE' || element.querySelector('article')) {
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
        const articles = document.querySelectorAll('article[aria-label]');

        articles.forEach((article) => {
            const ariaLabel = article.getAttribute('aria-label')?.toLowerCase() || '';

            if (this.isPolitical(ariaLabel)) {
                console.log('Removing political post:', ariaLabel);
                article.remove();
            }
        });
    }

    private isPolitical(text: string): boolean {
        const lowerText = text.toLowerCase();
        return this.settings.keywords.some(keyword =>
            lowerText.includes(keyword.toLowerCase())
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
    console.log("Political Filter Extension loaded");
    filter = new PoliticalFilter();
    filter.init();
};

// Listen for settings updates from popup
if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'settingsUpdated') {
            if (filter) {
                filter.destroy();
            }
            main();
        }
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    main();
} else {
    window.addEventListener('load', main);
}