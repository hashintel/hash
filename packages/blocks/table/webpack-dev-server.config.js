const HtmlWebpackPlugin = require("html-webpack-plugin-v4");
const webpack = require("webpack");
const config = require("./webpack.config");

module.exports = {
  entry: "./src/devRenderer.tsx",
  plugins: [
    ...config[0].plugins,
    new HtmlWebpackPlugin({
      filename: "index.html",
      template: "src/index.html",
    }),
    new webpack.EnvironmentPlugin({
      "process.env.NODE_ENV": process.env.NODE_ENV,
    }),
    new webpack.NamedModulesPlugin(),
    new webpack.HotModuleReplacementPlugin(),
  ],
  module: config[0].module,
  devServer: {
    hot: true,
    contentBase: __dirname,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": [
        "X-Requested-With",
        "content-type",
        "Authorization",
        "sentry-trace",
      ],
    },
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
