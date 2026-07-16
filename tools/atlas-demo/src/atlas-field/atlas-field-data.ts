/**
 * CPU preparation for the GPU field pass.
 *
 * Active frontier cells are disjoint, so a repeated generation row indicates
 * a frontier bug and is rejected instead of silently adding duplicate mass.
 */

import { atlasTileKey } from "../atlas-client";

import type { WeightedAtlasTile } from "../atlas-frontier";

/** Packed instance attributes consumed by the additive splat model. */
export interface PackedAtlasField {
  readonly instanceCount: number;
  readonly masses: Float32Array;
  readonly positions: Float32Array;
  readonly tileZooms: Float32Array;
}

/** Percentile-derived controls for the terrain composite shader. */
export interface AtlasFieldNormalization {
  readonly floor: number;
  readonly reliefNorm: number;
}

/** Packs active representatives into stable, tightly packed GPU attributes. */
export const packAtlasField = (
  activeTiles: readonly WeightedAtlasTile[],
): PackedAtlasField => {
  const instanceCount = activeTiles.reduce(
    (total, weightedTile) => total + weightedTile.tile.deliveredCount,
    0,
  );
  const positions = new Float32Array(instanceCount * 2);
  const masses = new Float32Array(instanceCount);
  const tileZooms = new Float32Array(instanceCount);
  const seenRows = new Set<number>();
  let outputIndex = 0;

  for (const weightedTile of activeTiles) {
    const { tile } = weightedTile;
    for (
      let pointIndex = 0;
      pointIndex < tile.deliveredCount;
      pointIndex += 1
    ) {
      const rowId = tile.rowIds[pointIndex];
      const pointX = tile.positions[pointIndex * 2];
      const pointY = tile.positions[pointIndex * 2 + 1];
      if (rowId === undefined || pointX === undefined || pointY === undefined) {
        throw new Error(
          `Tile ${atlasTileKey(tile.coordinate)} has incomplete decoded arrays`,
        );
      }
      if (seenRows.has(rowId)) {
        throw new Error(`Active frontier repeats generation row ${rowId}`);
      }

      seenRows.add(rowId);
      positions[outputIndex * 2] = pointX + 0.5;
      positions[outputIndex * 2 + 1] = pointY + 0.5;
      masses[outputIndex] = weightedTile.massPerPoint;
      tileZooms[outputIndex] = tile.coordinate.z;
      outputIndex += 1;
    }
  }

  return { instanceCount, masses, positions, tileZooms };
};

const percentile = (sorted: readonly number[], rank: number): number => {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * rank)),
  );
  return sorted[index] ?? 0;
};

/**
 * Derives stable sea level and logarithmic relief scale from RGBA readback.
 *
 * The input is the downsample target, with total field mass in every fourth
 * value. Empty samples are excluded so void area does not force sea level to
 * zero.
 */
export const deriveAtlasFieldNormalization = (
  rgbaSamples: Float32Array,
): AtlasFieldNormalization => {
  const positive: number[] = [];
  for (let index = 0; index < rgbaSamples.length; index += 4) {
    const sample = rgbaSamples[index];
    if (sample !== undefined && Number.isFinite(sample) && sample > 0) {
      positive.push(sample);
    }
  }
  if (positive.length === 0) {
    return { floor: 0.001, reliefNorm: 1 };
  }

  positive.sort((left, right) => left - right);
  const floor = Math.max(percentile(positive, 0.2) * 0.5, 0.000_1);
  const high = Math.max(percentile(positive, 0.98), floor);
  return {
    floor,
    reliefNorm: Math.max(Math.log(high / floor), 1),
  };
};
