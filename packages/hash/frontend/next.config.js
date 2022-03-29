const { config } = require("dotenv-flow");
const path = require("path");
const withTM = require("next-transpile-modules")(["@hashintel/hash-shared"]); // pass the modules you would like to see transpiled
const HtmlWebpackPlugin = require("html-webpack-plugin");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const { withSentryConfig } = require("@sentry/nextjs");

const { buildStamp } = require("./buildstamp");

config({ silent: true, path: "../../.." });

const sentryWebpackPluginOptions = {
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
  release: buildStamp,
  silent: true,
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.
};

// Insert other public env variables here. We have to add the `NEXT_PUBLIC` prefix for next to find them.
// They then get converted into variables with the right name in `frontend/src/lib/public-env.ts`
process.env.NEXT_PUBLIC_HASH_OPENSEARCH_ENABLED =
  process.env.HASH_OPENSEARCH_ENABLED;

process.env.NEXT_PUBLIC_BLOCK_BASED_ENTITY_EDITOR =
  process.env.NEXT_PUBLIC_BLOCK_BASED_ENTITY_EDITOR ??
  process.env.BLOCK_BASED_ENTITY_EDITOR;

/**
 * @todo try using next-compose-plugins when upgrading next to 11 and/or to webpack 5
 *    was not building with compose-plugins on next 10 w/ webpack 4.
 */
module.exports = withSentryConfig(
  withBundleAnalyzer(
    withTM({
      pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx"],

      // We call linters in GitHub Actions for all pull requests. By not linting
      // again during `next build`, we save CI minutes and unlock more feedback.
      // Thus, we can get Playwright test results and Preview releases for WIP PRs.
      eslint: { ignoreDuringBuilds: true },
      typescript: { ignoreBuildErrors: true },

      webpack: (webpackConfig) => {
        webpackConfig.module.rules.push({
          test: /\.svg$/,
          use: [require.resolve("@svgr/webpack")],
        });

        //  Build the sandbox HTML, which will have the sandbox script injected
        const framedBlockFolder = "/src/components/sandbox/FramedBlock";
        webpackConfig.plugins.push(
          new HtmlWebpackPlugin({
            filename: "static/sandbox.html",
            template: path.join(__dirname, framedBlockFolder, "index.html"),
            chunks: ["sandbox"],
          }),
        );
        return {
          ...webpackConfig,
          entry: () =>
            webpackConfig.entry().then((entry) => ({
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
  sentryWebpackPluginOptions,
);
