import type { Position } from "../../geometry";
/**
 * The Scene's outward-facing contract, parameterized over node identity (see
 * {@link "./handle"}): the hover/selection/label payloads it reports and the
 * callback set the host React component provides. Everything here is in
 * container-pixel space, ready to position HTML overlays.
 *
 * Hierarchical-tier payloads ({@link HighwayHover}, {@link ClusterHover})
 * stay entity-typed: only the entity lifecycle has that tier, so they never
 * fire for other node identities.
 */
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** A hovered flat-tier node dot: its id and the cursor position in container pixels. */
export interface NodeHover<NodeId extends string> extends Position {
  readonly nodeId: NodeId;
}

/** A hovered aggregated highway: a summary of the links it bundles, at the cursor. */
export interface HighwayHover extends Position {
  /** The lane's single link type used to look up its icon; null for a rollup lane. */
  readonly typeId: VersionedUrl | null;
  readonly typeLabel: string;
  readonly count: number;
  readonly direction: "forward" | "reverse" | "both";
}

/**
 * A hovered wholly-frontier cluster bubble (every member fetched-but-unexpanded): its frontier
 * EntityIds plus the bubble's on-screen geometry, re-emitted as the camera moves / layout settles
 * so an action card can sit at its edge and offer to load it. Null on leave.
 */
export interface ClusterHover extends Position {
  readonly count: number;
  readonly frontierEntityIds: readonly EntityId[];

  /** Bubble on-screen radius (px), so the card can sit just outside its edge. */
  readonly radiusPx: number;
}

/**
 * The selected node: its id and its on-screen position in container pixels, re-emitted as
 * the node settles and the camera moves so a pinned card can follow it.
 */
export interface NodeSelection<NodeId extends string> extends Position {
  readonly nodeId: NodeId;
}

/**
 * An always-on node label to overlay as HTML: the node, its display name, and its current
 * on-screen position (container pixels). Re-emitted each frame so labels track camera motion
 * and layout settling; intended for HTML overlay (viewport-culled), not GPU text.
 */
export interface NodeLabel<NodeId extends string> extends Position {
  readonly nodeId: NodeId;
  readonly text: string;
}

/**
 * A hovered flat-tier edge that is not itself a node (the type lifecycle's
 * link-type edges; see {@link "./handle".FlatEdgePick}), at the cursor.
 */
export interface FlatEdgeHover<NodeId extends string> extends Position {
  readonly source: NodeId;
  readonly target: NodeId;
  readonly linkType: NodeId;
}

export interface SceneCallbacks<NodeId extends string> {
  /** Report the hovered flat-tier node, or null on leave. */
  readonly onNodeHover?: (hover: NodeHover<NodeId> | null) => void;
  /** Report a hovered aggregated highway's summary, or null on leave. */
  readonly onHighwayHover?: (hover: HighwayHover | null) => void;
  /** Report the selected node + its tracked on-screen position, or null when cleared. */
  readonly onNodeSelect?: (selection: NodeSelection<NodeId> | null) => void;
  /** Open a table of the link entities aggregated by a clicked highway (hierarchical tier). */
  readonly onOpenLinkTable?: (linkNodeIds: readonly NodeId[]) => void;
  /** Report a hovered wholly-frontier cluster bubble (offer to load its entities), or null on leave. */
  readonly onClusterHover?: (hover: ClusterHover | null) => void;
  /** Report a hovered non-node flat edge (a type graph's link-type edge), or null on leave. */
  readonly onEdgeHover?: (hover: FlatEdgeHover<NodeId> | null) => void;
  /**
   * Resolve a node's display label for always-on graph labels. Called only while the label
   * eligibility set is (re)built (on zoom or structure change), never per frame.
   */
  readonly resolveNodeLabel?: (nodeId: NodeId) => string | undefined;
  /**
   * Resolve a node's icon to an atlas key (emoji or image URL), or null when none exists.
   * Called only while the icon cache is (re)built on structure change, never per frame.
   */
  readonly resolveNodeIcon?: (nodeId: NodeId) => string | null;
  /**
   * Report the always-on node labels to overlay as HTML, re-emitted each frame with their
   * current on-screen positions (so they track the camera / settle). Empty when none are visible.
   */
  readonly onNodeLabels?: (labels: readonly NodeLabel<NodeId>[]) => void;
  /** Fired once when the first structure frame lands, signalling that the graph is ready to display. */
  readonly onFirstStructure: () => void;
}

/** Entity-lifecycle aliases (the concrete types the entity bridge and overlays speak). */
export type EntityHover = NodeHover<EntityId>;
export type EntitySelection = NodeSelection<EntityId>;
export type EntityLabel = NodeLabel<EntityId>;
