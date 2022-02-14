const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const config = require("./webpack.config");

/** @type import("webpack").Configuration */
module.exports = {
  devtool: "eval-cheap-module-source-map",
  entry: "./src/webpack-dev-server.js",
  plugins: [
    ...config[0].plugins,
    new HtmlWebpackPlugin({
      filename: "index.html",
      template: "src/index.html",
    }),
    new webpack.EnvironmentPlugin({
      "process.env.NODE_ENV": process.env.NODE_ENV,
    }),
    new webpack.HotModuleReplacementPlugin(),
  ],
  module: config[0].module,
  devServer: {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": [
        "X-Requested-With, content-type, Authorization",
        "X-Requested-With",
        "content-type",
        "Authorization",
        "sentry-trace",
      ],
    },
    hot: true,
    open: process.env.BROWSER !== "none",
    port: 9090,
    static: {
      directory: __dirname,
    },
  },
  optimization: {
    moduleIds: "named",
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
