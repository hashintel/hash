const path = require("path");
const withTM = require("next-transpile-modules")(["@hashintel/hash-shared"]); // pass the modules you would like to see transpiled
const withImages = require("next-images");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const { withSentryConfig } = require("@sentry/nextjs");

const { buildStamp } = require("./buildstamp");

const sentryWebpackPluginOptions = {
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
  release: buildStamp,
  silent: true,
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.
};

/**
 * @todo try using next-compose-plugins when upgrading next to 11 and/or to webpack 5
 *    was not building with compose-plugins on next 10 w/ webpack 4.
 */
module.exports = withSentryConfig(
  withBundleAnalyzer(
    withImages(
      withTM({
        pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx"],
        webpack5: false,

        // We call linters in GitHub Actions for all pull requests. By not linting
        // again during `next build`, we save CI minutes and unlock more feedback.
        // Thus, we can get Playwright test results and Preview releases for WIP PRs.
        eslint: { ignoreDuringBuilds: true },
        typescript: { ignoreBuildErrors: true },

        webpack: (config) => {
          // help out nextjs plugin next-transpile-modules to correctly resolve monorepo dependencies
          config.resolve.alias = {
            ...config.resolve.alias,
            "@hashintel/hash-shared": path.join(
              __dirname,
              "../../..",
              "node_modules/@hashintel/hash-shared/src",
            ),
          };

          //  Build the sandbox HTML, which will have the sandbox script injected
          const framedBlockFolder = "/src/components/sandbox/FramedBlock";
          config.plugins.push(
            new HtmlWebpackPlugin({
              filename: "static/sandbox.html",
              template: path.join(__dirname, framedBlockFolder, "index.html"),
              chunks: ["sandbox"],
            }),
          );
          return {
            ...config,
            entry: () =>
              config.entry().then((entry) => ({
                ...entry,
                sandbox: path.join(__dirname, framedBlockFolder, "index.tsx"),
              })),
          };
        },
        sassOptions: {
          prependData: `
      $grey-bg: rgba(241, 243, 246, 0.3);
      $grey-border: #e5e6e7;
      $black-almost: #1b1d24;
      
      $bright-purple: rgb(95, 71, 255);
      $bright-pink: #ff008b;
      $bright-blue: #2482ff;
      `,
        },
      }),
    ),
  ),
  sentryWebpackPluginOptions,
);
