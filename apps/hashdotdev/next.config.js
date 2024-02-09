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
