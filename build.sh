#!/bin/bash

# Reddit Filter Browser Extension Build Script
# This script builds the extension from source code

set -e  # Exit on any error

echo "🔨 Building Reddit Filter Browser Extension..."
echo ""

# Check Node.js version
echo "📋 Checking build requirements..."
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
NPM_VERSION=$(npm --version 2>/dev/null || echo "not found")

if [ "$NODE_VERSION" = "not found" ]; then
    echo "❌ Node.js is required but not installed."
    echo "   Please install Node.js 18.0.0 or higher from https://nodejs.org/"
    exit 1
fi

if [ "$NPM_VERSION" = "not found" ]; then
    echo "❌ npm is required but not installed."
    echo "   npm is typically included with Node.js installation."
    exit 1
fi

echo "✅ Node.js: $NODE_VERSION"
echo "✅ npm: $NPM_VERSION"
echo ""

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/
echo "✅ Clean completed"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build the extension
echo "🔧 Building extension..."
npm run build
echo "✅ Build completed"
echo ""

# Verify build output (checks Chrome build by default)
DIST_DIR="dist/chrome"
echo "🔍 Verifying build output in $DIST_DIR..."
if [ ! -f "$DIST_DIR/index.js" ]; then
    echo "❌ Build failed: $DIST_DIR/index.js not found"
    exit 1
fi

if [ ! -f "$DIST_DIR/popup.html" ]; then
    echo "❌ Build failed: $DIST_DIR/popup.html not found"
    exit 1
fi

if [ ! -f "$DIST_DIR/popup.js" ]; then
    echo "❌ Build failed: $DIST_DIR/popup.js not found"
    exit 1
fi

if [ ! -f "$DIST_DIR/popup.css" ]; then
    echo "❌ Build failed: $DIST_DIR/popup.css not found"
    exit 1
fi

echo "✅ All required files present in $DIST_DIR/"
echo ""

# Display build summary
echo "📊 Build Summary:"
echo "   TypeScript compiled: src/index.ts → $DIST_DIR/index.js"
echo "   TypeScript compiled: src/popup/popup.ts → $DIST_DIR/popup.js"
echo "   CSS extracted: src/popup/popup.css → $DIST_DIR/popup.css"
echo "   HTML copied: src/popup/popup.html → $DIST_DIR/popup.html"
echo "   Extension ready for installation"
echo ""

echo "🎉 Build completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Load extension in your browser:"
echo "      Firefox: about:debugging → Load Temporary Add-on"
echo "      Chrome: chrome://extensions → Load unpacked"
echo "   2. Test on Reddit pages"
echo ""
echo "🔧 Development build commands:"
echo "   npm run build           - Build for Chrome (default)"
echo "   npm run build:firefox   - Build for Firefox"
echo "   npm run build:chrome    - Build for Chrome"
echo "   npm run build:prod      - Production build"
echo ""
echo "📦 Package commands:"
echo "   npm run package         - Package Firefox version"
echo "   npm run package:firefox - Package Firefox version"
echo "   npm run package:chrome  - Package Chrome version"
echo "   npm run package:source  - Create source code ZIP for review"