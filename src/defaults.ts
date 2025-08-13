// Import the text files
import defaultKeywordsText from '../default_keywords.txt';
import defaultSubredditsText from '../default_subreddits.txt';

export const DEFAULT_KEYWORDS = (defaultKeywordsText as string)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

export const DEFAULT_SUBREDDITS = (defaultSubredditsText as string)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(subreddit => `r/${subreddit}`); // Add r/ prefix back

export const DEFAULT_SETTINGS = {
    keywords: DEFAULT_KEYWORDS,
    subreddits: DEFAULT_SUBREDDITS,
    enabled: true,
    minAccountAge: 12, // default 1 year
    apiPaused: false
};