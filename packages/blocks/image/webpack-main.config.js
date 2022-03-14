/**
 * generates:
 *  - dist/main.js
 *  - dist/manifest.json
 *  - dist/webpack-bundle-analyzer-report.html
 */
const webpack = require("webpack");
const WebpackAssetsManifest = require("webpack-assets-manifest");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { StatsPlugin } = require("./webpack-block-meta-plugin");
const { peerDependencies } = require("./package.json");

module.exports = {
  plugins: [
    new webpack.EnvironmentPlugin({
      "process.env.NODE_ENV": process.env.NODE_ENV,
    }),
    new BundleAnalyzerPlugin({
      analyzerMode: "static",
      openAnalyzer: false,
      reportFilename: "webpack-bundle-analyzer-report.html",
    }),
    new WebpackAssetsManifest(),
    new StatsPlugin(),
    new CopyWebpackPlugin([{ from: "./public/", to: "./public/" }]),
  ],

  entry: {
    main: "./src/index.ts",
  },
  output: {
    libraryTarget: "commonjs",
    filename: "main.[contenthash].js",
  },
  externals: Object.fromEntries(
    Object.keys(peerDependencies).map((key) => [key, key]),
  ),
  module: {
    rules: [
      {
        test: /\.(t|j)sx?$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
  resolve: {
    extensions: [
      ".ts", // Add typescript support
      ".tsx", // Add typescript + react support
      ".js", // Preserving webpack default
      ".jsx", // Preserving webpack default
      ".json", // Preserving webpack default
      ".css", // Preserving webpack default
    ],
  },
};
