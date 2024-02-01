process.env.BABEL_ENV = "production";
process.env.ASSET_PATH = "/";

const webpack = require("webpack");
const path = require("node:path");
const fs = require("node:fs");
const ZipPlugin = require("zip-webpack-plugin");
const config = require("../webpack.config");

delete config.custom;

config.mode = "production";

const packageInfo = JSON.parse(fs.readFileSync("package.json", "utf-8"));

const filenameSuffix = process.env.BROWSER;

config.plugins = (config.plugins || []).concat(
  new ZipPlugin({
    filename: `${packageInfo.name}-${packageInfo.version}${
      filenameSuffix ? `-${filenameSuffix}` : ""
    }.zip`,
    exclude: [/\.map$/],
    path: path.join(__dirname, "../", "zip"),
  }),
);

webpack(config, (err) => {
  if (err) {
    throw err;
  }
});
