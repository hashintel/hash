// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";
process.env.ASSET_PATH = "/";

const WebpackDevServer = require("webpack-dev-server");
const webpack = require("webpack");
const path = require("node:path");
const config = require("../webpack.config");

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
