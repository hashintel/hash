import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import webpack from "webpack";
import ZipPlugin from "zip-webpack-plugin";

// eslint-disable-next-line import/extensions
import config from "../webpack.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.BABEL_ENV = "production";
process.env.ASSET_PATH = "/";

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
