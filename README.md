# Reddit Posts and Subreddit Keyword Filter

A Firefox WebExtension that filters Reddit posts based on configurable keywords and subreddits, helping you maintain a cleaner and more focused browsing experience.

## Motivation

This extension was born from a personal need to improve the Reddit browsing experience. Like many users, I browse `reddit.com/r/all` to discover top-ranking content from across the platform. However, in recent years, I've noticed several concerning trends:

- **Bot proliferation**: Automated accounts are increasingly dominating discussions
- **Political content overflow**: Political posts are appearing in non-political subreddits where they don't belong
- **Content displacement**: Authentic, organic user posts are being buried under algorithmic noise

This extension helps restore the authentic Reddit experience by allowing you to filter out unwanted content while preserving the diverse, community-driven discussions that make Reddit valuable.

## Features

- **Keyword filtering**: Remove posts containing specific words or phrases
- **Subreddit filtering**: Block entire subreddits from your feed
- **Real-time filtering**: Content is filtered as you scroll
- **Counter tracking**: See how many posts have been filtered (daily and total)
- **Easy management**: Add/remove filters through a convenient popup interface

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

### Step 0: Required Files (For Mozilla Reviewers)
The extension requires two text files for default filters:
- `default_keywords.txt` - One keyword per line
- `default_subreddits.txt` - One subreddit name per line (without "r/" prefix)

**Sample content for testing:**
```bash
# Create sample files for build testing
echo -e "test\nexample" > default_keywords.txt
echo -e "test\nexample" > default_subreddits.txt
```

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Extension

**Development Build (with source maps for debugging):**
```bash
npm run build
```

**Production Build (optimized for distribution):**
```bash
npm run build:prod
```

The build process:
1. Compiles TypeScript source code using webpack
2. Extracts CSS from TypeScript imports
3. Bundles text files containing filter defaults
4. Copies HTML files to `dist/` directory
5. Creates extension files ready for installation

### Step 3: Package for Distribution (Optional)
```bash
npm run package
```

This command automatically uses the production build and creates a ZIP file in the `releases/` directory ready for Mozilla Add-on submission.

## Build Output

The build process creates the following files in the `dist/` directory:
- `index.js` - Compiled content script (from `src/index.ts`)
- `popup.js` - Compiled popup script (from `src/popup/popup.ts`)
- `popup.css` - Extracted CSS styles (from `src/popup/popup.css`)
- `popup.html` - Extension popup interface (from `src/popup/popup.html`)

Additional files required for the extension:
- `manifest.json` - Extension manifest
- `icons/` - Extension icons in multiple sizes
- `default_keywords.txt` - Default keyword filters
- `default_subreddits.txt` - Default subreddit filters

## Development Scripts

**Build Commands:**
- `npm run build` - Development build with source maps
- `npm run build:prod` - Production build (optimized, no source maps)

**Package Commands:**
- `npm run package` - Create distribution ZIP (uses production build)
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

icons/                # Extension icons (multiple sizes)
manifest.json         # Extension manifest
webpack.config.js     # Webpack build configuration
tsconfig.json         # TypeScript configuration
default_keywords.txt  # Default keyword filters
default_subreddits.txt # Default subreddit filters
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
2. Load the extension in Firefox using `about:debugging` → "Load Temporary Add-on" → select `manifest.json`
3. Test functionality on Reddit pages
4. Open the popup (extension icon) to verify interface loads without CSP errors

## Troubleshooting

**Build fails with TypeScript errors:**
- Ensure Node.js version 18+ is installed
- Run `npm install` to ensure all dependencies are installed
- Check that `default_keywords.txt` and `default_subreddits.txt` exist in the root directory

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

## Known Limitations

- **Text-only filtering**: Currently only filters based on post titles and cannot analyze images or video content
- **Manual keyword management**: Keywords must be manually updated as political landscapes and trending topics change
- **False positives**: Be cautious with broad keywords that might filter legitimate content

## Planned Improvements

- **One-click subreddit filtering**: Add buttons to quickly filter subreddits directly from posts
- **Image content analysis**: Explore options for filtering based on image content
- **Smarter keyword suggestions**: Dynamic keyword recommendations based on current trends
- **Import/export settings**: Share filter configurations between devices

## Contributing

This extension is open source and contributions are welcome! Whether you're reporting bugs, suggesting features, or submitting code improvements, your input helps make Reddit browsing better for everyone.

## Support

If you encounter issues or have suggestions:
1. Check the troubleshooting section above
2. Open an issue on GitHub
3. Consider contributing a fix if you're technically inclined

## License

This project is open source and available under the MIT License.