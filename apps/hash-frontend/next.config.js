const { config } = require("dotenv-flow");
const withTM = require("next-transpile-modules")([
  "@hashintel/design-system",
  "@local/advanced-types",
  "@local/hash-graph-client",
  "@local/hash-graphql-shared",
  "@local/hash-isomorphic-utils",
  "@local/hash-subgraph/main",
]); // pass the modules you would like to see transpiled
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const { withSentryConfig } = require("@sentry/nextjs");

const { buildStamp } = require("./buildstamp");

config({ silent: true, path: "../.." });

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

// This allows the frontend to generate the graph type IDs in the browser
process.env.NEXT_PUBLIC_FRONTEND_URL = process.env.FRONTEND_URL;

// This allows the frontend to have the system account shortname, used to generate system types in shared/src/types.ts
// the frontend imports 'types' from that file in various places
process.env.NEXT_PUBLIC_SYSTEM_USER_SHORTNAME =
  process.env.SYSTEM_USER_SHORTNAME;

// The API origin
process.env.NEXT_PUBLIC_API_ORIGIN = process.env.API_ORIGIN;

process.env.NEXT_PUBLIC_SENTRY_DSN = process.env.SENTRY_DSN;
process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE =
  process.env.SENTRY_REPLAY_SESSION_SAMPLE_RATE;

/**
 * @todo make plugin definition cleaner - some ideas in https://github.com/cyrilwanner/next-compose-plugins/issues/59
 *    next-compose plugins itself is unmaintained and leads to 'invalid config property' warnings if used
 */
module.exports = withSentryConfig(
  withBundleAnalyzer(
    withTM(
      /** @type {import('next').NextConfig} */
      {
        async headers() {
          return [
            {
              /**
               * allow fetching types as JSON from anywhere
               * @see ./src/middleware.page.ts for middleware which serves the JSON
               */
              source: "/:shortname/types/:path*",
              has: [
                {
                  type: "header",
                  key: "accept",
                  value: "(.*application/json.*)",
                },
              ],
              headers: [
                {
                  key: "access-control-allow-origin",
                  value: "*",
                },
              ],
            },
          ];
        },
        pageExtensions: [
          "page.tsx",
          "page.ts",
          "page.jsx",
          "page.jsx",
          "api.ts",
        ],

        // We call linters in GitHub Actions for all pull requests. By not linting
        // again during `next build`, we save CI minutes and unlock more feedback.
        // Thus, we can get Playwright test results and Preview releases for WIP PRs.
        eslint: { ignoreDuringBuilds: true },
        typescript: { ignoreBuildErrors: true },

        sentry: {
          autoInstrumentServerFunctions: false,
          hideSourceMaps: false,
        },

        experimental: {
          allowMiddlewareResponseBody: true,
        },

        webpack: (webpackConfig, { isServer }) => {
          webpackConfig.module.rules.push({
            test: /\.svg$/,
            use: [require.resolve("@svgr/webpack")],
          });

          // eslint-disable-next-line no-param-reassign
          webpackConfig.experiments.asyncWebAssembly = true;
          if (!isServer) {
            // eslint-disable-next-line no-param-reassign
            webpackConfig.output.publicPath = `/_next/`;
          } else {
            // eslint-disable-next-line no-param-reassign
            webpackConfig.output.publicPath = `./`;
          }
          // eslint-disable-next-line no-param-reassign
          webpackConfig.output.assetModuleFilename = `static/[hash][ext]`;
          webpackConfig.module.rules.push({
            test: /\.(wasm)$/,
            type: "asset/resource",
          });

          // eslint-disable-next-line no-param-reassign
          webpackConfig.resolve.alias["@blockprotocol/type-system$"] =
            "@blockprotocol/type-system/slim";

          return webpackConfig;
        },
      },
    ),
  ),
  sentryWebpackPluginOptions,
);
