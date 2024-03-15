process.env.BABEL_ENV = "production";
process.env.ASSET_PATH = "/";

import webpack from "webpack";
import path from "node:path";
import fs from "node:fs";
import ZipPlugin from "zip-webpack-plugin";
import config from "../webpack.config";

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
