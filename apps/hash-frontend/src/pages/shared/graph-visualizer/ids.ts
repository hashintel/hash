import { Branded as make } from "./brand";

/**
 * Branded primitive types and domain unions specific to the visualization.
 *
 * Types that already exist in the ecosystem (EntityId, VersionedUrl, LinkData)
 * are imported from @blockprotocol/type-system. This file defines only the
 * concepts that are unique to the graph visualizer.
 */
import type { Branded } from "./brand";

export type EntityIndex = Branded<number, "EntityIndex">;
export const EntityIndex = make<EntityIndex>();

/**
 * Force-layout node ids are stringified {@link EntityIndex} values (the layout
 * engines key nodes by string). These two helpers are the only sanctioned
 * conversion in each direction; keep them inverse of one another.
 */
export const nodeIdForEntityIndex = (entityIdx: EntityIndex): string =>
  String(entityIdx);

export const entityIndexFromNodeId = (nodeId: string): EntityIndex =>
  // nodeId is always String(entityIdx) from nodeIdForEntityIndex; Number round-trips
  // safely for layout-sized indices.
  Number(nodeId) as EntityIndex;

export type LinkId = Branded<number, "LinkId">;
export const LinkId = make<LinkId>();

export type TypeId = Branded<number, "TypeId">;
export const TypeId = make<TypeId>();

/**
 * Type-graph force-layout node ids are stringified {@link TypeId} values,
 * mirroring the entity pair above. These two helpers are the only sanctioned
 * conversion in each direction; keep them inverse of one another.
 */
export const nodeIdForTypeId = (typeId: TypeId): string => String(typeId);

export const typeIdFromNodeId = (nodeId: string): TypeId =>
  // nodeId is always String(typeId) from nodeIdForTypeId; Number round-trips
  // safely for registry-sized ids.
  Number(nodeId) as TypeId;

/** Sorted, comma-joined TypeIdx values. Canonical grouping key. */
export type TypeSetKey = Branded<string, "TypeSetKey">;
export const TypeSetKey = make<TypeSetKey>();

export type TypeSetId = Branded<number, "TypeSetId">;
export const TypeSetId = make<TypeSetId>();

export type LabelId = Branded<number, "LabelId">;
export const LabelId = make<LabelId>();

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
