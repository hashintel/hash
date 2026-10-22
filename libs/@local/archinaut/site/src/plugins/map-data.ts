/**
 * Serves the architecture model to the map as `virtual:archinaut-map`,
 * compacted to what the map draws, so the page never ships the file lists
 * and edge examples that make up most of `architecture.json`.
 */

import { readFileSync } from "node:fs";

import { compactModel } from "../navigator/model/map-data.ts";

import type { ArchitectureModel } from "../../../src/model.ts";
import type { Plugin } from "vite";

const moduleId = "virtual:archinaut-map";
const resolvedId = `\0${moduleId}`;

export const mapData = (modelPath: string): Plugin => ({
  name: "archinaut-map-data",
  resolveId: (id) => (id === moduleId ? resolvedId : null),
  load(id) {
    if (id !== resolvedId) {
      return null;
    }
    this.addWatchFile(modelPath);
    const model = JSON.parse(
      readFileSync(modelPath, "utf8"),
    ) as ArchitectureModel;
    return `export default ${JSON.stringify(compactModel(model))};`;
  },
});
