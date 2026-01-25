const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';
const targetBrowser = process.env.TARGET_BROWSER || 'chrome'; // Default to Chrome, supports 'chrome' or 'firefox'
const distPath = path.resolve(__dirname, 'dist', targetBrowser);

module.exports = {
  entry: {
    index: './src/index.ts',
    popup: './src/popup/popup.ts',
    options: './src/options/options.ts',
  },
  mode: isProduction ? 'production' : 'development',
  devtool: isProduction ? false : 'source-map', // No source maps in production
  output: {
    path: distPath,
    filename: '[name].js',
    clean: true, // Clean dist folder before each build
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: "src/popup/popup.html", to: "." },
        { from: "src/options/options.html", to: "." },
        { from: "icons", to: "icons" },
        {
          from: targetBrowser === 'chrome' ? 'manifest.chrome.json' : 'manifest.firefox.json',
          to: 'manifest.json'
        }
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.json$/,
        type: 'json',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
};