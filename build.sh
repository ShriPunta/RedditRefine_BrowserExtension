#!/bin/bash

# Reddit Filter Firefox Extension Build Script
# This script builds the extension from source code

set -e  # Exit on any error

echo "🔨 Building Reddit Filter Firefox Extension..."
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

# Verify build output
echo "🔍 Verifying build output..."
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed: dist/index.js not found"
    exit 1
fi

if [ ! -f "dist/popup.html" ]; then
    echo "❌ Build failed: dist/popup.html not found"
    exit 1
fi

if [ ! -f "dist/popup.js" ]; then
    echo "❌ Build failed: dist/popup.js not found"
    exit 1
fi

echo "✅ All required files present in dist/"
echo ""

# Display build summary
echo "📊 Build Summary:"
echo "   Source files compiled: src/index.ts → dist/index.js"
echo "   Files copied: src/popup.html, src/popup.js → dist/"
echo "   Extension ready for installation"
echo ""

echo "🎉 Build completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Load extension in Firefox: about:debugging → Load Temporary Add-on"
echo "   2. Select manifest.json to install"
echo "   3. Test on Reddit pages"
echo ""
echo "📦 To create distribution package: npm run package"
echo "📋 To create source package: npm run package:source"