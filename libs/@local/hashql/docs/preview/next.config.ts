import { createMDX } from "fumadocs-mdx/next";

import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  reactStrictMode: true,
  // Keep `next dev` from writing an `AGENTS.md` into this directory.
  agentRules: false,
  // The package's one tsconfig covers the preview too.
  typescript: { tsconfigPath: "../tsconfig.json" },
  // The extraction runs in the server, and `@microsoft/tsdoc-config` resolves
  // the path of its schema when it runs. A bundle has no file at that path, so
  // Node loads the package.
  serverExternalPackages: ["@microsoft/tsdoc-config"],
};

export default withMDX(config);
