/**
 * Reloads the dev server's pages when a rendered diagram changes.
 *
 * `inline-diagrams.mjs` reads each SVG while the page compiles, so Vite's
 * module graph knows the page and not the file it inlined. A diagram the
 * generator re-renders therefore changes nothing Vite watches, and the page
 * keeps the old drawing until its own source changes. This plugin treats an
 * SVG under the diagrams directory as a change to every docs page: the pages
 * are invalidated, recompiled on their next request, and the browser reloads.
 */

/**
 * @param {{ diagramsDirectory: string; docsDirectory: string }} options absolute directories
 * @returns {import("vite").Plugin}
 */
export const reloadDiagrams = ({ diagramsDirectory, docsDirectory }) => ({
  name: "archinaut-reload-diagrams",
  handleHotUpdate({ file, server }) {
    if (!file.startsWith(diagramsDirectory) || !file.endsWith(".svg")) {
      return undefined;
    }
    for (const module of server.moduleGraph.idToModuleMap.values()) {
      if (
        module.file?.startsWith(docsDirectory) &&
        module.file.endsWith(".mdx")
      ) {
        server.moduleGraph.invalidateModule(module);
      }
    }
    server.ws.send({ type: "full-reload", path: "*" });
    return [];
  },
});
