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
  
  // External domains to allow loading images from
  images: {
    loader: 'custom',
    loaderFile: './src/util/img-cdn-loader.ts',
  },
};

module.exports = nextConfig;
