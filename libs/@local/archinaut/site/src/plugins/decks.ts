/**
 * Serves the instance's decks and the examples to the site as
 * `virtual:archinaut-decks`: one entry per deck folder, each slide a lazy
 * import of its module through the deck's alias, so Vite compiles slides
 * wherever the folder lives and hot-swaps an edited one like any other
 * module.
 *
 * The folder is watched through the dev server, not `addWatchFile`: a file
 * added in `load` is recorded as an import of the module, and a directory
 * cannot be resolved as one. A slide or deck added or removed re-lists the
 * decks and reloads the page; `deck.json` is watched for the same reason.
 * A deck's logo, when it names one, is imported as a URL.
 */

import {
  examplesRoot,
  listAllDecks,
  type DeckFolderLogo,
} from "../../../src/slides/folders.ts";
import { codeLiteral } from "./code-literal.ts";
import { deckFileSpecifier } from "./deck-specifier.ts";

import type { Plugin } from "vite";

const moduleId = "virtual:archinaut-decks";
const resolvedId = `\0${moduleId}`;

const sourceOf = (root: string | null): string => {
  // A deck's own logo is an asset import, so Vite serves and fingerprints it.
  const logoImports: string[] = [];
  const decks = listAllDecks(root).map((deck) => {
    const specifier = (file: string): string =>
      codeLiteral(deckFileSpecifier(deck, root, file));
    const logoOf = (logo: DeckFolderLogo): string => {
      if (logo.kind !== "file") {
        return codeLiteral(logo);
      }
      const name = `logo${logoImports.length}`;
      logoImports.push(`import ${name} from ${specifier(`${logo.file}?url`)};`);
      return `{ kind: "image", src: ${name}, scale: ${codeLiteral(logo.scale)} }`;
    };
    const slides = deck.slides.map(
      (slide) =>
        `{ id: ${codeLiteral(slide.id)}, kind: ${codeLiteral(slide.kind)}, load: () => import(${specifier(slide.file)}) }`,
    );
    const style =
      deck.stylesheet === null
        ? "null"
        : `() => import(${specifier(deck.stylesheet)})`;
    return `{ id: ${codeLiteral(deck.id)}, origin: ${codeLiteral(deck.origin)}, title: ${codeLiteral(deck.title)}, description: ${codeLiteral(deck.description)}, logo: ${logoOf(deck.logo)}, theme: ${codeLiteral(deck.theme)}, loadStyle: ${style}, slides: [${slides.join(", ")}] }`;
  });
  return `${logoImports.join("\n")}\nexport default [${decks.join(", ")}];`;
};

export const decksPlugin = (root: string | null): Plugin => ({
  name: "archinaut-decks",
  resolveId: (id) => (id === moduleId ? resolvedId : null),
  load: (id) => (id === resolvedId ? sourceOf(root) : null),
  configureServer(server) {
    const roots = root === null ? [examplesRoot] : [root, examplesRoot];
    server.watcher.add(roots);
    const relist = (file: string): void => {
      if (!roots.some((watched) => file.startsWith(watched))) {
        return;
      }
      const module = server.moduleGraph.getModuleById(resolvedId);
      if (module !== undefined) {
        server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload", path: "*" });
      }
    };
    for (const event of ["add", "unlink", "addDir", "unlinkDir"] as const) {
      server.watcher.on(event, relist);
    }
    server.watcher.on("change", (file) => {
      if (file.endsWith("deck.json")) {
        relist(file);
      }
    });
  },
});
