/**
 * The site's build: React with the compiler, MDX compiled here from the
 * synced bundle with the same remark and rehype steps the pages expect, and
 * the dev server's reload on a re-rendered diagram. The bundle and the
 * instance's identity are written into `src/content/` and `public/` by
 * `archinaut` before Vite runs; this site owns no content of its own.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import react from "@vitejs/plugin-react";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { defineConfig } from "vite";

import { resolveDiffCompareContext } from "./src/diff-context.ts";
import { rehypeInlineDiagrams } from "./src/plugins/inline-diagrams.mjs";
import { rehypeMathErrors } from "./src/plugins/math-errors.mjs";
import { reloadDiagrams } from "./src/plugins/reload-diagrams.mjs";
import { remarkAsides } from "./src/plugins/remark-asides.mjs";

import type { BundleManifest } from "../src/bundle/outputs.ts";

const contentPath = (name: string): string =>
  fileURLToPath(new URL(`./src/content/${name}`, import.meta.url));

const manifest = JSON.parse(
  readFileSync(contentPath("manifest.json"), "utf8"),
) as BundleManifest;

export default defineConfig(async () => ({
  // Astro's prerender entry resolved its own dependencies; this one has none
  // outside the tool's node_modules.
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    __PND_DIFF_COMPARE__: JSON.stringify(
      await resolveDiffCompareContext(manifest),
    ),
  },
  plugins: [
    // MDX before React, so React's fast refresh sees compiled JSX.
    {
      enforce: "pre" as const,
      ...mdx({
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [
          remarkFrontmatter,
          remarkGfm,
          remarkMath,
          remarkDirective,
          remarkAsides,
        ],
        rehypePlugins: [
          rehypeSlug,
          rehypeInlineDiagrams,
          // Formulas render here, so a page ships no math runtime; one
          // KaTeX cannot parse stops the build instead of shipping in red.
          rehypeKatex,
          rehypeMathErrors,
          [
            rehypeShiki,
            {
              themes: { light: "github-light", dark: "github-dark" },
              defaultColor: false,
            },
          ],
        ],
      }),
    },
    react({
      // Compiled pages are React components too; with the refresh runtime on
      // them an edited page swaps in without a document reload.
      include: /\.(mdx|js|jsx|ts|tsx)$/u,
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "all_errors",
      },
    }),
    reloadDiagrams({
      diagramsDirectory: contentPath("diagrams/"),
      docsDirectory: contentPath("docs/"),
    }),
  ],
  build: {
    // Lightning CSS folds animation longhands into a shorthand no browser
    // accepts with a timeline in it, which kills the scroll-driven fades.
    cssMinify: "esbuild" as const,
  },
  server: { host: "localhost" },
}));
