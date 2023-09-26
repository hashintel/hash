/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hashintel/design-system"],

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

module.exports = nextConfig;
