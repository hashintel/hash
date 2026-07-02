import { communityColorForId } from "../visual-style";
import {
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";
/**
 * Community-force metaball isocontours: one per Louvain community, drawn
 * behind dots/edges. Gathers each kept community's node centres from the
 * SAB into a positions texture; the SDF shader sums and thresholds the field.
 *
 * The per-community index list is cached by `communities` array identity
 * ({@link groupingCache}); a settling frame skips the regroup and only
 * re-gathers moved node centres plus recomputes bounding boxes.
 */
import {
  BubbleSetSDFLayer,
  MAX_NODES_PER_COMMUNITY,
} from "./gpu/bubble-set-sdf-layer";

import type { RenderFlatGraph } from "../frames";
import type { ClusterId } from "../ids";
import type { ClusterReference } from "./worker-connection";
import type { Layer } from "@deck.gl/core";

/** Metaball field radius (world units): wide enough that a community's
 * neighbouring nodes' fields merge into one blob. Tune visually. */
const FLAT_BUBBLE_FIELD_RADIUS = 50;
/** Only PROMOTE non-trivial communities — a pair/singleton needs no hull, and
 * bubbling every one (most of a mostly-disconnected graph) is what turns the
 * canvas to mud. Tunable. */
const MIN_COMMUNITY_SIZE = 4;
/** Width of the positions texture the metaball shader samples (rows wrap). */
const BUBBLE_TEX_WIDTH = 256;

/**
 * Stable grouping for one Louvain result. Changes only when Louvain reruns;
 * cached by array identity and reused across position frames while settling.
 */
interface CommunityGrouping {
  /** Kept communities' node SAB indices, laid out community-by-community in gather order. */
  readonly memberIndices: Int32Array;
  /** Per kept community: `[offset, count]` into {@link memberIndices} / the positions texture. */
  readonly ranges: Float32Array;
  /** Per kept community RGBA (community id → colour). Constant for the grouping's life. */
  readonly colors: Uint8Array;
  readonly keptCount: number;
  readonly texWidth: number;
  readonly texHeight: number;
  /** Node-centre texture data, refilled from the SAB each frame. */
  readonly positions: Float32Array;
  /** Per kept community `[minX, minY, maxX, maxY]`, refilled each frame. */
  readonly bounds: Float32Array;
  /** Bumped on each refill to trigger an in-place texture re-upload. */
  version: number;
}

const groupingCache = new WeakMap<Int32Array, CommunityGrouping>();

/** Build the stable grouping for a Louvain membership array, or null if no community is big enough. */
function buildGrouping(
  membership: Int32Array,
  count: number,
): CommunityGrouping | null {
  const byCommunity = new Map<number, number[]>();
  for (let idx = 0; idx < count; idx++) {
    const community = membership[idx] ?? -1;
    if (community < 0) {
      continue;
    }
    const members = byCommunity.get(community);
    if (members) {
      members.push(idx);
    } else {
      byCommunity.set(community, [idx]);
    }
  }
  const kept = [...byCommunity.entries()]
    .filter(([, members]) => members.length >= MIN_COMMUNITY_SIZE)
    .map(([community, members]) => {
      // The shader sums at most MAX_NODES_PER_COMMUNITY centres per hull.
      // Downsample evenly across the member list (not first-N arrival order)
      // so an oversized community keeps its overall footprint; the metaball
      // field radius papers over the thinned interior.
      if (members.length <= MAX_NODES_PER_COMMUNITY) {
        return [community, members] as const;
      }
      const step = members.length / MAX_NODES_PER_COMMUNITY;
      const sampled: number[] = [];
      for (let pick = 0; pick < MAX_NODES_PER_COMMUNITY; pick++) {
        sampled.push(members[Math.floor(pick * step)]!);
      }
      return [community, sampled] as const;
    });
  if (kept.length === 0) {
    return null;
  }

  const totalNodes = kept.reduce((sum, [, members]) => sum + members.length, 0);
  const texHeight = Math.max(1, Math.ceil(totalNodes / BUBBLE_TEX_WIDTH));
  const memberIndices = new Int32Array(totalNodes);
  const ranges = new Float32Array(kept.length * 2);
  const colors = new Uint8Array(kept.length * 4);

  let offset = 0;
  for (let ci = 0; ci < kept.length; ci++) {
    const [community, members] = kept[ci]!;
    ranges[ci * 2] = offset;
    ranges[ci * 2 + 1] = members.length;
    const [red, green, blue, alpha] = communityColorForId(community);
    colors[ci * 4] = red;
    colors[ci * 4 + 1] = green;
    colors[ci * 4 + 2] = blue;
    colors[ci * 4 + 3] = alpha;
    for (const idx of members) {
      memberIndices[offset] = idx;
      offset += 1;
    }
  }

  return {
    memberIndices,
    ranges,
    colors,
    keptCount: kept.length,
    texWidth: BUBBLE_TEX_WIDTH,
    texHeight,
    positions: new Float32Array(BUBBLE_TEX_WIDTH * texHeight * 2),
    bounds: new Float32Array(kept.length * 4),
    version: 0,
  };
}

/**
 * Build the community bubble-set layer for the current frame. The grouping
 * topology is cached; only node centres and bounding boxes are refreshed.
 */
export function communityLayer(
  graph: RenderFlatGraph,
  clusters: Map<ClusterId, ClusterReference>,
): Layer[] {
  const membership = graph.communities;
  if (!membership) {
    return [];
  }
  const cluster = clusters.get(graph.layoutId);
  if (!cluster) {
    return [];
  }

  let grouping = groupingCache.get(membership);
  if (grouping === undefined) {
    const built = buildGrouping(membership, graph.count);
    if (built === null) {
      return [];
    }
    grouping = built;
    groupingCache.set(membership, grouping);
  }

  const floats = new Float32Array(cluster.versionView.buffer);
  const headerFloats = FLAT_HEADER_BYTES / 4;
  const recordFloats = FLAT_RECORD_BYTES / 4;
  const { memberIndices, ranges, colors, keptCount, positions, bounds } =
    grouping;

  // Re-gather node centres + recompute bounding boxes, both refilled in place.
  // Deck re-uploads the attribute arrays anyway (the `data` object below is
  // fresh each call), so reusing the buffers only saves the allocation churn.
  for (let ci = 0; ci < keptCount; ci++) {
    const start = ranges[ci * 2]!;
    const memberCount = ranges[ci * 2 + 1]!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let member = 0; member < memberCount; member++) {
      const slot = start + member;
      const idx = memberIndices[slot]!;
      const posX = floats[headerFloats + idx * recordFloats] ?? 0;
      const posY = floats[headerFloats + idx * recordFloats + 1] ?? 0;
      positions[slot * 2] = posX;
      positions[slot * 2 + 1] = posY;
      minX = Math.min(minX, posX);
      maxX = Math.max(maxX, posX);
      minY = Math.min(minY, posY);
      maxY = Math.max(maxY, posY);
    }
    bounds[ci * 4] = minX - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 1] = minY - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 2] = maxX + FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 3] = maxY + FLAT_BUBBLE_FIELD_RADIUS;
  }
  grouping.version += 1;

  return [
    new BubbleSetSDFLayer({
      id: "flat-bubbles",
      data: {
        length: keptCount,
        attributes: {
          getBounds: { value: bounds, size: 4 },
          getColor: { value: colors, size: 4 },
          getNodeRange: { value: ranges, size: 2 },
        },
      },
      positions,
      positionsVersion: grouping.version,
      texWidth: grouping.texWidth,
      texHeight: grouping.texHeight,
      fieldRadius: FLAT_BUBBLE_FIELD_RADIUS,
      isoThreshold: 0.58,
      // A backdrop must not write depth, or its bounding quad stamps the depth buffer and the
      // coplanar edges drawn AFTER it (the flat tier draws bubbles first) fail the depth test and
      // vanish. Set at the layer level so deck's render pass honours it -- the Model parameter
      // alone is overridden by the pass defaults.
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
  ];
}
