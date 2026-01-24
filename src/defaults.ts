// Import JSON files
import defaultKeywordsData from '../default_keywords.json';
import defaultSubredditsData from '../default_subreddits.json';

export interface KeywordData {
    keyword: string;
    tags: string[];
    category: string;
}

export interface SubredditData {
    subreddit: string;
    tags: string[];
    category: string;
}

export const DEFAULT_KEYWORDS_DATA = defaultKeywordsData as KeywordData[];
export const DEFAULT_SUBREDDITS_DATA = defaultSubredditsData as SubredditData[];

export const DEFAULT_KEYWORDS = DEFAULT_KEYWORDS_DATA.map(item => item.keyword);
export const DEFAULT_SUBREDDITS = DEFAULT_SUBREDDITS_DATA.map(item => `r/${item.subreddit}`);

export const DEFAULT_SETTINGS = {
    keywords: DEFAULT_KEYWORDS,
    subreddits: DEFAULT_SUBREDDITS,
    enabled: true,
    minAccountAge: 12, // default 1 year
    accountAgeFilterEnabled: false, // disabled by default to avoid infinite scroll issues
};
