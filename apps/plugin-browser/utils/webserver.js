import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import webpack from "webpack";
import WebpackDevServer from "webpack-dev-server";

// eslint-disable-next-line import/extensions
import config from "../webpack.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";
process.env.ASSET_PATH = "/";

const excludeEntriesToHotReload = ["background", "content"];

const port = 8080;

// Set hot entry points manually
for (const entryName in config.entry) {
  if (excludeEntriesToHotReload.indexOf(entryName) === -1) {
    // Enable HMR for all entries except those in the "notHMR" list
    // See "Manual entry points" in https://webpack.js.org/guides/hot-module-replacement/#enabling-hmr
    config.entry[entryName] = [
      "webpack/hot/dev-server.js",
      `webpack-dev-server/client/index.js?hot=true&hostname=localhost&port=${port}`,
    ].concat(config.entry[entryName]);
  }
}

// Add HotModuleReplacementPlugin to plugin list
config.plugins = [new webpack.HotModuleReplacementPlugin({})].concat(
  config.plugins || [],
);

const compiler = webpack(config);

const server = new WebpackDevServer(
  {
    https: false,
    hot: false,
    liveReload: false,
    client: false,
    port,
    static: {
      directory: path.join(__dirname, "../build"),
    },
    devMiddleware: {
      writeToDisk: true,
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    allowedHosts: "all",
  },
  compiler,
);

(async () => {
  await server.start();
})();
