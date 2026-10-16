import path from "node:path";

import { createMDX } from "fumadocs-mdx/next";

export default createMDX()({
  reactStrictMode: true,
  serverExternalPackages: ["typescript"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../../../../.."),
  devIndicators: false,
});
