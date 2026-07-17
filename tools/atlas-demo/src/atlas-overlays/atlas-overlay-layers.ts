/** Deck.gl layers for the analytic contour and bundled-flow overlays. */

import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";

import { bundleAtlasFlows, type AtlasFlowPath } from "./atlas-overlay-data";

import type {
  AtlasContour,
  DecodedAtlasContours,
  DecodedAtlasFlows,
} from "../atlas-client";

/** Cool contour stroke sitting between the density field and the stars. */
const contourColor = [126, 165, 205] as const;
/** Warm additive ribbon tint so flows read against the blue field. */
const flowColor = [255, 196, 110] as const;

interface ContourPath {
  readonly contour: AtlasContour;
  readonly path: Float32Array;
}

const closedRing = (contour: AtlasContour): Float32Array => {
  const closed = new Float32Array(contour.positions.length + 2);
  closed.set(contour.positions);
  closed[contour.positions.length] = contour.positions[0] ?? 0;
  closed[contour.positions.length + 1] = contour.positions[1] ?? 0;
  return closed;
};

/**
 * Builds the nested density-contour outline layer.
 *
 * Stroke opacity follows each leaf's persistence share of its birth
 * density, so prominent basins read stronger than shallow wrinkles while
 * every ring remains a direct plot of the delivered polygon.
 */
export const createAtlasContourLayer = (
  contours: DecodedAtlasContours,
): Layer => {
  const data: ContourPath[] = contours.contours.map((contour) => ({
    contour,
    path: closedRing(contour),
  }));

  return new PathLayer<ContourPath>({
    id: "atlas-contours",
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data,
    getColor: ({ contour }) => {
      const share =
        contour.birth > 0 ? (contour.birth - contour.death) / contour.birth : 0;
      return [
        contourColor[0],
        contourColor[1],
        contourColor[2],
        Math.round(70 + 110 * Math.min(Math.max(share, 0), 1)),
      ];
    },
    getPath: ({ path }) => path,
    getWidth: 1,
    jointRounded: true,
    pickable: false,
    positionFormat: "XY",
    widthMinPixels: 1,
    widthMaxPixels: 1.5,
    widthUnits: "pixels",
  });
};

/**
 * Builds the additively blended hierarchical edge-bundling layer.
 *
 * Each ribbon's intensity and width grow with the log of its aggregated
 * semantic weight, and overlapping ribbons accumulate light exactly like
 * the starfield, so bright trunks indicate genuinely heavy semantic traffic
 * between density basins.
 */
export const createAtlasFlowLayer = (flows: DecodedAtlasFlows): Layer => {
  const paths = bundleAtlasFlows(flows);
  const maximumWeight = paths.reduce(
    (maximum, { weight }) => Math.max(maximum, weight),
    0,
  );

  return new PathLayer<AtlasFlowPath>({
    id: "atlas-flows",
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data: paths,
    getColor: ({ weight }) => {
      const share = maximumWeight > 0 ? weight / maximumWeight : 0;
      return [
        flowColor[0],
        flowColor[1],
        flowColor[2],
        Math.round(28 + 132 * Math.sqrt(share)),
      ];
    },
    getPath: ({ path }) => path,
    getWidth: ({ weight }) => 1 + Math.log2(1 + weight) * 0.35,
    jointRounded: true,
    parameters: {
      blendColorOperation: "add",
      blendColorSrcFactor: "src-alpha",
      blendColorDstFactor: "one",
      blendAlphaOperation: "add",
      blendAlphaSrcFactor: "one",
      blendAlphaDstFactor: "one",
      depthCompare: "always",
      depthWriteEnabled: false,
    },
    pickable: false,
    positionFormat: "XY",
    widthMinPixels: 0.75,
    widthMaxPixels: 4,
    widthUnits: "pixels",
  });
};
