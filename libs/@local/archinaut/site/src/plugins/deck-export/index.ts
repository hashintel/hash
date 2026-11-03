/**
 * Exports a deck as one HTML file from the dev server, and only there:
 * `GET /__archinaut/export?deck=<id>&shape=<shape>` builds the deck and
 * answers the file as a download. A production site has no such route, so
 * the settings panel offers the export in development alone.
 */

import { listDecks } from "../../../../src/slides/folders.ts";
import { parseSlideShape } from "../../slides/deck/slide-shape.ts";
import { deckExportRoute } from "../../slides/export/route.ts";
import { buildDeckExport } from "./build.ts";

import type { SlideShape } from "../../slides/deck/slide-shape.ts";
import type { Plugin } from "vite";

const shapeOf = (value: string | null): SlideShape =>
  parseSlideShape(value) ?? "16:9";

export const deckExportPlugin = (slidesRoot: string | null): Plugin => ({
  name: "archinaut-deck-export",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(deckExportRoute, (request, response) => {
      const query = new URL(request.url ?? "", "http://localhost").searchParams;
      const deck = listDecks(slidesRoot).find(
        (candidate) => candidate.id === query.get("deck"),
      );
      const configFile = server.config.configFile;
      if (
        deck === undefined ||
        slidesRoot === null ||
        configFile === undefined
      ) {
        response.statusCode = 404;
        response.end(`no deck "${query.get("deck") ?? ""}" to export`);
        return;
      }
      buildDeckExport({
        configFile,
        siteRoot: server.config.root,
        slidesRoot,
        deck,
        shape: shapeOf(query.get("shape")),
      }).then(
        (html) => {
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader(
            "Content-Disposition",
            `attachment; filename="${deck.id}.html"`,
          );
          response.end(html);
        },
        (error: unknown) => {
          server.config.logger.error(String(error));
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : String(error));
        },
      );
    });
  },
});
