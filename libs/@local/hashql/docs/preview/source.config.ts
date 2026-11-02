import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// The hand-written pages. A host compiles them with its own MDX options, so
// the preview keeps fumadocs' defaults.
export const docs = defineDocs({ dir: "../content" });

export default defineConfig();
