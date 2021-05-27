/**
 * generates:
 *  - dist/main.js
 *  - dist/manifest.json
 *  - dist/webpack-bundle-analyzer-report.html
 */
const webpack = require("webpack");
const WebpackAssetsManifest = require("webpack-assets-manifest");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const remoteComponentConfig = require("./remote-component.config").resolve;

const externals = Object.keys(remoteComponentConfig).reduce(
  (obj, key) => ({ ...obj, [key]: key }),
  {}
);

module.exports = {
  plugins: [
    new webpack.EnvironmentPlugin({
      "process.env.NODE_ENV": process.env.NODE_ENV
    }),
    new BundleAnalyzerPlugin({
      analyzerMode: "static",
      openAnalyzer: false,
      reportFilename: "webpack-bundle-analyzer-report.html"
    }),
    new WebpackAssetsManifest()
  ],
  entry: {
    main: "./src/index.js"
  },
  output: {
    libraryTarget: "commonjs"
  },
  externals: {
    ...externals,
    "remote-component.config.js": "remote-component.config.js"
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: "babel-loader"
        }
      }
    ]
  }
};
