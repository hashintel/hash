/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx"],

  // We call linters in GitHub Actions for all pull requests. By not linting
  // again during `next build`, we save CI minutes and unlock more feedback.
  // Thus, we can get Playwright test results and Preview releases for WIP
  // PRs.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    domains: ["hash.ai"],
  },

  experimental: {
    // These are introduced in the monorepo by the Temporal packages, and despite them not being part of the
    // frontend dependency tree, they are not shaken and are included in the generated lambdas
    // https://github.com/orgs/vercel/discussions/103#discussioncomment-5427097
    outputFileTracingIgnores: [
      "node_modules/@swc/core-linux-x64-gnu",
      "node_modules/@swc/core-linux-x64-musl",
      "node_modules/@esbuild/linux-x64",
    ],
  },
};

module.exports = nextConfig;
