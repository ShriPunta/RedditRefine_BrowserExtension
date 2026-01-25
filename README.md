# Reddit Posts and Subreddit Keyword Filter

A cross-browser extension (Chrome & Firefox) that filters Reddit posts based on configurable keywords and subreddits, helping you maintain a cleaner and more focused browsing experience.

## Motivation

This extension was born from a personal need to improve the Reddit browsing experience. Like many users, I browse `reddit.com/r/all` to discover top-ranking content from across the platform. However, in recent years, I've noticed several concerning trends:

- **Bot proliferation**: Automated accounts are increasingly dominating discussions
- **Political content overflow**: Political posts are appearing in non-political subreddits where they don't belong
- **Content displacement**: Authentic, organic user posts are being buried under algorithmic noise

This extension helps restore the authentic Reddit experience by allowing you to filter out unwanted content while preserving the diverse, community-driven discussions that make Reddit valuable.

## Features

- **Keyword filtering**: Remove posts containing specific words or phrases
- **Subreddit filtering**: Block entire subreddits from your feed
- **Account age filtering**: Filter posts from accounts younger than a specified age (optional)
- **Real-time filtering**: Content is filtered as you scroll
- **Counter tracking**: See how many posts have been filtered (daily and total)
- **Easy management**: Add/remove filters through a convenient popup interface
- **Post collapse with reasons** (v1.2.0): Filtered posts are collapsed with show/hide buttons and display why they were filtered
- **Video autoplay prevention**: Videos in collapsed posts are automatically paused
- **Smart targeting**: Only runs on feeds (r/all, homepage, user profiles) - skips specific subreddit pages
- **TypeScript interface**: Modern popup built with TypeScript for better reliability

## Build Requirements

### Operating System
- macOS, Linux, or Windows
- This extension has been tested on macOS

### Required Software

**Node.js**
- Version: 18.0.0 or higher
- Download from: https://nodejs.org/
- Verify installation: `node --version`

**npm**
- Version: 8.0.0 or higher (included with Node.js)
- Verify installation: `npm --version`

### Optional (for mobile testing)
- Android Debug Bridge (adb) - for testing on Firefox for Android

## Build Instructions

### Step 0: Setup Filter Packs
The extension requires `filter-packs.json` for filter definitions. Copy the sample to get started:

```bash
cp filter-packs.sample.json filter-packs.json
```

You can customize the packs or add your own filter collections.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Extension

**Development Build (defaults to Chrome):**
```bash
npm run build              # Builds for Chrome
npm run build:firefox      # Builds for Firefox
npm run build:chrome       # Builds for Chrome (explicit)
```

**Production Build (optimized for distribution):**
```bash
npm run build:prod
```

The build process:
1. Compiles TypeScript source code using webpack
2. Extracts CSS from TypeScript imports
3. Bundles text files containing filter defaults
4. Copies HTML files and appropriate manifest to `dist/chrome` or `dist/firefox` directory
5. Creates extension files ready for installation

### Step 3: Package for Distribution (Optional)
```bash
npm run package          # Packages Firefox version
npm run package:firefox  # Packages Firefox version (explicit)
npm run package:chrome   # Packages Chrome version
```

These commands create ZIP files in the `releases/` directory ready for browser store submission.

## Build Output

The build process creates the following files in the `dist/chrome` or `dist/firefox` directory:
- `index.js` - Compiled content script (from `src/index.ts`)
- `popup.js` - Compiled popup script (from `src/popup/popup.ts`)
- `popup.css` - Extracted CSS styles (from `src/popup/popup.css`)
- `popup.html` - Extension popup interface (from `src/popup/popup.html`)

Additional files required for the extension:
- `manifest.chrome.json` / `manifest.firefox.json` - Browser-specific manifests
- `icons/` - Extension icons in multiple sizes
- `filter-packs.json` - Filter pack definitions (copy from filter-packs.sample.json)

## Development Scripts

**Build Commands:**
- `npm run build` - Development build for Chrome (default)
- `npm run build:firefox` - Development build for Firefox
- `npm run build:chrome` - Development build for Chrome
- `npm run build:prod` - Production build (optimized, no source maps)

**Package Commands:**
- `npm run package` - Create Firefox distribution ZIP
- `npm run package:firefox` - Create Firefox distribution ZIP (explicit)
- `npm run package:chrome` - Create Chrome distribution ZIP
- `npm run package:source` - Create source code ZIP for review

**Testing Commands:**
- `npm run web-ext:lint` - Lint the extension using web-ext
- `npm run web-ext:phone` - Test on Firefox for Android (requires adb setup)

## Source Code Structure

