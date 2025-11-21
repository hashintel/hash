import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { config } from "dotenv-flow";
import webpack from "webpack";

// eslint-disable-next-line import/extensions
import { buildStamp } from "./buildstamp.js";

const { DefinePlugin } = webpack;
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

config({ silent: true, path: "../.." });

/**
 * @type {import('@sentry/nextjs').SentryBuildOptions}
 */
const sentryWebpackPluginOptions = {
  disableLogger: true,
  reactComponentAnnotation: {
    enabled: true,
  },
  release: {
    name: buildStamp,
  },
  silent: true,
  widenClientFileUpload: true,
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.
};

// Insert other public env variables here. We have to add the `NEXT_PUBLIC` prefix for next to find them.
// They then get converted into variables with the right name in `frontend/src/lib/public-env.ts`
// NOTE THAT any environment variable which is _missing_ will be converted to the string 'undefined' if no fallback is set

// Show the worker cost in the UI. Always enabled for admins
process.env.NEXT_PUBLIC_SHOW_WORKER_COST =
  process.env.SHOW_WORKER_COST ?? "false";

// This allows the frontend to generate the graph type IDs in the browser
process.env.NEXT_PUBLIC_FRONTEND_URL = process.env.FRONTEND_URL;

// The API origin
process.env.NEXT_PUBLIC_API_ORIGIN =
  process.env.API_ORIGIN ?? "http://localhost:5001";

process.env.NEXT_PUBLIC_SENTRY_DSN = process.env.SENTRY_DSN ?? "";
process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE =
  process.env.SENTRY_REPLAY_SESSION_SAMPLE_RATE ?? "1";

process.env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL =
  process.env.NOTIFICATION_POLL_INTERVAL ?? "";

process.env.NEXT_PUBLIC_SELF_HOSTED_HASH = process.env.SELF_HOSTED_HASH ?? "";

process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";

const apiUrl = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:5001";

const apiDomain = new URL(apiUrl).hostname;

/**
 * @todo: import the page `entityTypeId` from `@local/hash-isomorphic-utils/ontology-types`
 * when the `next.config.js` supports imports from modules
 */
const pageEntityTypeBaseUrl = "https://hash.ai/@h/types/entity-type/page/";

/**
 * @todo make plugin definition cleaner - some ideas in https://github.com/cyrilwanner/next-compose-plugins/issues/59
 *    next-compose plugins itself is unmaintained and leads to 'invalid config property' warnings if used
 */
// eslint-disable-next-line import/no-default-export
export default withSentryConfig(
  withBundleAnalyzer(
    /** @type {import('next').NextConfig} */
    {
      async rewrites() {
        return [
          {
            source: "/pages",
            destination: `/entities?entityTypeIdOrBaseUrl=${pageEntityTypeBaseUrl}`,
          },
          {
            source: "/@:shortname/types",
            destination: "/@/:shortname?tab=Types",
          },
          {
            source: "/@:shortname/:path*",
            destination: "/@/:shortname/:path*",
          },
        ];
      },
      images: {
        domains: [apiDomain],
      },
      async redirects() {
        return [
          {
            source: "/settings/organizations/:shortname(^(?!new)$)",
            destination: "/settings/organizations/:shortname/general",
            permanent: true,
          },
          {
            source: "/login",
            destination: "/signin",
            permanent: true,
          },
          {
            source: "/inbox",
            destination: "/notifications",
            permanent: false,
          },
        ];
      },
      async headers() {
        return [
          {
            /**
             * allow fetching types as JSON from anywhere
             * see /src/middleware.page.ts for middleware which serves the JSON
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

      transpilePackages: [
        "@blockprotocol/service",
        "@blockprotocol/core",
        "@blockprotocol/graph",
        "@blockprotocol/hook",
        "@blockprotocol/type-system",
        "@emotion/server",
        "@hashintel/block-design-system",
        "@hashintel/design-system",
        "@hashintel/petrinaut-old",
        "@hashintel/type-editor",
        "echarts",
        "zrender",
        "@hashintel/query-editor",
        "@local/advanced-types",
        "@local/hash-graph-client",
        "@local/hash-isomorphic-utils",
        "react-syntax-highlighter",
        "@tldraw/polyfills",
        "@tldraw/tldraw",
        "@tldraw/tlschema",
        "@tldraw/ui",
      ],

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

      webpack: (webpackConfig, { isServer }) => {
        webpackConfig.module.rules.push({
          test: /\.svg$/,
          use: ["@svgr/webpack"],
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
        webpackConfig.resolve.extensionAlias = {
          ".js": [".ts", ".tsx", ".jsx", ".js"],
          ".mjs": [".mts", ".mjs"],
          ".cjs": [".cts", ".cjs"],
        };

        // eslint-disable-next-line no-param-reassign
        webpackConfig.resolve.alias.canvas = false;

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
