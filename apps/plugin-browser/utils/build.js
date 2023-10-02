// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "production";
process.env.NODE_ENV = "production";
process.env.ASSET_PATH = "/";

const webpack = require("webpack");
const path = require("node:path");
const fs = require("node:fs");
const ZipPlugin = require("zip-webpack-plugin");
const config = require("../webpack.config");

delete config.custom;

config.mode = "production";

const packageInfo = JSON.parse(fs.readFileSync("package.json", "utf-8"));

config.plugins = (config.plugins || []).concat(
  new ZipPlugin({
    filename: `${packageInfo.name}-${packageInfo.version}.zip`,
    path: path.join(__dirname, "../", "zip"),
  }),
);

webpack(config, (err) => {
  if (err) {
    throw err;
  }
});
