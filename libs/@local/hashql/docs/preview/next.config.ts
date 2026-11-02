import { createMDX } from "fumadocs-mdx/next";

import type { NextConfig } from "next";

// The generated `.source/` imports with `.js` extensions, which NodeNext
// resolution requires.
const withMDX = createMDX({ index: { addJsExtension: true } });

const config: NextConfig = { reactStrictMode: true };

export default withMDX(config);
