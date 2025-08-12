# Reddit Posts and Subreddit Keyword Filter

A Firefox WebExtension that filters Reddit posts based on configurable keywords and subreddits.

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
```bash
npm run build
```

This command:
1. Compiles TypeScript source code using webpack
2. Bundles text files containing filter defaults
3. Copies HTML and JavaScript files to `dist/` directory
4. Creates optimized extension files ready for installation

### Step 3: Package for Distribution (Optional)
```bash
npm run package
```

This creates a ZIP file in the `releases/` directory ready for Mozilla Add-on submission.

## Build Output

The build process creates the following files in the `dist/` directory:
- `index.js` - Compiled content script (from `src/index.ts`)
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality

Additional files required for the extension:
- `manifest.json` - Extension manifest
- `icons/` - Extension icons in multiple sizes

## Development Scripts

- `npm run build` - Build the extension
- `npm run package` - Build and create distribution ZIP
- `npm run web-ext:lint` - Lint the extension using web-ext
- `npm run web-ext:phone` - Test on Firefox for Android (requires adb setup)

## Source Code Structure

```
src/
├── index.ts          # Main content script (TypeScript)
├── popup.html        # Extension popup HTML
├── popup.js          # Popup functionality (JavaScript)
└── types.d.ts        # TypeScript type definitions

icons/                # Extension icons (multiple sizes)
manifest.json         # Extension manifest
webpack.config.js     # Webpack build configuration
tsconfig.json         # TypeScript configuration
```

## Build Process Details

1. **TypeScript Compilation**: `src/index.ts` is compiled to JavaScript using webpack and ts-loader
2. **Text File Bundling**: Default filter files are bundled as webpack assets
3. **File Copying**: HTML and JS files are copied to the distribution directory
4. **Asset Processing**: Icons and manifest are included in the final package

## Verification

To verify the build succeeded:
1. Check that `dist/` directory contains `index.js`, `popup.html`, and `popup.js`
2. Load the extension in Firefox using `about:debugging` → "Load Temporary Add-on" → select `manifest.json`
3. Test functionality on Reddit pages

## Troubleshooting

**Build fails with TypeScript errors:**
- Ensure Node.js version 18+ is installed
- Run `npm install` to ensure all dependencies are installed

**Extension doesn't load:**
- Verify all files are present in `dist/` directory
- Check browser console for error messages
- Ensure manifest.json is in the root directory

## License

This extension is provided as-is for Mozilla Add-on review purposes.