```
src/
├── index.ts          # Main content script (TypeScript)
├── defaults.ts       # Shared default values for keywords/subreddits
├── types.d.ts        # TypeScript type definitions
└── popup/            # Popup-related files
    ├── popup.ts      # Popup functionality (TypeScript)
    ├── popup.css     # Popup styles
    └── popup.html    # Popup interface

icons/                    # Extension icons (multiple sizes)
manifest.chrome.json      # Chrome manifest (V3)
manifest.firefox.json     # Firefox manifest (V2)
webpack.config.js         # Webpack build configuration
tsconfig.json             # TypeScript configuration
filter-packs.json         # Filter pack definitions (gitignored)
filter-packs.sample.json  # Sample filter packs
```

## Build Process Details

1. **TypeScript Compilation**: Both `src/index.ts` and `src/popup/popup.ts` are compiled using webpack and ts-loader
2. **CSS Extraction**: CSS is extracted from TypeScript imports using mini-css-extract-plugin
3. **Text File Bundling**: Default filter files are bundled as webpack assets
4. **File Copying**: HTML files are copied to the distribution directory
5. **Asset Processing**: Icons and manifest are included in the final package
6. **Optimization**: Production builds are minified and optimized (~50% smaller)

## Verification

To verify the build succeeded:
1. Check that `dist/` directory contains `index.js`, `popup.js`, `popup.css`, and `popup.html`
2. Load the extension:
   - **Firefox**: `about:debugging` → "Load Temporary Add-on" → select `manifest.json`
   - **Chrome**: `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select `dist/chrome` folder
3. Test functionality on Reddit pages
4. Open the popup (extension icon) to verify interface loads without CSP errors

## Troubleshooting

**Build fails with TypeScript errors:**
- Ensure Node.js version 18+ is installed
- Run `npm install` to ensure all dependencies are installed
- Check that `filter-packs.json` exists (copy from filter-packs.sample.json if missing)

**Extension doesn't load:**
- Verify all files are present in `dist/` directory
- Check browser console for error messages
- Ensure manifest.json is in the root directory

**Popup shows CSP errors:**
- Ensure you're using the updated webpack config with `devtool: 'source-map'`
- Use production build (`npm run build:prod`) for cleaner output

**CSS not applying in popup:**
- Verify `popup.css` is present in `dist/` directory
- Check that `popup.html` includes `<link rel="stylesheet" href="popup.css">`
**Firefox validation warnings about innerHTML:**
- The codebase avoids `innerHTML` to prevent security warnings
- Use `createElement()` + `textContent` + `appendChild()` instead

## Known Limitations

- **Text-only filtering**: Currently only filters based on post titles and cannot analyze images or video content
- **Manual keyword management**: Keywords must be manually updated as political landscapes and trending topics change
- **False positives**: Be cautious with broad keywords that might filter legitimate content

## Account Age Filtering

The extension now includes an optional **Account Age Filter** that can remove posts from newly created accounts. This feature helps reduce spam and bot activity.

### How it works:
- **Toggle control**: Enable/disable account age filtering in the popup
- **Configurable threshold**: Set minimum account age (1 month to 5 years)
- **Smart processing**: Only checks account ages when needed to avoid performance issues
- **Default disabled**: Feature is disabled by default to prevent any infinite scroll issues

### Configuration:
1. Open the extension popup
2. Toggle "Account Age Filter" on/off
3. Adjust the "Min Account Age" slider (when enabled)
4. Changes take effect immediately

**Note**: This feature makes API requests to Reddit to check account creation dates. It can be disabled if you experience any issues.

## Planned Improvements

- **One-click subreddit filtering**: Add buttons to quickly filter subreddits directly from posts
- **Image content analysis**: Explore options for filtering based on image content
- **Smarter keyword suggestions**: Dynamic keyword recommendations based on current trends
- **Import/export settings**: Share filter configurations between devices

## Changelog

### Version 1.1.0 (Current)
- ✨ **New Feature**: Account Age Filtering - Filter posts from accounts younger than a specified age
- 🔧 **Technical**: Migrated popup interface from vanilla JavaScript to TypeScript
- 🎨 **UI Enhancement**: Added toggle control for account age filter with visual feedback
- ⚙️ **Performance**: Optimized async processing with configurable on/off switch
- 🛠️ **Build System**: Enhanced webpack configuration with CSS extraction and TypeScript compilation
- 🐛 **Stability**: Improved error handling and race condition prevention

### Version 1.0.x (Previous)
- Basic keyword and subreddit filtering
- Real-time post removal
- Statistics tracking
- Popup interface for filter management

## Contributing

This extension is open source and contributions are welcome! Whether you're reporting bugs, suggesting features, or submitting code improvements, your input helps make Reddit browsing better for everyone.

## Support

If you encounter issues or have suggestions:
1. Check the troubleshooting section above
2. Open an issue on GitHub
3. Consider contributing a fix if you're technically inclined

## License

This project is open source and available under the MIT License.