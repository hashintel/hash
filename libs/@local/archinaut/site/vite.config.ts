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
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { defineConfig, searchForWorkspaceRoot } from "vite";

import { resolveDiffCompareContext } from "./src/diff-context.ts";
import { decksPlugin } from "./src/plugins/decks.ts";
import { rehypeFormulas } from "./src/plugins/formulas.mjs";
import { rehypeInlineDiagrams } from "./src/plugins/inline-diagrams.mjs";
import { remarkLayerCards } from "./src/plugins/layer-cards.mjs";
import { reloadDiagrams } from "./src/plugins/reload-diagrams.mjs";
import { remarkAsides } from "./src/plugins/remark-asides.mjs";
import { remarkSchemeLinks } from "./src/plugins/scheme-links.mjs";
import { remarkSlideDiagrams } from "./src/plugins/slide-diagrams.ts";
import { remarkSlideMetadata } from "./src/plugins/slide-metadata.mjs";

import type { BundleManifest } from "../src/bundle/outputs.ts";

const contentPath = (name: string): string =>
  fileURLToPath(new URL(`./src/content/${name}`, import.meta.url));

const manifest = JSON.parse(
  readFileSync(contentPath("manifest.json"), "utf8"),
) as BundleManifest;

/** The instance's decks, read from wherever `site.json` says they are. */
const slidesRoot = (
  JSON.parse(readFileSync(contentPath("site.json"), "utf8")) as {
    slides: string | null;
  }
).slides;
const siteSource = fileURLToPath(new URL("./src", import.meta.url));

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
          [
            remarkLayerCards,
            {
              docsDirectory: contentPath("docs/"),
              // The bundle's model, which the site serves from `public/`.
              modelPath: fileURLToPath(
                new URL("./public/architecture.json", import.meta.url),
              ),
            },
          ],
          [
            remarkSchemeLinks,
            {
              slugs: new Set(manifest.pages.map((page) => page.slug)),
              docsDirectory: contentPath("docs/"),
            },
          ],
          [remarkSlideMetadata, { docsDirectory: contentPath("docs/") }],
          // After the step count, which reads the d2 source this replaces.
          [
            remarkSlideDiagrams,
            {
              docsDirectory: contentPath("docs/"),
              cwd: fileURLToPath(new URL("..", import.meta.url)),
              fontsDirectory: fileURLToPath(
                new URL("../fonts", import.meta.url),
              ),
            },
          ],
        ],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeInlineDiagrams,
            { diagramsDirectory: contentPath("diagrams") },
          ],
          // Formulas render here, so a page ships no math runtime; one
          // KaTeX cannot parse stops the build instead of shipping in red.
          [rehypeFormulas, { docsDirectory: contentPath("docs/") }],
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
    decksPlugin(slidesRoot),
  ],
  resolve: {
    // What a deck may import (`src/slides/index.ts` is the list), and the
    // deck folder itself, wherever it is.
    alias: [
      {
        find: /^@archinaut\/slides$/u,
        replacement: `${siteSource}/slides/index.ts`,
      },
      ...(slidesRoot === null
        ? []
        : [{ find: "@decks", replacement: slidesRoot }]),
    ],
    // A deck outside the workspace resolves React from its own folder up;
    // there must be one React.
    dedupe: ["react", "react-dom", "@mdx-js/react"],
  },
  build: {
    // Lightning CSS folds animation longhands into a shorthand no browser
    // accepts with a timeline in it, which kills the scroll-driven fades.
    cssMinify: "esbuild" as const,
  },
  server: {
    host: "localhost",
    fs: {
      // The workspace, as Vite allows by default, plus the deck folder when
      // it lies outside the workspace.
      allow: [
        searchForWorkspaceRoot(siteSource),
        ...(slidesRoot === null ? [] : [slidesRoot]),
      ],
    },
  },
}));
