/**
 * Edge rendering: hierarchical edges as GPU SDF beziers, flat edges as
 * LineLayer segments (collinear control points).
 */
import { LineLayer } from "@deck.gl/layers";

import { graphColors } from "../visual-style";
import { BezierSDFLayer } from "./gpu/bezier-sdf-layer";

import type { PositionsFrame, RenderBezierBuffers } from "../frames";
import type { Layer } from "@deck.gl/core";

/** Halo width as a multiple of the core stroke width. */
const EDGE_HALO_WIDTH_FACTOR = 1.65;

function bezierData(
  beziers: RenderBezierBuffers,
  colors: Uint8Array,
): ConstructorParameters<typeof BezierSDFLayer>[0]["data"] {
  return {
    length: beziers.segmentCount,
    attributes: {
      getP0: { value: beziers.positions, size: 2, stride: 32, offset: 0 },
      getP1: { value: beziers.positions, size: 2, stride: 32, offset: 8 },
      getP2: { value: beziers.positions, size: 2, stride: 32, offset: 16 },
      getP3: { value: beziers.positions, size: 2, stride: 32, offset: 24 },
      getColor: { value: colors, size: 4 },
      getWidth: { value: beziers.widths, size: 1 },
      getClipA: { value: beziers.clips, size: 3, stride: 24, offset: 0 },
      getClipB: { value: beziers.clips, size: 3, stride: 24, offset: 12 },
    },
  };
}

function lineData(
  beziers: RenderBezierBuffers,
  colors: Uint8Array,
): ConstructorParameters<typeof LineLayer>[0]["data"] {
  return {
    length: beziers.segmentCount,
    attributes: {
      instanceSourcePositions: {
        value: beziers.positions,
        size: 2,
        stride: 32,
        offset: 0,
      },
      instanceTargetPositions: {
        value: beziers.positions,
        size: 2,
        stride: 32,
        offset: 24,
      },
      instanceColors: { value: colors, size: 4, type: "unorm8" },
      instanceWidths: { value: beziers.widths, size: 1 },
    },
  };
}

export function edgeLayer(positions: PositionsFrame, isFlat: boolean): Layer[] {
  const { beziers } = positions;
  if (beziers.segmentCount === 0) {
    return [];
  }

  const widthScale = 1;
  const parameters = {
    depthWriteEnabled: false,
    depthCompare: "always",
  } as const;

  if (isFlat) {
    return [
      new LineLayer({
        id: "flat-edges",
        data: lineData(beziers, beziers.colors),
        pickable: true,
        widthUnits: "common",
        widthScale,
        parameters,
      }),
    ];
  }

  // Halo + core in one layer: the underlay used to be a second full
  // BezierSDFLayer, which ran the per-fragment curve solve twice over
  // overlapping (wider-padded) quads. The layer's haloWidthFactor folds the
  // wide soft band into the same fragment evaluation.
  return [
    new BezierSDFLayer({
      id: "hierarchical-edges",
      data: bezierData(beziers, beziers.colors),
      pickable: true,
      boundsPaddingPixels: 8,
      widthUnits: "common",
      widthScale,
      haloWidthFactor: EDGE_HALO_WIDTH_FACTOR,
      haloColor: graphColors.edgeUnderlay,
      parameters,
    }),
  ];
}
