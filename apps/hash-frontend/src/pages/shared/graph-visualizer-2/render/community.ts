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
 * CONNECTIVITY: a community's members can sit in clumps farther apart than
 * the metaball reach, which would render one community as several bubble
 * islands. `bubble-corridors.ts` plans thin capsule corridors along a
 * deterministic MST over each community's members (BubbleSets' virtual
 * edges); their endpoint texels ride the same positions texture, so the
 * shader's field — and therefore the iso-contour — is connected per
 * community. Corridor TOPOLOGY is replanned only when members drift
 * (movement-gated); endpoint POSITIONS are refreshed every frame.
 *
 * The per-community index list is cached by `communities` array identity
 * ({@link groupingCache}); a settling frame skips the regroup and only
 * re-gathers moved node centres plus recomputes bounding boxes.
 */
import { planBubbleCorridors } from "./bubble-corridors";
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
/** Replan a community's corridors once any member drifts this far (world
 * units) from where its plan was made. Endpoints track live positions every
 * frame regardless; this only refreshes the MST/obstacle TOPOLOGY. */
const CORRIDOR_REPLAN_DISPLACEMENT = 24;

/**
 * Stable grouping for one Louvain result. Changes only when Louvain reruns;
 * cached by array identity and reused across position frames while settling.
 */
interface CommunityGrouping {
  /** Kept communities' node SAB indices, laid out community-by-community in gather order. */
  readonly memberIndices: Int32Array;
  /** Per kept community: `[offset, count]` into {@link memberIndices} / the positions texture. */
  readonly ranges: Float32Array;
  /** Per kept community: its Louvain community id (corridor obstacle tests). */
  readonly communityIds: Int32Array;
  /** Per kept community RGBA (community id → colour). Constant for the grouping's life. */
  readonly colors: Uint8Array;
  readonly keptCount: number;
  readonly texWidth: number;
  readonly texHeight: number;
  /** Texture data (4 floats per texel): point texels, then corridor-segment
   * texel pairs. Points refilled from the SAB each frame; segment endpoints
   * copied from the point texels each frame. */
  readonly positions: Float32Array;
  /** Per kept community `[minX, minY, maxX, maxY]`, refilled each frame. */
  readonly bounds: Float32Array;

  // --- Corridor plan (see bubble-corridors.ts) ---
  /** First texel of the corridor-segment region (== total point texels). */
  readonly segTexelBase: number;
  /** Per segment `[slotA, slotB]` point-texel slots; capacity 2·(k−1) per community. */
  readonly segSlots: Int32Array;
  /** Per segment capsule radius (world units). */
  readonly segRadius: Float32Array;
  /** Per kept community: live segment count. */
  readonly segCounts: Int32Array;
  /** Per kept community: first segment-storage index (fixed disjoint regions). */
  readonly segStorageOffsets: Int32Array;
  /** Per kept community `[firstSegTexel, segCount]` instance attribute. */
  readonly segRanges: Float32Array;
  /** Member positions at each community's last corridor plan (2 floats/slot). */
  readonly planSnapshot: Float32Array;
  /** Per kept community: replan request scratch (movement-gated). */
  readonly replanScratch: boolean[];
  /** False until the first plan has run (plan everything once). */
  planned: boolean;
  /** True once the settled-frame replan has run (reset if the layout resumes). */
  settledPlanned: boolean;
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
  // Corridor capacity: an MST has k−1 edges, each emitting ≤ 2 segments
  // (reroute split); each segment is 2 texels.
  const totalSegCapacity = kept.reduce(
    (sum, [, members]) => sum + Math.max(0, members.length - 1) * 2,
    0,
  );
  const totalTexels = totalNodes + totalSegCapacity * 2;
  const texHeight = Math.max(1, Math.ceil(totalTexels / BUBBLE_TEX_WIDTH));
  const memberIndices = new Int32Array(totalNodes);
  const ranges = new Float32Array(kept.length * 2);
  const communityIds = new Int32Array(kept.length);
  const colors = new Uint8Array(kept.length * 4);
  const segStorageOffsets = new Int32Array(kept.length);

  let offset = 0;
  let segStorage = 0;
  for (let ci = 0; ci < kept.length; ci++) {
    const [community, members] = kept[ci]!;
    ranges[ci * 2] = offset;
    ranges[ci * 2 + 1] = members.length;
    communityIds[ci] = community;
    segStorageOffsets[ci] = segStorage;
    segStorage += Math.max(0, members.length - 1) * 2;
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
    communityIds,
    colors,
    keptCount: kept.length,
    texWidth: BUBBLE_TEX_WIDTH,
    texHeight,
    positions: new Float32Array(BUBBLE_TEX_WIDTH * texHeight * 4),
    bounds: new Float32Array(kept.length * 4),
    segTexelBase: totalNodes,
    segSlots: new Int32Array(totalSegCapacity * 2),
    segRadius: new Float32Array(totalSegCapacity),
    segCounts: new Int32Array(kept.length),
    segStorageOffsets,
    segRanges: new Float32Array(kept.length * 2),
    planSnapshot: new Float32Array(totalNodes * 2),
    replanScratch: kept.map(() => false),
    planned: false,
    settledPlanned: false,
    version: 0,
  };
}

