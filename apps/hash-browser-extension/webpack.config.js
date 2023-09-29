const webpack = require("webpack");
const path = require("node:path");
const fileSystem = require("fs-extra");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const ReactRefreshTypeScript = require("react-refresh-typescript");
const env = require("./utils/env");

const ASSET_PATH = process.env.ASSET_PATH || "/";

const alias = {};

// load the secrets
const secretsPath = path.join(__dirname, `secrets.${env.NODE_ENV}.js`);

const fileExtensions = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "eot",
  "otf",
  "svg",
  "ttf",
  "woff",
  "woff2",
];

if (fileSystem.existsSync(secretsPath)) {
  alias.secrets = secretsPath;
}

const isDevelopment = process.env.NODE_ENV !== "production";

const options = {
  mode: process.env.NODE_ENV || "development",
  entry: {
    background: path.join(__dirname, "src", "scripts", "background.ts"),
    content: path.join(__dirname, "src", "scripts", "content.ts"),
    options: path.join(__dirname, "src", "pages", "options", "index.tsx"),
    popup: path.join(__dirname, "src", "pages", "popup", "index.tsx"),
  },
  chromeExtensionBoilerplate: {
    notHotReload: ["background", "content"],
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "build"),
    clean: true,
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        // look for .css or .scss files
        test: /\.(css|scss)$/,
        // in the `src` directory
        use: [
          {
            loader: "style-loader",
          },
          {
            loader: "css-loader",
          },
          {
            loader: "sass-loader",
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: new RegExp(`.(${fileExtensions.join("|")})$`),
        type: "asset/resource",
        exclude: /node_modules/,
        // loader: 'file-loader',
        // options: {
        //   name: '[name].[ext]',
        // },
      },
      {
        test: /\.html$/,
        use: {
          loader: "html-loader",
          options: {
            sources: {
              urlFilter: (attribute, value) => {
                if (/browser-polyfill.js$/.test(value)) {
                  return false;
                }

                return true;
              },
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve("ts-loader"),
            options: {
              getCustomTransformers: () => ({
                before: [isDevelopment && ReactRefreshTypeScript()].filter(
                  Boolean,
                ),
              }),
              transpileOnly: isDevelopment,
            },
          },
        ],
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: "source-map-loader",
          },
          {
            loader: require.resolve("babel-loader"),
            options: {
              plugins: [
                isDevelopment && require.resolve("react-refresh/babel"),
              ].filter(Boolean),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias,
    extensions: fileExtensions
      .map((extension) => `.${extension}`)
      .concat([".js", ".jsx", ".ts", ".tsx", ".css"]),
  },
  plugins: [
    isDevelopment && new ReactRefreshWebpackPlugin(),
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(["NODE_ENV"]),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/manifest.json",
          to: path.join(__dirname, "build"),
          force: true,
          transform(content) {
            const json = JSON.parse(content.toString());

            if (env.BROWSER === "firefox") {
              // @see https://bugzilla.mozilla.org/show_bug.cgi?id=1573659
              json.background.scripts = [json.background.service_worker];
              delete json.background.service_worker;
            }

            // generates the manifest file using the package.json informations
            return Buffer.from(
              JSON.stringify(
                {
                  version: process.env.npm_package_version,
                  ...json,
                },
                undefined,
                2,
              ),
            );
          },
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/scripts/content/content.styles.css",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/assets/img/icon-256.png",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "pages", "options", "index.html"),
      filename: "options.html",
      chunks: ["options"],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "pages", "popup", "index.html"),
      filename: "popup.html",
      chunks: ["popup"],
      cache: false,
    }),
  ].filter(Boolean),
  infrastructureLogging: {
    level: "info",
  },
};

if (env.NODE_ENV === "development") {
  options.devtool = "cheap-module-source-map";
} else {
  options.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  };
}

module.exports = options;
