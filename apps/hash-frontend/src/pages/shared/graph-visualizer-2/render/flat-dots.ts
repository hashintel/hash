/**
 * The flat-tier (flat-force / community-force) NODE render: every entity as one dot, read
 * STRAIGHT off the interleaved SAB (positions + radii + colours in one buffer). Fresh
 * typed-array views over the shared bytes each render (zero-copy, new identity so Deck
 * re-uploads) with stride/offset onto the record fields; positions are world coords
 * centred on the origin, so there is no transform. Edges are drawn by the bezier layer.
 */
import { ScatterplotLayer } from "@deck.gl/layers";

import {
  FLAT_COLOR_BYTE_OFFSET,
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";

import type { RenderFlatGraph } from "../frames";
import type { ClusterId } from "../ids";
import type { ClusterReference } from "./worker-connection";
import type { Layer } from "@deck.gl/core";

export function flatDotsLayer(
  graph: RenderFlatGraph,
  clusters: Map<ClusterId, ClusterReference>,
): Layer[] {
  const cluster = clusters.get(graph.layoutId);
  if (!cluster) {
    return [];
  }
  // Views over the WHOLE buffer; the stride/offset address each record field.
  const raw = cluster.versionView.buffer;
  const floats = new Float32Array(raw);
  const bytes = new Uint8Array(raw);
  return [
    new ScatterplotLayer({
      id: "flat-entities",
      data: {
        length: graph.count,
        attributes: {
          getPosition: {
            value: floats,
            size: 2,
            stride: FLAT_RECORD_BYTES,
            offset: FLAT_HEADER_BYTES,
          },
          getRadius: {
            value: floats,
            size: 1,
            stride: FLAT_RECORD_BYTES,
            offset: FLAT_HEADER_BYTES + FLAT_RADIUS_BYTE_OFFSET,
          },
          getFillColor: {
            value: bytes,
            size: 4,
            stride: FLAT_RECORD_BYTES,
            offset: FLAT_HEADER_BYTES + FLAT_COLOR_BYTE_OFFSET,
            normalized: true,
          },
        },
      },
      radiusUnits: "common",
      pickable: true,
    }),
  ];
}
