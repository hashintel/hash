import type { ClusterId, VizMode } from "./ids";
/**
 * Types the rendering layer owns: the payloads the worker sends to the main
 * thread for Deck.gl to consume.
 *
 * The data flow is split by update rate, so that the expensive O(entities) and
 * O(links) work happens only when topology changes, never on a position tick:
 *
 * - {@link StructureFrame}: identities, colors, labels, radii, and edge
 *   topology. Sent ONLY when the visible cut (LOD) changes. Held in a ref on
 *   the main thread; a version counter drives Deck.gl `updateTriggers`.
 *
 * - {@link PositionsFrame}: world positions for the (bounded) set of visible
 *   clusters plus freshly-computed highway/feeder Bezier control points. Sent
 *   on every force-layout tick while the macro layout is unsettled, then it
 *   stops (positions are frozen between cut changes). Cluster geometry is tiny
 *   (bounded by the render budget), so it travels by `postMessage`.
 *
 * - Entity positions: millions-scale, so they never travel by message. They
 *   live in a `SharedArrayBuffer` per open leaf (see `LayoutCreatedMessage`)
 *   and are read directly by the GPU. Entity-incident edges are composed on
 *   the main thread from that same SAB, so dots and their edges cannot tear.
 */
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

export type Color = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

/**
 * A cluster bubble: identity and style. Its world position is delivered
 * separately in the index-aligned {@link PositionsFrame.clusterPositions}, so
 * a bubble can move (force layout settling) without resending its identity.
 */
export interface RenderCluster {
  readonly id: ClusterId;
  readonly color: Color;
  readonly label: string;
  readonly count: number;
  /** World-space radius (from stable packing; constant between cut changes). */
  readonly radius: number;
  /**
   * Nesting depth among open containers. 0 = a leaf/standalone bubble; >0 = an
   * opened container, rendered as a faint outline with its label near the top.
   */
  readonly depth: number;
  /**
   * How many of this cluster's members are frontier (fetched-but-unexpanded)
   * entities; equals {@link count} when every member is frontier.
   */
  readonly frontierCount: number;
  /**
   * The frontier members' EntityIds, set only when every member is frontier
   * ({@link frontierCount} === {@link count}); absent otherwise.
   */
  readonly frontierEntityIds?: readonly EntityId[];
}

/**
 * Describes the individual-entity edges for one open entity-mode leaf. The
 * geometry is composed on the main thread from the leaf's position SAB, so it
 * tracks the dots exactly. Endpoints are LOCAL to the leaf's center; the main
 * thread adds the leaf's world position (see {@link leafClusterIndex}).
 */
export interface RenderEntityLayer {
  /** The leaf cluster id; matches a `LayoutCreatedMessage.clusterId` SAB. */
  readonly layoutId: ClusterId;
  /**
   * Index of this leaf within {@link StructureFrame.clusters} (and therefore
   * within {@link PositionsFrame.clusterPositions}). Used to resolve the
   * leaf's world center, which is the origin for its entities' local coords.
   */
  readonly leafClusterIndex: number;
  readonly count: number;
  /** Uniform entity-dot radius in world units. */
  readonly radius: number;
  readonly color: Color;
  /**
   * Entity-to-entity internal links: interleaved local index pairs
   * `[a0, b0, a1, b1, ...]` into the leaf's position SAB. This is TOPOLOGY (which
   * dots link), unchanged between cut changes; the positions come from the SAB.
   */
  readonly internalEdges: Uint32Array;
  readonly fanOutColor: Color;
}

/**
 * Per open entity-mode leaf, the fan-out feeder endpoints for the CURRENT
 * positions: interleaved `[localIdx, exitLocalX, exitLocalY, ...]`, the exit in
 * the leaf's LOCAL frame. This is POSITIONAL — the exit moves as the leaf's
 * ports re-slot while the macro layout settles — so it rides the
 * {@link PositionsFrame}, NOT the (topology-only) {@link StructureFrame}. The
 * main thread pairs it with the leaf's {@link RenderEntityLayer} (for
 * `leafClusterIndex` + `fanOutColor`) by `layoutId`.
 */
