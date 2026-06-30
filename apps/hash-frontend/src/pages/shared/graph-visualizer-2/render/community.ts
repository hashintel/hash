import { communityColorForId } from "../visual-style";
import {
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";
/**
 * community-force "BubbleSets": one crisp metaball isocontour per Louvain community,
 * drawn behind the dots/edges. Pure layer builder — gathers each kept community's node
 * centres (from the same SAB the dots read) into the {@link BubbleSetSDFLayer}'s positions
 * texture; the shader sums + thresholds the field.
 *
 * PERF TODO (only if this shows up in a profile): this re-gathers the grouped positions
 * texture and recomputes the bbox every frame (O(nodes)). The win is a STABLE per-community
 * index list ([offset, count] into an index buffer of SAB node indices), rebuilt only when
 * communities change (Louvain rerun), with the SDF shader reading SAB positions directly via
 * that index (stride-aware, since the SAB is interleaved); keep the bbox CPU from the index
 * lists (cheap O(nodes) min/max) or move it to a GPU reduction. NOTE: the naive "per-node
 * membership + -1, scan all nodes per pixel" is a REGRESSION (O(N)/pixel) — the index list is
 * the win. Last resort: move the grouping + bbox into the worker and ride the frame.
 */
import { BubbleSetSDFLayer } from "./gpu/bubble-set-sdf-layer";

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
 * Community "BubbleSets" for community-force: ONE crisp metaball isocontour per
 * Louvain community, coloured by community, drawn BEHIND the dots/edges. Builds
 * the per-community instances (bbox + colour + node range) and a positions texture
 * of the kept communities' node centres (gathered from the SAME SAB as the dots);
 * the layer's shader sums + thresholds the field. Only non-trivial communities are
 * promoted ({@link MIN_COMMUNITY_SIZE}). Absent in flat-force (no `communities`).
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
  const floats = new Float32Array(cluster.versionView.buffer);
  const headerFloats = FLAT_HEADER_BYTES / 4;
  const recordFloats = FLAT_RECORD_BYTES / 4;

  // Group node indices by community; keep only the non-trivial ones.
  const byCommunity = new Map<number, number[]>();
  for (let idx = 0; idx < graph.count; idx++) {
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
  const kept = [...byCommunity.entries()].filter(
    ([, members]) => members.length >= MIN_COMMUNITY_SIZE,
  );
  if (kept.length === 0) {
    return [];
  }

  // Per-community node centres → one grouped positions texture; per-community
  // instances (bbox padded by the field radius so the kernel falloff fits, colour,
  // and the [offset, count] range into the texture).
  const totalNodes = kept.reduce((sum, [, members]) => sum + members.length, 0);
  const texHeight = Math.max(1, Math.ceil(totalNodes / BUBBLE_TEX_WIDTH));
  const positions = new Float32Array(BUBBLE_TEX_WIDTH * texHeight * 2);
  const bounds = new Float32Array(kept.length * 4);
  const colors = new Uint8Array(kept.length * 4);
  const ranges = new Float32Array(kept.length * 2);

  let offset = 0;
  for (let ci = 0; ci < kept.length; ci++) {
    const [community, members] = kept[ci]!;
    const start = offset;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const idx of members) {
      const posX = floats[headerFloats + idx * recordFloats] ?? 0;
      const posY = floats[headerFloats + idx * recordFloats + 1] ?? 0;
      positions[offset * 2] = posX;
      positions[offset * 2 + 1] = posY;
      minX = Math.min(minX, posX);
      maxX = Math.max(maxX, posX);
      minY = Math.min(minY, posY);
      maxY = Math.max(maxY, posY);
      offset += 1;
    }
    bounds[ci * 4] = minX - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 1] = minY - FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 2] = maxX + FLAT_BUBBLE_FIELD_RADIUS;
    bounds[ci * 4 + 3] = maxY + FLAT_BUBBLE_FIELD_RADIUS;
    const [red, green, blue, alpha] = communityColorForId(community);
    colors[ci * 4] = red;
    colors[ci * 4 + 1] = green;
    colors[ci * 4 + 2] = blue;
    colors[ci * 4 + 3] = alpha;
    ranges[ci * 2] = start;
    ranges[ci * 2 + 1] = members.length;
  }

  return [
    new BubbleSetSDFLayer({
      id: "flat-bubbles",
      data: {
        length: kept.length,
        attributes: {
          getBounds: { value: bounds, size: 4 },
          getColor: { value: colors, size: 4 },
          getNodeRange: { value: ranges, size: 2 },
        },
      },
      positions,
      texWidth: BUBBLE_TEX_WIDTH,
      texHeight,
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
