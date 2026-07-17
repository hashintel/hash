/** Crisp row-stable marks rendered above the scalar density field. */

import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";

import { packAtlasMarks, packAtlasStars } from "./atlas-field-data";

import type { WeightedAtlasTile } from "../atlas-frontier";

/**
 * Builds the additive far-field starfield for the active frontier.
 *
 * Every delivered representative renders as one dim point with
 * `src-alpha, one` blending, so overlapping stars accumulate light: dense
 * regions ignite toward white while isolated points stay faint sparks. The
 * result reads as a galaxy far field while remaining a direct plot of
 * delivered points weighted by represented mass.
 */
export const createAtlasStarLayer = (
  activeTiles: readonly WeightedAtlasTile[],
): Layer => {
  const stars = packAtlasStars(activeTiles);

  return new ScatterplotLayer({
    id: "atlas-stars",
    antialiasing: true,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data: {
      length: stars.instanceCount,
      attributes: {
        getFillColor: {
          normalized: true,
          size: 4,
          value: stars.starColors,
        },
        getPosition: {
          size: 2,
          value: stars.positions,
        },
      },
    },
    filled: true,
    getRadius: 0.7,
    opacity: 1,
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
    radiusMaxPixels: 1.6,
    radiusMinPixels: 0.45,
    radiusUnits: "pixels",
    stroked: false,
  });
};

/** Builds the color-ready binary point layer for the active frontier. */
export const createAtlasParticleLayer = (
  activeTiles: readonly WeightedAtlasTile[],
): Layer => {
  const marks = packAtlasMarks(activeTiles);

  return new ScatterplotLayer({
    id: "atlas-particles",
    antialiasing: true,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data: {
      length: marks.instanceCount,
      attributes: {
        getFillColor: {
          normalized: true,
          size: 4,
          value: marks.markColors,
        },
        getPosition: {
          size: 2,
          value: marks.positions,
        },
        getRadius: {
          size: 1,
          value: marks.markRadii,
        },
      },
    },
    filled: true,
    opacity: 1,
    pickable: false,
    radiusMaxPixels: 5,
    radiusMinPixels: 0.5,
    radiusUnits: "pixels",
    stroked: false,
  });
};
