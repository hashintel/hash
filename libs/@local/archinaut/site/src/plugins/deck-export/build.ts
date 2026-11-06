/**
 * Builds one deck into a single HTML file, in the dev server's process. The
 * site's own Vite config compiles the slides exactly as the deck view gets
 * them; an entry imports every slide and mounts the player; the output is
 * inlined into one document. Terser minifies the script over three passes,
 * Lightning CSS the stylesheet and html-minifier-terser the document, and
 * every font and image goes in as a data URL, trimmed first by
 * `font-diet.ts`.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";

import { exportedDocument } from "./document.ts";
import { exportEntrySource } from "./entry.ts";
import {
  withoutUnusedKatexFamilies,
  withoutUnusedSubsets,
  withWoff2Only,
} from "./font-diet.ts";

import type { DeckFolder } from "../../../../src/slides/folders.ts";
import type { SlideShape } from "../../slides/deck/slide-shape.ts";
import type { Plugin, Rolldown } from "vite";

const entryPlugins = (entry: string, source: string): Plugin[] => [
  {
    name: "archinaut-deck-export:entry",
    enforce: "pre",
    resolveId: (id) => (id === entry ? id : null),
    load: (id) => (id === entry ? source : null),
    transform: (code, id) => {
      if (id.includes("@fontsource-variable/") && id.endsWith(".css")) {
        return withoutUnusedSubsets(code);
      }
      return id.endsWith("katex.min.css") ? withWoff2Only(code) : null;
    },
  },
  {
    name: "archinaut-deck-export:katex-families",
    enforce: "post",
    generateBundle: (_, bundle) => {
      const code = Object.values(bundle)
        .map((file) => (file.type === "chunk" ? file.code : ""))
        .join("\n");
      for (const file of Object.values(bundle)) {
        if (
          file.type === "asset" &&
          file.fileName.endsWith(".css") &&
          typeof file.source === "string"
        ) {
          file.source = withoutUnusedKatexFamilies(file.source, code);
        }
      }
    },
  },
];

const outputOf = (
  result: Awaited<ReturnType<typeof build>>,
): Rolldown.RolldownOutput => {
  const output = Array.isArray(result) ? result[0] : result;
  if (output === undefined || !("output" in output)) {
    throw new Error("the deck export built nothing to inline");
  }
  return output;
};

export const buildDeckExport = async ({
  configFile,
  siteRoot,
  slidesRoot,
  deck,
  shape,
}: {
  configFile: string;
  siteRoot: string;
  slidesRoot: string | null;
  deck: DeckFolder;
  shape: SlideShape;
}): Promise<string> => {
  const entry = join(siteRoot, "src/slides/export/__deck-export.tsx");
  const output = outputOf(
    await build({
      configFile,
      root: siteRoot,
      mode: "production",
      logLevel: "warn",
      publicDir: false,
      plugins: entryPlugins(
        entry,
        exportEntrySource({ deck, slidesRoot, shape }),
      ),
      build: {
        write: false,
        outDir: join(tmpdir(), "archinaut-deck-export"),
        emptyOutDir: false,
        copyPublicDir: false,
        target: "esnext",
        minify: "terser",
        terserOptions: {
          ecma: 2020,
          module: true,
          toplevel: true,
          compress: { passes: 3, pure_getters: true },
          format: { comments: false },
        },
        cssMinify: "lightningcss",
        cssCodeSplit: false,
        assetsInlineLimit: () => true,
        modulePreload: false,
        reportCompressedSize: false,
        sourcemap: false,
        rolldownOptions: {
          input: entry,
          output: { codeSplitting: false },
        },
      },
    }),
  );
  const script = output.output.filter((file) => file.type === "chunk");
  const styles = output.output.filter(
    (file) => file.type === "asset" && file.fileName.endsWith(".css"),
  );
  const leftOver = output.output.filter(
    (file) => file.type === "asset" && !file.fileName.endsWith(".css"),
  );
  if (script.length !== 1 || leftOver.length > 0) {
    throw new Error(
      `a deck export inlines one script and its styles; this build made ${output.output.map((file) => file.fileName).join(", ")}`,
    );
  }
  return exportedDocument({
    title: deck.title,
    css: styles
      .map((file) => (file.type === "asset" ? String(file.source) : ""))
      .join(""),
    js: script[0]?.type === "chunk" ? script[0].code : "",
  });
};
