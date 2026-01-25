// Defaults now managed by filter-packs system (filter-packs.json)
export const DEFAULT_KEYWORDS: string[] = [];
export const DEFAULT_SUBREDDITS: string[] = [];

export const DEFAULT_SETTINGS = {
    keywords: DEFAULT_KEYWORDS,
    subreddits: DEFAULT_SUBREDDITS,
    enabled: true,
    minAccountAge: 12, // default 1 year
    accountAgeFilterEnabled: false, // disabled by default to avoid infinite scroll issues
};
