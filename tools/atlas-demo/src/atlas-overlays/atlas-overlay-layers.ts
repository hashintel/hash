/** Deck.gl layers for the analytic contour and bundled-flow overlays. */

import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";

import type {
  AtlasContour,
  DecodedAtlasContours,
  DecodedAtlasFlows,
} from "../atlas-client";
import type { AtlasFlowPath } from "./atlas-overlay-data";

/** Cool contour stroke sitting between the density field and the stars. */
const contourColor = [126, 165, 205] as const;
/** Warm additive ribbon tint so flows read against the blue field. */
const flowColor = [255, 196, 110] as const;
/** Alpha of ribbons outside the focused region; zero hides them outright. */
const ghostFlowAlpha = 0;

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
 * between density basins. When `focusRegion` is set, only ribbons touching
 * that region remain visible; the rest are hidden entirely so the focused
 * subset stands alone.
 */
export const createAtlasFlowLayer = (
  paths: readonly AtlasFlowPath[],
  focusRegion?: number,
): Layer => {
  const maximumWeight = paths.reduce(
    (maximum, { weight }) => Math.max(maximum, weight),
    0,
  );
  const inFocus = (flow: AtlasFlowPath): boolean =>
    focusRegion === undefined ||
    flow.source === focusRegion ||
    flow.target === focusRegion;

  return new PathLayer<AtlasFlowPath>({
    id: "atlas-flows",
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data: paths as AtlasFlowPath[],
    getColor: (flow) => {
      const share = maximumWeight > 0 ? flow.weight / maximumWeight : 0;
      const alpha = Math.round(28 + 132 * Math.sqrt(share));
      return [
        flowColor[0],
        flowColor[1],
        flowColor[2],
        inFocus(flow) ? alpha : Math.min(alpha, ghostFlowAlpha),
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
    updateTriggers: {
      getColor: [focusRegion],
    },
    widthMinPixels: 0.75,
    widthMaxPixels: 4,
    widthUnits: "pixels",
  });
};

interface RegionPeakDatum {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Marks every watershed region peak as a small ring.
 *
 * The rings are the hover affordance for flow focus: each marks the exact
 * world position the nearest-peak search measures against, and the focused
 * ring brightens so the active filter is visible even before its ribbons
 * separate from the ghosted rest.
 */
export const createAtlasRegionPeakLayer = (
  flows: DecodedAtlasFlows,
  focusRegion?: number,
): Layer => {
  const data: RegionPeakDatum[] = flows.regions.map((region, index) => ({
    index,
    x: region.x,
    y: region.y,
  }));

  return new ScatterplotLayer<RegionPeakDatum>({
    id: "atlas-region-peaks",
    antialiasing: true,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data,
    filled: false,
    getLineColor: ({ index }) =>
      index === focusRegion
        ? [flowColor[0], flowColor[1], flowColor[2], 235]
        : [contourColor[0], contourColor[1], contourColor[2], 88],
    getLineWidth: ({ index }) => (index === focusRegion ? 1.6 : 1),
    getPosition: ({ x, y }) => [x, y],
    getRadius: ({ index }) => (index === focusRegion ? 7 : 4.5),
    lineWidthUnits: "pixels",
    pickable: false,
    radiusUnits: "pixels",
    stroked: true,
    updateTriggers: {
      getLineColor: [focusRegion],
      getLineWidth: [focusRegion],
      getRadius: [focusRegion],
    },
  });
};
