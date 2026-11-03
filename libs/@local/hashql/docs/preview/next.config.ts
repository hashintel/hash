import { createMDX } from "fumadocs-mdx/next";

import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  reactStrictMode: true,
  // Keep `next dev` from writing an `AGENTS.md` into this directory.
  agentRules: false,
  // The package's one tsconfig covers the preview too.
  typescript: { tsconfigPath: "../tsconfig.json" },
  // The extraction runs in the server. `@microsoft/tsdoc-config` resolves the
  // path of its schema when it runs, and `oxfmt` loads a native binding. A
  // bundle has neither file at its path, so Node loads both packages.
  serverExternalPackages: ["@microsoft/tsdoc-config", "oxfmt"],
};

export default withMDX(config);
