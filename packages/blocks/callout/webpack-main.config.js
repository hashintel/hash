/**
 * generates:
 *  - dist/main.js
 *  - dist/manifest.json
 *  - dist/webpack-bundle-analyzer-report.html
 */
const webpack = require("webpack");
const WebpackAssetsManifest = require("webpack-assets-manifest");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const CopyPlugin = require("copy-webpack-plugin");
const { StatsPlugin } = require("./webpack-block-metadata-plugin");

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
    new WebpackAssetsManifest({
      output: "manifest.json",
    }),
    new StatsPlugin(),
    new CopyPlugin({ patterns: [{ from: "./public/", to: "./public/" }] }),
  ],

  entry: {
    main: "./src/index.ts",
  },
  output: {
    libraryTarget: "commonjs",
    filename: "main.[contenthash].js",
  },
  externals: {
    react: "react",
    "react-dom": "react-dom",
    twind: "twind",
  },
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
