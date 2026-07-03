/**
 * Flat-tier entity dots: each node as a scatterplot dot, read directly from
 * the interleaved SAB via stride/offset binary attributes (zero-copy).
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
import type { ClusterReference } from "./frame-connection";
import type { Layer } from "@deck.gl/core";

export function flatDotsLayer(
  graph: RenderFlatGraph,
  clusters: Map<ClusterId, ClusterReference>,
): Layer[] {
  const cluster = clusters.get(graph.layoutId);
  if (!cluster) {
    return [];
  }
  // Zero-copy binary attributes: one SAB view, per-field stride/offset into interleaved records.
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
