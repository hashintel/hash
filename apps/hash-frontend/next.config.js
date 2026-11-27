import { withSentryConfig } from "@sentry/nextjs/config";
import { config } from "dotenv-flow";

// eslint-disable-next-line import/extensions
import { buildStamp } from "./buildstamp.js";

config({ silent: true, path: "../.." });

/**
 * @type {import('@sentry/nextjs/config').SentryBuildOptions}
 */
const sentryBuildOptions = {
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
  reactComponentAnnotation: {
    enabled: true,
  },
  release: {
    name: buildStamp,
  },
  silent: true,
  widenClientFileUpload: true,
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/
};

// Insert other public env variables here. We have to add the `NEXT_PUBLIC` prefix for next to find them.
// They then get converted into variables with the right name in `frontend/src/lib/public-env.ts`
// NOTE THAT any environment variable which is _missing_ will be converted to the string 'undefined' if no fallback is set

// Show the worker cost in the UI. Always enabled for admins
process.env.NEXT_PUBLIC_SHOW_WORKER_COST =
  process.env.SHOW_WORKER_COST ?? "false";

// The API origin
process.env.NEXT_PUBLIC_API_ORIGIN =
  process.env.API_ORIGIN ?? "http://localhost:5001";

// Brunch's origin, which the process page's assistant calls with the user's
// session. Unset, the page offers no assistant.
process.env.NEXT_PUBLIC_HASH_BRUNCH_AGENT_ORIGIN =
  process.env.HASH_BRUNCH_AGENT_ORIGIN ?? "";

process.env.NEXT_PUBLIC_SENTRY_DSN = process.env.SENTRY_DSN ?? "";
process.env.NEXT_PUBLIC_ENVIRONMENT = process.env.ENVIRONMENT ?? "";
process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT =
  process.env.SENTRY_ENVIRONMENT ?? "";
process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE =
  process.env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "1";

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

// eslint-disable-next-line import/no-default-export
export default withSentryConfig(
  /** @type {import('next').NextConfig} */ ({
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
          source:
            "/@:shortname/types/:typeKind(data-type|entity-type|property-type|link-type)s",
          destination: "/@/:shortname?tab=Types&typeKind=:typeKind",
        },
        {
          source: "/@:shortname/:path*",
          destination: "/@/:shortname/:path*",
        },
      ];
    },
    images: {
      remotePatterns: [{ hostname: apiDomain }],
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
        // Kratos sends browsers to its `/self-service/<flow>/browser` endpoints
        // on this origin, because `SERVE_PUBLIC_BASE_URL` points here, but the
        // frontend has no such routes. Next.js passes the query through, so
        // `aal`, `refresh` and `return_to` reach the UI route. Keep in sync with
        // `flowMetadata` in `src/pages/shared/ory-kratos.ts`.
        {
          source: "/self-service/login/browser",
          destination: "/signin",
          permanent: false,
        },
        {
          source: "/self-service/recovery/browser",
          destination: "/recovery",
          permanent: false,
        },
        {
          source: "/self-service/registration/browser",
          destination: "/signup",
          permanent: false,
        },
        {
          source: "/self-service/settings/browser",
          destination: "/settings/security",
          permanent: false,
        },
        {
          source: "/self-service/verification/browser",
          destination: "/verification",
          permanent: false,
        },
      ];
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            // `frame-ancestors` in the Content Security Policy supersedes
            // this where supported; it covers routes the policy isn't set on.
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value:
                "camera=(), geolocation=(), display-capture=(), payment=()",
            },
          ],
        },
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

    // We type-check in GitHub Actions for all pull requests. By not checking
    // again during `next build`, we save CI minutes and unlock more feedback.
    // Thus, we can get Playwright test results and Preview releases for WIP PRs.
    typescript: { ignoreBuildErrors: true },

    turbopack: {
      rules: {
        "*.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.js",
        },
      },
    },

    transpilePackages: [
      "@blockprotocol/service",
      "@blockprotocol/core",
      "@blockprotocol/graph",
      "@blockprotocol/hook",
      "@blockprotocol/type-system",
      "@emotion/server",
      "@hashintel/block-design-system",
      "@hashintel/design-system",
      "@hashintel/integrations-catalog",
      "@hashintel/petrinaut",
      "@hashintel/petrinaut-core",
      "@hashintel/ds-components",
      "@hashintel/ds-helpers",
      "@hashintel/type-editor",
      "echarts",
      "zrender",
      "@hashintel/query-editor",
      "@local/advanced-types",
      "@local/flow-petri-net",
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
  }),
  sentryBuildOptions,
);
