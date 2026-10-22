/**
 * What the map needs from the architecture model, and nothing it does not:
 * the file lists and the per-edge examples are most of `architecture.json`
 * and the map never shows them. The site's Vite plugin runs `compactModel`
 * once at build time and serves the result as `virtual:archinaut-map`.
 */

import type {
  ArchitectureModel,
  Audience,
  ExternalNode,
  InterfaceNode,
} from "../../../../src/model.ts";

export interface MapLayer {
  id: string;
  name: string;
  parent: string | null;
  package: string;
  role: string;
  fileCount: number;
  lineCount: number;
  tags: string[];
  audience: Audience[];
}

export type MapEdge =
  | { kind: "imports"; from: string; to: string; weight: number }
  | { kind: "declared"; from: string; to: string; protocol: string };

export interface MapTag {
  id: string;
  description: string;
}

export interface MapModel {
  layers: MapLayer[];
  interfaces: InterfaceNode[];
  externals: ExternalNode[];
  tags: MapTag[];
  edges: MapEdge[];
}

export const compactModel = (model: ArchitectureModel): MapModel => ({
  layers: model.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    parent: layer.parent,
    package: layer.package,
    role: layer.role,
    fileCount: layer.fileCount,
    lineCount: layer.lineCount,
    tags: layer.tags,
    audience: layer.audience,
  })),
  interfaces: model.interfaces,
  externals: model.externals,
  tags: model.tags,
  edges: model.edges.map((edge) =>
    edge.provenance === "imports"
      ? {
          kind: "imports",
          from: edge.from,
          to: edge.to,
          weight: edge.fileDependencies,
        }
      : {
          kind: "declared",
          from: edge.from,
          to: edge.to,
          protocol: edge.protocol,
        },
  ),
});
