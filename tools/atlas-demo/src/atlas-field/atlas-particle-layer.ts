/** Crisp row-stable marks rendered above the scalar density field. */

import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";

import { packAtlasMarks } from "./atlas-field-data";

import type { WeightedAtlasTile } from "../atlas-frontier";

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
      },
    },
    filled: true,
    getRadius: 0.55,
    opacity: 1,
    pickable: false,
    radiusMaxPixels: 0.8,
    radiusMinPixels: 0.35,
    radiusUnits: "pixels",
    stroked: false,
  });
};
