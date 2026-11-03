/**
 * Serves the instance's decks to the site as `virtual:archinaut-decks`: one
 * entry per deck folder, each slide a lazy import of its module through the
 * `@decks` alias, so Vite compiles slides wherever the folder lives and
 * hot-swaps an edited one like any other module.
 *
 * The folder is watched through the dev server, not `addWatchFile`: a file
 * added in `load` is recorded as an import of the module, and a directory
 * cannot be resolved as one. A slide or deck added or removed re-lists the
 * decks and reloads the page; `deck.json` is watched for the same reason.
 */

import { relative } from "node:path";

import { listDecks } from "../../../src/slides/folders.ts";

import type { Plugin } from "vite";

const moduleId = "virtual:archinaut-decks";
const resolvedId = `\0${moduleId}`;

const sourceOf = (root: string | null): string => {
  const specifier = (file: string): string =>
    JSON.stringify(`@decks/${relative(root ?? "", file)}`);
  const decks = listDecks(root).map((deck) => {
    const slides = deck.slides.map(
      (slide) =>
        `{ id: ${JSON.stringify(slide.id)}, kind: ${JSON.stringify(slide.kind)}, load: () => import(${specifier(slide.file)}) }`,
    );
    const style =
      deck.stylesheet === null
        ? "null"
        : `() => import(${specifier(deck.stylesheet)})`;
    return `{ id: ${JSON.stringify(deck.id)}, title: ${JSON.stringify(deck.title)}, description: ${JSON.stringify(deck.description)}, loadStyle: ${style}, slides: [${slides.join(", ")}] }`;
  });
  return `export default [${decks.join(", ")}];`;
};

export const decksPlugin = (root: string | null): Plugin => ({
  name: "archinaut-decks",
  resolveId: (id) => (id === moduleId ? resolvedId : null),
  load: (id) => (id === resolvedId ? sourceOf(root) : null),
  configureServer(server) {
    if (root === null) {
      return;
    }
    server.watcher.add(root);
    const relist = (file: string): void => {
      if (!file.startsWith(root)) {
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
