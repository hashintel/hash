import { createMDX } from "fumadocs-mdx/next";

import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  reactStrictMode: true,
  // Keep `next dev` from writing an `AGENTS.md` into this directory.
  agentRules: false,
  // The package's one tsconfig covers the preview too.
  typescript: { tsconfigPath: "../tsconfig.json" },
};

export default withMDX(config);