/**
 * Build the community bubble-set layer for the current frame. The grouping
 * topology is cached; only node centres and bounding boxes are refreshed
 * (plus a movement-gated corridor replan when members drift).
 *
 * `settled` (the positions frame's terminal flag) forces one final corridor
 * replan from the SETTLED coordinates, so the resting corridor topology is a
 * pure function of the deterministic layout — not of which animation frames
 * happened to trip the movement gate along the way.
 */
export function communityLayer(
  graph: RenderFlatGraph,
  clusters: Map<ClusterId, ClusterReference>,
  settled = false,
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
  const {
    memberIndices,
    ranges,
    colors,
    keptCount,
    positions,
    bounds,
    planSnapshot,
    replanScratch,
  } = grouping;

  // Re-gather node centres + recompute bounding boxes, both refilled in place.
  // Deck re-uploads the attribute arrays anyway (the `data` object below is
  // fresh each call), so reusing the buffers only saves the allocation churn.
  // The same pass movement-gates the corridor replan: any member drifting
  // beyond the threshold from its plan-time position marks its community.
  const replanDistSq =
    CORRIDOR_REPLAN_DISPLACEMENT * CORRIDOR_REPLAN_DISPLACEMENT;
  // The settled frame replans EVERYTHING once from the final coordinates
  // (deterministic resting topology); a resumed layout re-arms the flag.
  const settledReplan = settled && !grouping.settledPlanned;
  grouping.settledPlanned = settled;
  let needsPlan = !grouping.planned || settledReplan;
  for (let ci = 0; ci < keptCount; ci++) {
    const start = ranges[ci * 2]!;
    const memberCount = ranges[ci * 2 + 1]!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let drifted = false;
    for (let member = 0; member < memberCount; member++) {
      const slot = start + member;
      const idx = memberIndices[slot]!;
      const posX = floats[headerFloats + idx * recordFloats] ?? 0;
      const posY = floats[headerFloats + idx * recordFloats + 1] ?? 0;
      positions[slot * 4] = posX;
      positions[slot * 4 + 1] = posY;
      minX = Math.min(minX, posX);
      maxX = Math.max(maxX, posX);
      minY = Math.min(minY, posY);
      maxY = Math.max(maxY, posY);
      if (!drifted) {
        const dx = posX - planSnapshot[slot * 2]!;
        const dy = posY - planSnapshot[slot * 2 + 1]!;
        drifted = dx * dx + dy * dy > replanDistSq;
      }
    }
    replanScratch[ci] = !grouping.planned || settledReplan || drifted;
    needsPlan ||= drifted;
    bounds[ci * 4] = minX - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 1] = minY - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 2] = maxX + FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 3] = maxY + FLAT_BUBBLE_FIELD_RADIUS;
  }

  if (needsPlan) {
    planBubbleCorridors({
      keptCount,
      ranges,
      communityIds: grouping.communityIds,
      pointTexels: positions,
      replan: grouping.planned ? replanScratch : null,
      floats,
      headerFloats,
      recordFloats,
      membership,
      nodeCount: graph.count,
      segSlots: grouping.segSlots,
      segRadius: grouping.segRadius,
      segCounts: grouping.segCounts,
      segStorageOffsets: grouping.segStorageOffsets,
    });
    for (let ci = 0; ci < keptCount; ci++) {
      if (!grouping.planned || replanScratch[ci]) {
        const start = ranges[ci * 2]!;
        const memberCount = ranges[ci * 2 + 1]!;
        for (let member = 0; member < memberCount; member++) {
          const slot = start + member;
          planSnapshot[slot * 2] = positions[slot * 4]!;
          planSnapshot[slot * 2 + 1] = positions[slot * 4 + 1]!;
        }
      }
    }
    grouping.planned = true;
  }

  // Refresh corridor-segment texels (endpoints copied from the point texels
  // just gathered, so corridors track the live animation between replans) and
  // the per-community segment ranges.
  for (let ci = 0; ci < keptCount; ci++) {
    const storageStart = grouping.segStorageOffsets[ci]!;
    const segCount = grouping.segCounts[ci]!;
    const firstTexel = grouping.segTexelBase + storageStart * 2;
    grouping.segRanges[ci * 2] = firstTexel;
    grouping.segRanges[ci * 2 + 1] = segCount;
    for (let seg = 0; seg < segCount; seg++) {
      const storage = storageStart + seg;
      const slotA = grouping.segSlots[storage * 2]!;
      const slotB = grouping.segSlots[storage * 2 + 1]!;
      const texel = (grouping.segTexelBase + storage * 2) * 4;
      positions[texel] = positions[slotA * 4]!;
      positions[texel + 1] = positions[slotA * 4 + 1]!;
      positions[texel + 2] = grouping.segRadius[storage]!;
      positions[texel + 4] = positions[slotB * 4]!;
      positions[texel + 5] = positions[slotB * 4 + 1]!;
    }
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
          getSegRange: { value: grouping.segRanges, size: 2 },
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
