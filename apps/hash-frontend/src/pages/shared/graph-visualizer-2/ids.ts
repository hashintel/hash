import { Branded as make } from "./brand";

/**
 * Branded primitive types and domain unions specific to the visualization.
 *
 * Types that already exist in the ecosystem (EntityId, VersionedUrl, LinkData)
 * are imported from @blockprotocol/type-system. This file defines only the
 * concepts that are unique to the graph visualizer.
 */
import type { Branded } from "./brand";

export type EntityIdx = Branded<number, "EntityIdx">;
export const EntityIdx = make<EntityIdx>();

export type LinkIdx = Branded<number, "LinkIdx">;
export const LinkIdx = make<LinkIdx>();

export type TypeIdx = Branded<number, "TypeIdx">;
export const TypeIdx = make<TypeIdx>();

/** Sorted, comma-joined TypeIdx values. Canonical grouping key. */
export type TypeSetKey = Branded<string, "TypeSetKey">;
export const TypeSetKey = make<TypeSetKey>();

export type TypeSetIdx = Branded<number, "TypeSetIdx">;
export const TypeSetIdx = make<TypeSetIdx>();

export type ClusterId = Branded<string, "ClusterId">;
export const ClusterId = make<ClusterId>();

/** Canonical key for a pair of connected clusters (lexicographic order). */
export type PairKey = Branded<string, "PairKey">;
export const PairKey = make<PairKey>();

/** Stable semantic identity for a visual edge (survives LOD transitions). */
export type VisualEdgeKey = Branded<string, "VisualEdgeKey">;
export const VisualEdgeKey = make<VisualEdgeKey>();

export type VizMode = "flat-force" | "community-force" | "hierarchical-lod";

export type LodMode = "cluster" | "children" | "entities-pending" | "entities";

export type ClusterKind =
  | "root"
  | "family"
  | "type-set"
  | "other"
  | "community"
  | "embedding"
  | "entity-bucket";
