const { config } = require("dotenv-flow");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const { withSentryConfig } = require("@sentry/nextjs");

const { DefinePlugin } = require("webpack");

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
// NOTE THAT any environment variable which is _missing_ will be converted to the string 'undefined' if no fallback is set

process.env.NEXT_PUBLIC_HASH_OPENSEARCH_ENABLED =
  process.env.HASH_OPENSEARCH_ENABLED ?? false;

// This allows the frontend to generate the graph type IDs in the browser
process.env.NEXT_PUBLIC_FRONTEND_URL = process.env.FRONTEND_URL;

// The API origin
process.env.NEXT_PUBLIC_API_ORIGIN =
  process.env.API_ORIGIN ?? "http://localhost:5001";

process.env.NEXT_PUBLIC_SENTRY_DSN = process.env.SENTRY_DSN ?? "";
process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE =
  process.env.SENTRY_REPLAY_SESSION_SAMPLE_RATE ?? 1;

const apiUrl = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:5001";

const apiDomain = new URL(apiUrl).hostname;

/**
 * @todo: import the page `entityTypeId` from `@local/hash-isomorphic-utils/ontology-types`
 * when the `next.config.js` supports imports from modules
 */
const pageEntityTypeBaseUrl = "https://hash.ai/@hash/types/entity-type/page/";

/**
 * @todo make plugin definition cleaner - some ideas in https://github.com/cyrilwanner/next-compose-plugins/issues/59
 *    next-compose plugins itself is unmaintained and leads to 'invalid config property' warnings if used
 */
module.exports = withSentryConfig(
  withBundleAnalyzer(
    /** @type {import('next').NextConfig} */
    {
      async rewrites() {
        return [
          {
            source: "/pages",
            destination: `/entities?entityTypeIdOrBaseUrl=${pageEntityTypeBaseUrl}`,
          },
        ];
      },
      images: {
        domains: [apiDomain],
      },
      redirects() {
        return [
          {
            source: "/settings/organizations/:shortname(^(?!new)$)",
            destination: "/settings/organizations/:shortname/general",
            permanent: true,
          },
        ];
      },
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
      pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx", "api.ts"],

      // We call linters in GitHub Actions for all pull requests. By not linting
      // again during `next build`, we save CI minutes and unlock more feedback.
      // Thus, we can get Playwright test results and Preview releases for WIP PRs.
      eslint: { ignoreDuringBuilds: true },
      typescript: { ignoreBuildErrors: true },

      sentry: {
        autoInstrumentServerFunctions: false,
        hideSourceMaps: false,
      },

      transpilePackages: [
        "@blockprotocol/service",
        "@blockprotocol/core",
        "@blockprotocol/graph",
        "@blockprotocol/hook",
        "@blockprotocol/type-system",
        "@emotion/server",
        "@hashintel/design-system",
        "@hashintel/block-design-system",
        "@hashintel/type-editor",
        "@hashintel/query-editor",
        "@local/advanced-types",
        "@local/hash-graph-client",
        "@local/hash-isomorphic-utils",
        "@local/hash-subgraph",
        "react-syntax-highlighter",
        "@tldraw/polyfills",
        "@tldraw/tldraw",
        "@tldraw/tlschema",
        "@tldraw/ui",
      ],

      experimental: {
        // These are introduced in the monorepo by the Temporal packages, and despite them not being part of the
        // frontend dependency tree, they are not shaken and are included in the generated lambdas
        // https://github.com/orgs/vercel/discussions/103#discussioncomment-5427097
        outputFileTracingExcludes: {
          "*": [
            "node_modules/@swc/core-linux-x64-gnu",
            "node_modules/@swc/core-linux-x64-musl",
            "node_modules/@esbuild/linux-x64",
          ],
        },
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

        webpackConfig.plugins.push(
          new DefinePlugin({
            __SENTRY_DEBUG__: false,
            __SENTRY_TRACING__: false,
          }),
        );

        return webpackConfig;
      },
    },
  ),
  sentryWebpackPluginOptions,
);