export interface RenderEntityFanOut {
  readonly layoutId: ClusterId;
  readonly fanOut: Float32Array;
}

/**
 * The whole-graph individual-entity view, used by the `flat-force` and
 * `community-force` modes (one regime — see `LAYOUT-MODES.md`). Unlike the
 * hierarchical {@link RenderEntityLayer} (one open leaf, uniform colour/radius),
 * this is the ENTIRE entity set as one graph, each entity coloured by its type
 * (hierarchy-aware) and sized by its degree.
 *
 * ALL per-node GPU data — positions, radii, colours — lives in one SAB (a
 * `FlatGraphBuffer`, delivered via `LayoutCreatedMessage` keyed by {@link
 * layoutId}), so the renderer reads it directly and per-node updates are written
 * in place. Positions are world coords centred on the origin (no leaf offset).
 * This payload therefore carries NO per-node arrays — only the identity + count.
 * Edges are worker-built bezier segments ({@link PositionsFrame.beziers}, one per
 * link, coloured by the link's own type), drawn separately.
 */
export interface RenderFlatGraph {
  /** Matches a {@link "../worker/protocol".LayoutCreatedMessage} clusterId SAB. */
  readonly layoutId: ClusterId;
  /** Live node count (≤ the SAB capacity); how many instances to render. */
  readonly count: number;
  /**
   * Per-node Louvain community id, in SAB record order (`-1` = unassigned). Present
   * only in `community-force` (the `CommunityLayout` exposes it). The BubbleSets
   * layer groups nodes by this and shades each community; the positions it shades
   * come live from the SAB. Changes only on a Louvain (re)run, so it rides the
   * (rare) structure frame rather than streaming.
   */
  readonly communities?: Int32Array;
}

/**
 * A small summary of one rendered highway lane (an aggregated cluster-to-cluster
 * bezier), carried in {@link StructureFrame.highwayLanes} and indexed by the
 * lane's `laneId` (its index in the worker's visual-edge list, which is also the
 * `id` carried on the lane's bezier segments). A clicked highway segment reads
 * its `id`, looks up this summary, and can ask the worker for the full link set.
 *
 * The array is dense over every visual edge (aggregate AND individual), so the
 * index lines up with `laneId`; an individual (non-aggregate) edge gets the
 * placeholder `{ typeId: null, typeLabel: "", count: 0, direction: "both" }`.
 */
export interface HighwayLaneSummary {
  /**
   * The lane's single link type as a VersionedUrl (a lane is single-type by definition), or
   * `null` for a multi-type rollup (the `> maxParallelEdgeTypes` collapse). The main thread
   * resolves the type's icon + title from the closed type schema it already holds.
   */
  readonly typeId: VersionedUrl | null;
  readonly typeLabel: string;
  readonly count: number;
  readonly direction: "forward" | "reverse" | "both";
}

export interface StructureFrame {
  readonly version: number;
  readonly mode: VizMode;
  /**
   * Visible clusters in a STABLE order. {@link PositionsFrame.clusterPositions}
   * is index-aligned with this array until the next structure frame. Empty in
   * the flat tiers (see {@link flatGraph}).
   */
  readonly clusters: readonly RenderCluster[];
  readonly entityLayers: readonly RenderEntityLayer[];
  /**
   * Present in `flat-force` / `community-force`: the whole entity set as one
   * individual-entity graph. Mutually exclusive with {@link clusters} /
   * {@link entityLayers} (which are empty then). Undefined in `hierarchical-lod`.
   */
  readonly flatGraph?: RenderFlatGraph;
  /**
   * Per-lane summaries for the rendered highways, indexed by `laneId` (the
   * lane's index in the worker's visual-edge list). Individual (non-aggregate)
   * visual edges occupy their slot with a placeholder so the index aligns.
   */
  readonly highwayLanes: readonly HighwayLaneSummary[];
}

