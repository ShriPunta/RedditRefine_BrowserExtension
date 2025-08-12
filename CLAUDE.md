# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firefox WebExtension that filters Reddit posts based on configurable keywords and subreddits. The extension removes unwanted posts from Reddit feeds and tracks removal statistics.

## Build and Development Commands

```bash
# Build the extension (compiles TypeScript and copies files to dist/)
npm run build

# Install dependencies
npm install
```

## Architecture

### Core Components

- **Content Script** (`src/index.ts`): Main filtering logic that runs on Reddit pages
  - `Filter` class handles post detection, keyword matching, and removal
  - Uses MutationObserver to monitor dynamically loaded content
  - Implements word-boundary regex matching to prevent false positives
  - Tracks removal statistics with daily/total counters

- **Popup Interface** (`src/popup.js` + `src/popup.html`): Extension popup UI
  - `PopupManager` class manages settings and displays statistics
  - Tabbed interface for keywords and subreddits management
  - Real-time search/filtering of configured items
  - Two-way communication with content script via browser.runtime messaging

### Data Storage

- Settings stored in `browser.storage.local` with key `filterSettings`
- Counter data stored with key `filterCounters`
- Default filters loaded from text files: `default_keywords.txt` and `default_subreddits.txt`

### Communication Flow

1. Popup ↔ Content Script messaging via `browser.runtime.sendMessage()`
2. Settings updates trigger `settingsUpdated` message to reload content script
3. Counter updates sent via `countersUpdated` message to refresh popup display
4. Content script requests counters via `requestCounters` message on popup open

### Post Detection Logic

The extension targets these Reddit elements:
- `article[aria-label]` elements (old Reddit format)
- `shreddit-post` elements (new Reddit format)
- Uses `subreddit-prefixed-name` attributes for subreddit filtering
- Implements word boundary matching for keyword filtering to avoid false positives

### Build Process

- TypeScript compilation via webpack with ts-loader
- Text file imports handled as webpack assets
- Output to `dist/` directory with HTML/JS files copied during build
- Manifest v2 WebExtension format for Firefox compatibility

### Key Features

- Real-time post filtering with visual feedback in console
- Daily/total removal counters with automatic daily reset
- Search functionality for managing large keyword/subreddit lists
- Configurable enable/disable toggle
- Automatic r/ prefix handling for subreddit names