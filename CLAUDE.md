# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Reddit Refine - Filter, Analyze** is a Browser Extension (Chrome & Firefox) that filters Reddit posts based on configurable keywords and subreddits. Features filter packs system, neo-retro UI, and removal statistics tracking.

## Build and Development Commands

```bash
# First-time setup: Create filter-packs.json from sample
cp filter-packs.sample.json filter-packs.json

# Build the extension (defaults to Firefox)
npm run build

# Build for specific browser
npm run build:chrome   # Outputs to dist/chrome
npm run build:firefox  # Outputs to dist/firefox

# Package for release
npm run package        # Create Firefox ZIP
npm run package:chrome # Create Chrome ZIP

# Install dependencies
npm install
```

## Architecture

### Multi-Browser Support (New)

- **Manifests**:
  - `manifest.chrome.json`: Manifest V3 for Chrome
  - `manifest.firefox.json`: Manifest V2 for Firefox
- **Polyfill**: Uses `webextension-polyfill` to normalize API access via the `browser` namespace across Chrome and Firefox.
- **Build**: Webpack configured with `CopyPlugin` to generate separate builds in `dist/chrome` and `dist/firefox`.

### Core Components

- **Content Script** (`src/index.ts`): Main filtering logic that runs on Reddit pages
  - `Filter` class handles post detection, keyword matching, and removal
  - Uses MutationObserver to monitor dynamically loaded content
  - Implements word-boundary regex matching to prevent false positives
  - Tracks removal statistics with daily/total counters

- **Popup Interface** (`src/popup/popup.ts` + `src/popup/popup.html`): Extension popup UI
  - `PopupManager` class manages settings and displays statistics
  - Tabbed interface for keywords and subreddits management
  - Filter packs management with subscription system
  - First-run onboarding for new users
  - Real-time search/filtering of configured items
  - Two-way communication with content script via `browser.runtime` messaging

- **Options Page** (`src/options/options.ts` + `src/options/options.html`): Full-page settings interface
  - `OptionsManager` class for comprehensive filter management
  - Bulk keyword/subreddit management with search and filtering
  - Statistics and counter display

### Data Storage

- **Settings** stored in `browser.storage.local` with key `filterSettings`:
  - `keywords`, `subreddits`, `enabled`, `minAccountAge`, `accountAgeFilterEnabled`
  - `enabledPacks`: array of subscribed pack IDs
  - `keywordSources`, `subredditSources`: track which pack each item comes from
- **Counter data** stored with key `filterCounters`
- **Filter packs** defined in `filter-packs.json` with curated keyword/subreddit collections (gitignored, copy from filter-packs.sample.json)

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
- JSON imports handled natively for filter packs and default filters
- **Targeted Builds**: Output to `dist/chrome` or `dist/firefox` based on `TARGET_BROWSER` environment variable
- **Assets**: CopyPlugin handles copying icons, HTML, CSS, and the appropriate `manifest.json`

### Filter Packs System

- **Pack definitions**: `filter-packs.json` (local, gitignored) contains curated collections with name, description, keywords, and subreddits. Sample available in `filter-packs.sample.json`
- **Subscription tracking**: `enabledPacks` array in settings tracks active pack IDs
- **Source attribution**: `keywordSources` and `subredditSources` maps track pack origin for each filter item
- **Pack versioning** (v1.4.0): Tracks pack versions to sync updates to subscribers
  - Each pack has version field in filter-packs.json
  - User storage tracks subscribed pack versions
  - Auto-update strategy: new items from updated packs merged into user's filter lists
  - Version tagging: items tagged with `{source: 'packId', version: '1.0'}`
- **Onboarding**: First-run detection shows pack selection dialog to new users
- **UI integration**: Packs displayed in popup with toggle switches, subscription merges pack items into main filter lists

### Key Features

- Real-time post filtering with visual feedback in console
- Daily/total removal counters with automatic daily reset
- Search functionality for managing large keyword/subreddit lists
- Configurable enable/disable toggle
- Automatic r/ prefix handling for subreddit names
- **Post collapse instead of hiding** (v1.2.0): Posts are collapsed with show/hide buttons and filter reasons displayed
- **Video autoplay prevention**: Videos in collapsed posts are paused to prevent autoplay
- **Smart URL targeting**: Extension only runs on feeds (r/all, homepage, user profiles) and skips specific subreddit pages
- **Filter packs system** (v1.3.0): Subscribe to curated filter collections with one-click enable/disable
  - First-run onboarding prompts new users to select starter packs
  - Track filter sources to identify pack-originated vs user-added items
  - Pack data stored in `filter-packs.json`
- **Neo-retro UI design** (v1.3.0): Distinctive aesthetic with hard shadows, thick borders, blue-tinted neutrals, and variable fonts
- **Options page** (v1.3.0): Full-page interface accessible via browser.runtime.openOptionsPage() or options button in popup

### Recent Improvements (v1.3.0)

- Fixed counter increment bug on filter toggle
- Optimized async processor to prevent infinite scroll blocking
- Hide filtered content when extension disabled (UX improvement)
- Filter packs system with sample file for public repo (filter-packs.json gitignored for privacy)

### Validation Testing

Before submitting to Mozilla Add-ons:
1. Build: `npm run build:firefox`
2. Package: `npm run package:firefox`
3. Upload ZIP to: https://addons.mozilla.org/developers/addon/submit/upload-listed
4. Check validation report for warnings

**Local Firefox testing:**
- Load from `dist/firefox/` folder, NOT the ZIP
- Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json`

**Local Chrome testing:**
- Load from `dist/chrome/` folder, NOT the ZIP
- Chrome: `about:extensions` → "Load unpacked" → select `dist/chrome`