/**
 * Packed edge segments. Hierarchical highways/feeders feed {@link "./render/gpu/bezier-sdf-layer"}
 * as cubic Beziers; flat-tier lanes use the same packed p0/p3 endpoints with Deck's `LineLayer`.
 * The buffers are parallel: index `i` addresses one segment across all of them. Backing
 * `ArrayBuffer`s are transferred (not copied), so a frame carrying them may be consumed only once.
 */
export interface RenderBezierBuffers {
  /**
   * 8 floats per segment, interleaved:
   * `p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y` (four `vec2`s, stride 32 bytes).
   */
  readonly positions: Float32Array;
  /** 4 bytes per segment: `r, g, b, a` (unsigned, 0..255). */
  readonly colors: Uint8Array;
  /** 1 float per segment: stroke width in common/world units. */
  readonly widths: Float32Array;
  /**
   * 6 floats per segment: two clip circles `(cx, cy, signedRadius)` (stride 24
   * bytes), one per end. Each erases the edge on one side of the circle so it
   * ends flush on a bubble wall; `signedRadius > 0` erases inside, `< 0` outside,
   * `0` = no clip. (See `ClipCircle` in `edge-geometry.ts`.)
   */
  readonly clips: Float32Array;
  /**
   * 1 u32 per segment, identifying what the segment draws so a picked edge can be
   * resolved:
   * - Flat tier link: the EntityIdx of the link entity.
   * - Hierarchical highway/feeder lane: the lane's `laneId` (its index in the
   *   worker's visual-edge list, also the index into
   *   {@link StructureFrame.highwayLanes}). The main thread resolves the full set
   *   of links via a `QUERY_HIGHWAY_LINKS` round-trip.
   * - {@link BEZIER_NO_LINK} when the segment has no resolvable identity.
   */
  readonly ids: Uint32Array;
  readonly segmentCount: number;
}

/** Sentinel `RenderBezierBuffers.ids` value for a segment with no single link (a highway). */
export const BEZIER_NO_LINK = 0xffffffff;

/**
 * A highway label at an edge midpoint: how strongly two clusters are connected.
 * Position moves with the layout, so it rides the positions frame. The main
 * thread culls these by on-screen chord length to avoid clutter.
 */
export interface RenderEdgeLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Degrees (kept upright): rotates the label to ride along its lane. */
  readonly angle: number;
  /**
   * Label size in WORLD/common units, matching the lane it annotates.
   */
  readonly size: number;
  /** World-space lane length, for screen-space culling. */
  readonly chord: number;
}

/**
 * A directional arrowhead riding a rendered aggregate highway lane. The worker emits this beside
 * the Bezier geometry so the main thread does not need to scan edge topology or re-solve routes.
 */
export interface RenderEdgeArrow {
  readonly kind: "lane" | "endpoint";
  readonly x: number;
  readonly y: number;
  /** World-space angle in radians, pointing in the link flow direction. */
  readonly angle: number;
  /** World/common size, derived from the lane width. */
  readonly size: number;
  readonly color: Color;
  /** World-space lane length, for screen-space culling. */
  readonly chord: number;
}

/**
 * High-frequency position update, valid only against the current
 * {@link StructureFrame}. Sent on every tick while the macro layout is
 * unsettled, then it stops. Cluster geometry is bounded by the render budget,
 * so it travels by `postMessage`.
 */
export interface PositionsFrame {
  readonly version: number;
  /** True once every layout (cluster and entity/flat) has settled. */
  readonly settled: boolean;
  /** World positions, index-aligned with {@link StructureFrame.clusters}. */
  readonly clusterPositions: Float32Array;
  /** Freshly-computed highway/feeder geometry for the current positions. */
  readonly beziers: RenderBezierBuffers;
  /** Top connections by count, labelled at their midpoints. */
  readonly edgeLabels: readonly RenderEdgeLabel[];
  /** Direction marks for directed aggregate highway lanes. */
  readonly edgeArrows: readonly RenderEdgeArrow[];
  /** Per open entity-mode leaf, fan-out feeder endpoints (positional). */
  readonly entityFanOut: readonly RenderEntityFanOut[];
}
