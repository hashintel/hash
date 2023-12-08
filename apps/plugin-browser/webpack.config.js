require("dotenv-flow").config();
const webpack = require("webpack");
const path = require("node:path");
const fileSystem = require("fs-extra");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const ReactRefreshTypeScript = require("react-refresh-typescript");
const { sentryWebpackPlugin } = require("@sentry/webpack-plugin");

const env = {
  API_ORIGIN: process.env.API_ORIGIN || "https://app-api.hash.ai",
  BROWSER: process.env.BROWSER || "chrome",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "https://app.hash.ai",
  NODE_ENV: process.env.NODE_ENV || "development",
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_DSN: process.env.SENTRY_DSN,
};

const ASSET_PATH = process.env.ASSET_PATH || "/";

const alias = {};

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

if (!isDevelopment && (!env.SENTRY_DSN || !env.SENTRY_AUTH_TOKEN)) {
  throw new Error(
    "No SENTRY_DSN or SENTRY_AUTH_TOKEN in environment – these must be set for a production build. SENTRY_DSN is relied on at runtime, and they are both needed to build and upload source maps to Sentry.",
  );
}

const options = {
  mode: process.env.NODE_ENV || "development",
  devtool: "source-map",
  entry: {
    background: path.join(__dirname, "src", "scripts", "background.ts"),
    content: path.join(__dirname, "src", "scripts", "content.ts"),
    options: path.join(__dirname, "src", "pages", "options.tsx"),
    popup: path.join(__dirname, "src", "pages", "popup.tsx"),
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
    fallback: {
      "process/browser": require.resolve("process/browser"),
    },
  },
  plugins: [
    isDevelopment && new ReactRefreshWebpackPlugin(),
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
    new webpack.ProgressPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(["NODE_ENV"]),
    new webpack.DefinePlugin({
      API_ORIGIN: `"${env.API_ORIGIN}"`,
      ENVIRONMENT: `"${env.NODE_ENV}"`,
      FRONTEND_ORIGIN: `"${env.FRONTEND_ORIGIN}"`,
      SENTRY_DSN: `"${env.SENTRY_DSN}"`,
    }),
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
          from: "src/assets/img",
          to: path.join(__dirname, "build", "[name][ext]"),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "pages", "options.html"),
      filename: "options.html",
      chunks: ["options"],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "pages", "popup.html"),
      filename: "popup.html",
      chunks: ["popup"],
      cache: false,
    }),
    env.SENTRY_AUTH_TOKEN && env.SENTRY_DSN
      ? sentryWebpackPlugin({
          authToken: env.SENTRY_AUTH_TOKEN,
          org: "hashintel",
          project: "plugin-browser",
        })
      : null,
  ].filter(Boolean),
  infrastructureLogging: {
    level: "info",
  },
};

if (env.NODE_ENV !== "development") {
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
