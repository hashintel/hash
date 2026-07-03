/**
 * The connection surface the {@link "../scene"} render pipeline drives,
 * parameterized over node identity so both worker lifecycles plug in:
 * `EntityWorkerConnection` implements `SceneHandle<EntityId>`,
 * `TypeWorkerConnection` implements `SceneHandle<VersionedUrl>`.
 *
 * Two identity currencies, deliberately distinct:
 * - `NodeId` (branded string) is the domain identity the host UI speaks --
 *   hover cards, labels, icons, selection payloads.
 * - node keys (plain `number` here; `EntityIndex` / `TypeId` inside the
 *   connections) are the u32 join keys stored in the flat buffer records and
 *   the highlight/ego wire currency. The scene never manufactures keys, it
 *   only passes values from one handle method into another, so the interface
 *   deliberately un-brands them.
 */
import type { ClusterId } from "../../ids";
import type { FrameHandle } from "../frame-connection";

/**
 * A flat-tier edge pick, resolved by the connection from the bezier segment's
 * id channel:
 * - entity lifecycle: a link IS an entity, so the pick is a `node` (the link
 *   entity's card shows, exactly like a dot pick);
 * - type lifecycle: an edge is a link *type* between two type nodes, so the
 *   pick carries the triple for an edge hover card.
 */
export type FlatEdgePick<NodeId extends string> =
  | { readonly kind: "node"; readonly nodeId: NodeId }
  | {
      readonly kind: "edge";
      readonly source: NodeId;
      readonly target: NodeId;
      readonly linkType: NodeId;
    };

/** A node's neighbourhood, in scene currency (reply to {@link SceneHandle.queryEgo}). */
export interface NodeEgo {
  /** Join keys of visible node neighbours (kept at full colour by the highlight). */
  readonly nodeKeys: readonly number[];
  /** Collapsed-cluster neighbours (hierarchical entity tier only; ringed, not opened). */
  readonly clusterIds: readonly ClusterId[];
}

/** The scene-facing handle surface both worker connections implement. */
export interface SceneHandle<NodeId extends string> extends FrameHandle {
  /** Resolve a picked dot (layout + render index) to its domain node id. */
  resolveNodeId(layoutId: ClusterId, recordIndex: number): NodeId | undefined;
  /** The u32 join key at a record (the highlight/ego currency). */
  nodeKeyAt(layoutId: ClusterId, recordIndex: number): number | undefined;
  /** Decode a join key back to its domain node id. */
  nodeKeyToId(nodeKey: number): NodeId | undefined;
  /** Resolve a flat-tier edge pick (its bezier id) to a node or edge target. */
  resolveFlatEdge(edgeId: number): FlatEdgePick<NodeId> | null;
  /** A selected node's neighbourhood (visible node keys + collapsed clusters). */
  queryEgo(nodeKey: number): Promise<NodeEgo>;
  /** Keys kept at full colour; everything else dims. Empty restores full colour. */
  setHighlight(nodeKeys: readonly number[]): void;
  /**
   * Pin a hierarchical leaf open (with ancestors) regardless of zoom, or null
   * to clear. No-op for lifecycles without a hierarchical tier.
   */
  setPinned(clusterId: ClusterId | null): void;
  /**
   * The node keys of the links a highway lane aggregates (hierarchical entity
   * tier only; other lifecycles resolve empty).
   */
  queryHighwayLinks(laneId: number): Promise<readonly number[]>;
}
