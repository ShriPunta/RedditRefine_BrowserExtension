const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    index: './src/index.ts',
    popup: './src/popup/popup.ts',
  },
  mode: 'development',
  devtool: 'source-map', // Use source-map instead of eval for WebExtension compatibility
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
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
        test: /\.txt$/,
        type: 'asset/source',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.txt'],
  },
};