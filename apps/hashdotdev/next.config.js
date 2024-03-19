/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx"],
  poweredByHeader: false,

  // We call linters in GitHub Actions for all pull requests. By not linting
  // again during `next build`, we save CI minutes and unlock more feedback.
  // Thus, we can get Playwright test results and Preview releases for WIP
  // PRs.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    domains: ["hash.ai"],
  },

  async redirects() {
    return [
      /**
       * Docs pages
      */
      {
        source: "/docs/simulations/concepts/:path",
        destination: "/docs/simulations/create/design-considerations/:path",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/advanced/designing-with-process-models",
        destination: "/docs/simulations/create/libraries/process",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/advanced/designing-with-the-material-handling-libraries",
        destination: "/docs/simulations/create/libraries/material",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/advanced/physics",
        destination: "/docs/simulations/create/libraries/physics",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/advanced/designing-with-system-dynamics-models",
        destination: "/docs/simulations/create/libraries/system-dynamics",
        permanent: true,
      },
      {
        source: "/docs/simulations/creating-simulations/:path*",
        destination: "/docs/simulations/create/:path*",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/experiment/:path*",
        destination: "/docs/simulations/run/experiment/:path*",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/anatomy-of-an-agent/:path*",
        destination: "/docs/simulations/create/agents/:path*",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/views/:path*",
        destination: "/docs/simulations/run/simulation/outputs/:path*",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/agent-based-modeling-basics-1",
        destination: "/docs/simulations/create/abm",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/h.cloud",
        destination: "/docs/simulations/run/cloud",
        permanent: true,
      },
      {
        source: "/docs/simulations/create/libraries/python-packages",
        destination: "/docs/simulations/create/libraries/third-party",
        permanent: true,
      },
      {
        source: "/docs/simulations/advanced/design-considerations",
        destination: "/docs/simulations/create/design-considerations/actor-model",
        permanent: true,
      },
      {
        source: "/docs/simulations/advanced/design-considerations/managing-resource-access",
        destination: "/docs/simulations/create/design-considerations/resource-access",
        permanent: true,
      },
      {
        source: "/docs/simulations/advanced/designing-for-different-timescales",
        destination: "/docs/simulations/create/design-considerations/timescales",
        permanent: true,
      },
      {
        source: "/docs/simulations/advanced/designing-with-distributions",
        destination: "/docs/simulations/create/design-considerations/distributions",
        permanent: true,
      },
      {
        source: "/docs/simulations/advanced/verification-and-validation",
        destination: "/docs/simulations/create/design-considerations/verify-validate",
        permanent: true,
      },
      {
        source: "/docs/simulations/extra/determinism",
        destination: "/docs/simulations/create/design-considerations/determinism",
        permanent: true,
      },
      {
        source: "/docs/simulations/extra/design-considerations",
        destination: "/docs/simulations/create/design-considerations",
        permanent: true,
      },
      {
        source: "/docs/simulations/extra/performance",
        destination: "/docs/simulations/run/performance",
        permanent: true,
      },
      {
        source: "/docs/simulations/extra/migrating",
        destination: "/docs/simulations/tutorials/migrating",
        permanent: true,
      },
      /**
       * License page redirects
       */
      {
        source: "/license",
        destination: "https://hash.ai/legal/developers/license",
        permanent: true,
      },
      {
        source: "/licence",
        destination: "https://hash.ai/legal/developers/license",
        permanent: true,
      },
      /**
       * General page redirects
      */
      {
        source: "/discord",
        destination: "https://hash.ai/discord",
        permanent: true,
      },
      {
        source: "/contact",
        destination: "https://hash.ai/contact",
        permanent: true,
      },
      /**
       * Temporary redirects
       * 1) the `/docs` home page to the first tab of `/docs`
       * 2) `/labs` while we wait on its existence
       */
      {
        source: "/docs",
        destination: "/docs/get-started",
        permanent: false,
      },
      {
        source: "/labs",
        destination: "/blog?label=labs",
        permanent: false,
      },
    ];
  },

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
};

// eslint-disable-next-line import/no-default-export
export default nextConfig;
