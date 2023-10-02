// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";
process.env.ASSET_PATH = "/";

const WebpackDevServer = require("webpack-dev-server");
const webpack = require("webpack");
const path = require("node:path");
const config = require("../webpack.config");
const env = require("./env");

const options = config.chromeExtensionBoilerplate || {};
const excludeEntriesToHotReload = options.notHotReload || [];

// Set hot entry points manually
for (const entryName in config.entry) {
  if (excludeEntriesToHotReload.indexOf(entryName) === -1) {
    // Enable HMR for all entries except those in the "notHMR" list
    // See "Manual entry points" in https://webpack.js.org/guides/hot-module-replacement/#enabling-hmr
    config.entry[entryName] = [
      "webpack/hot/dev-server.js",
      `webpack-dev-server/client/index.js?hot=true&hostname=localhost&port=${env.PORT}`,
    ].concat(config.entry[entryName]);
  }
}

// Add HotModuleReplacementPlugin to plugin list
config.plugins = [new webpack.HotModuleReplacementPlugin({})].concat(
  config.plugins || [],
);

delete config.chromeExtensionBoilerplate;

const compiler = webpack(config);

const server = new WebpackDevServer(
  {
    https: false,
    hot: false,
    liveReload: false,
    client: false,
    port: env.PORT,
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
