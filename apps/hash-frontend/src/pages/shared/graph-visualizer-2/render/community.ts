/**
 * Community-force metaball isocontours: one per Louvain community, drawn
 * behind dots/edges. Gathers each kept community's node centres from the
 * SAB, then bins every kernel into per-cell instances (`bubble-grid.ts`)
 * whose texel ranges the SDF shader sums and thresholds.
 *
 * Connectivity: a community's members can sit in clumps farther apart than
 * the metaball reach, which would render one community as several bubble
 * islands. `bubble-corridors.ts` plans thin capsule corridors along a
 * deterministic MST over each community's members (BubbleSets' virtual
 * edges); the packer copies their endpoint pairs into the same positions
 * texture, so the shader's field (and therefore the iso-contour) is
 * connected per community. Corridor topology is replanned only when members
 * drift (movement-gated); endpoint positions track the live gather each
 * frame via the pack.
 *
 * The per-community index list is cached by `communities` array identity
 * ({@link groupingCache}); a settling frame skips the regroup and only
 * re-gathers moved node centres plus re-packs the grid.
 */

import { communityColorForId } from "../visual-style";
import {
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";
import { BitSet } from "../worker/collections/bitset";
import { planBubbleCorridors } from "./bubble-corridors";
import { BubbleCellPacker, BUBBLE_TEX_WIDTH } from "./bubble-grid";
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
/** Promote only non-trivial communities; a pair/singleton needs no hull, and
 * bubbling every one (most of a mostly-disconnected graph) is what turns the
 * canvas to mud. Tunable. */
const MIN_COMMUNITY_SIZE = 4;
/** Replan a community's corridors once any member drifts this far (world
 * units) from where its plan was made. Endpoints track live positions every
 * frame regardless; this only refreshes the MST/obstacle topology. */
const CORRIDOR_REPLAN_DISPLACEMENT = 24;

/**
 * Stable grouping for one Louvain result. Changes only when Louvain reruns;
 * cached by array identity and reused across position frames while settling.
 */
interface CommunityGrouping {
  /** Kept communities' node SAB indices, laid out community-by-community in gather order. */
  readonly memberIndices: Int32Array;
  /** Per kept community: `[offset, count]` into {@link memberIndices} / {@link pointTexels}. */
  readonly ranges: Float32Array;
  /** Per kept community: its Louvain community id (corridor obstacle tests). */
  readonly communityIds: Int32Array;
  /** Per kept community RGBA (community id → colour). Constant for the grouping's life. */
  readonly colors: Uint8Array;
  readonly keptCount: number;
  /** CPU-side canonical member positions (texel stride 4), refilled from the
   * SAB each frame. The corridor planner reads it; the GPU never sees it;
   * the packer copies kernels into the per-cell texture instead. */
  readonly pointTexels: Float32Array;
  /** Bins kernels into per-cell instances every frame (owns all scratch). */
  readonly cellPacker: BubbleCellPacker;

  // Corridor plan: see planBubbleCorridors in bubble-corridors.ts.
  /** Per segment `[slotA, slotB]` point-texel slots; capacity 2 · (k - 1) per community. */
  readonly segmentSlots: Int32Array;
  /** Per segment capsule radius (world units). */
  readonly segmentRadius: Float32Array;
  /** Per kept community: live segment count. */
  readonly segmentCount: Int32Array;
  /** Per kept community: first segment-storage index (fixed disjoint regions). */
  readonly segmentStorageOffsets: Int32Array;
  /** Member positions at each community's last corridor plan (2 floats/slot). */
  readonly planSnapshot: Float32Array;
  /** Per kept community: replan request scratch (movement-gated). */
  readonly replanScratch: BitSet<number>;
  /** False until the first plan has run (plan everything once). */
  planned: boolean;
  /** True once the settled-frame replan has run (reset if the layout resumes). */
  settledPlanned: boolean;
  /** Bumped on each re-pack to trigger an in-place texture re-upload. */
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

  // Corridor capacity: an MST has k - 1 edges, each emitting ≤ 2 segments
  // (reroute split).
  const totalSegmentCapacity = kept.reduce(
    (sum, [, members]) => sum + Math.max(0, members.length - 1) * 2,
    0,
  );

  const memberIndices = new Int32Array(totalNodes);
  const ranges = new Float32Array(kept.length * 2);
  const communityIds = new Int32Array(kept.length);
  const colors = new Uint8Array(kept.length * 4);
  const segmentStorageOffsets = new Int32Array(kept.length);

  let offset = 0;
  let segmentStorage = 0;
  for (let ci = 0; ci < kept.length; ci++) {
    const [community, members] = kept[ci]!;
    ranges[ci * 2] = offset;
    ranges[ci * 2 + 1] = members.length;
    communityIds[ci] = community;

    segmentStorageOffsets[ci] = segmentStorage;
    segmentStorage += Math.max(0, members.length - 1) * 2;

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
    pointTexels: new Float32Array(totalNodes * 4),
    cellPacker: new BubbleCellPacker(),
    segmentSlots: new Int32Array(totalSegmentCapacity * 2),
    segmentRadius: new Float32Array(totalSegmentCapacity),
    segmentCount: new Int32Array(kept.length),
    segmentStorageOffsets,
    planSnapshot: new Float32Array(totalNodes * 2),
    replanScratch: BitSet.empty(kept.length),
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
 * replan from the settled coordinates, so the resting corridor topology is a
 * pure function of the deterministic layout, not of which animation frames
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
    keptCount,
    pointTexels,
    planSnapshot,
    replanScratch,
  } = grouping;

  // Re-gather node centres in place. The same pass movement-gates the
  // corridor replan: any member drifting beyond the threshold from its
  // plan-time position marks its community.
  const replanDistSq =
    CORRIDOR_REPLAN_DISPLACEMENT * CORRIDOR_REPLAN_DISPLACEMENT;

  // The settled frame replans all communities once from the final coordinates
  // (deterministic resting topology); a resumed layout re-arms the flag.
  const settledReplan = settled && !grouping.settledPlanned;
  grouping.settledPlanned = settled;

  let needsPlan = !grouping.planned || settledReplan;
  replanScratch.clear();

  for (let ci = 0; ci < keptCount; ci++) {
    const start = ranges[ci * 2]!;
    const memberCount = ranges[ci * 2 + 1]!;
    let drifted = false;

    for (let member = 0; member < memberCount; member++) {
      const slot = start + member;
      const idx = memberIndices[slot]!;
      const posX = floats[headerFloats + idx * recordFloats] ?? 0;
      const posY = floats[headerFloats + idx * recordFloats + 1] ?? 0;
      pointTexels[slot * 4] = posX;
      pointTexels[slot * 4 + 1] = posY;

      if (!drifted) {
        const dx = posX - planSnapshot[slot * 2]!;
        const dy = posY - planSnapshot[slot * 2 + 1]!;
        drifted = dx * dx + dy * dy > replanDistSq;
      }
    }

    if (!grouping.planned || settledReplan || drifted) {
      replanScratch.add(ci);
    }
    needsPlan ||= drifted;
  }

  if (needsPlan) {
    planBubbleCorridors({
      keptCount,
      ranges,
      communityIds: grouping.communityIds,
      pointTexels,
      replan: grouping.planned ? replanScratch : null,
      floats,
      headerFloats,
      recordFloats,
      membership,
      nodeCount: graph.count,
      segmentSlots: grouping.segmentSlots,
      segmentRadius: grouping.segmentRadius,
      segmentCounts: grouping.segmentCount,
      segmentStorageOffsets: grouping.segmentStorageOffsets,
    });

    for (let ci = 0; ci < keptCount; ci++) {
      if (!grouping.planned || replanScratch.has(ci)) {
        const start = ranges[ci * 2]!;
        const memberCount = ranges[ci * 2 + 1]!;

        for (let member = 0; member < memberCount; member++) {
          const slot = start + member;
          planSnapshot[slot * 2] = pointTexels[slot * 4]!;
          planSnapshot[slot * 2 + 1] = pointTexels[slot * 4 + 1]!;
        }
      }
    }

    grouping.planned = true;
  }

  // Bin every kernel (fresh member positions + live corridor endpoints) into
  // per-cell instances; corridors track the animation because the pack reads
  // endpoint positions straight from the point texels gathered above.
  const packed = grouping.cellPacker.pack({
    keptCount,
    ranges,
    pointTexels,
    colors: grouping.colors,
    segmentSlots: grouping.segmentSlots,
    segmentRadius: grouping.segmentRadius,
    segmentCounts: grouping.segmentCount,
    segmentStorageOffsets: grouping.segmentStorageOffsets,
    fieldRadius: FLAT_BUBBLE_FIELD_RADIUS,
  });
  grouping.version += 1;

  return [
    new BubbleSetSDFLayer({
      id: "flat-bubbles",
      data: {
        length: packed.cellCount,
        attributes: {
          getBounds: { value: packed.bounds, size: 4 },
          getColor: { value: packed.colors, size: 4 },
          getNodeRange: { value: packed.nodeRanges, size: 2 },
          getSegmentRange: { value: packed.segmentRanges, size: 2 },
        },
      },
      positions: packed.texels,
      positionsVersion: grouping.version,
      texWidth: BUBBLE_TEX_WIDTH,
      texHeight: packed.texHeight,
      fieldRadius: FLAT_BUBBLE_FIELD_RADIUS,
      isoThreshold: 0.58,
      // A backdrop must not write depth, or its bounding quad stamps the depth buffer and the
      // coplanar edges drawn after it (the flat tier draws bubbles first) fail the depth test and
      // vanish. Set at the layer level so deck's render pass honours it -- the Model parameter
      // alone is overridden by the pass defaults.
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
  ];
}
