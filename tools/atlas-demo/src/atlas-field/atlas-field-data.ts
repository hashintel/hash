/**
 * CPU preparation for the GPU field pass.
 *
 * Active frontier cells are disjoint, so a repeated generation row indicates
 * a frontier bug and is rejected instead of silently adding duplicate mass.
 */

import {
  atlasDeliverySegments,
  atlasFairDeliveryCount,
  atlasTileKey,
} from "../atlas-client";

import type { WeightedAtlasTile } from "../atlas-frontier";

/** Tight world-coordinate extent of the currently delivered representatives. */
export interface AtlasFieldBounds {
  readonly maximumX: number;
  readonly maximumY: number;
  readonly minimumX: number;
  readonly minimumY: number;
}

/** Packed instance attributes consumed by the additive splat model. */
export interface PackedAtlasField {
  readonly instanceCount: number;
  readonly masses: Float32Array;
  readonly positions: Float32Array;
  readonly tileZooms: Float32Array;
}

/** Mass-balanced mark attributes for the crisp particle pass. */
export interface PackedAtlasMarks {
  readonly instanceCount: number;
  readonly markColors: Uint8Array;
  readonly positions: Float32Array;
  readonly rowIds: Uint32Array;
}

/** Optional source for a future per-entity color plane. */
export type AtlasMarkColorAccessor = (
  rowId: number,
) => readonly [number, number, number] | undefined;

/** Positive-density percentile used to expose the color-agnostic glow. */
export interface AtlasFieldExposure {
  readonly densityScale: number;
}

const defaultMarkColor = [190, 194, 196] as const;
const defaultMarkAlpha = 112;

/**
 * Returns the tight extent of delivered field representatives.
 *
 * The API's 16-bit coordinate square is a quantization envelope, not the
 * generation's content extent, so fitting the camera to the full square can
 * make a valid Atlas appear as a tiny mark.
 */
export const atlasFieldBounds = (
  activeTiles: readonly WeightedAtlasTile[],
): AtlasFieldBounds | undefined => {
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;

  for (const { tile } of activeTiles) {
    for (
      let pointIndex = 0;
      pointIndex < tile.deliveredCount;
      pointIndex += 1
    ) {
      const pointX = tile.positions[pointIndex * 2];
      const pointY = tile.positions[pointIndex * 2 + 1];
      if (pointX === undefined || pointY === undefined) {
        continue;
      }
      const centeredX = pointX + 0.5;
      const centeredY = pointY + 0.5;
      maximumX = Math.max(maximumX, centeredX);
      maximumY = Math.max(maximumY, centeredY);
      minimumX = Math.min(minimumX, centeredX);
      minimumY = Math.min(minimumY, centeredY);
    }
  }

  return Number.isFinite(minimumX)
    ? { maximumX, maximumY, minimumX, minimumY }
    : undefined;
};

/**
 * Packs active representatives into stable, tightly packed GPU attributes.
 *
 * Only each tile's fair delivery prefix is splatted: a budget-truncated
 * trailing bucket covers just the Z-curve prefix of the tile, and giving
 * those points full per-point mass would pile the tile's density into a
 * staircase-shaped region. The frontier's `massPerPoint` already spreads the
 * tile's visible mass over this same prefix, so total mass is preserved.
 */
export const packAtlasField = (
  activeTiles: readonly WeightedAtlasTile[],
): PackedAtlasField => {
  const fairCounts = activeTiles.map(({ tile }) =>
    atlasFairDeliveryCount(tile),
  );
  const instanceCount = fairCounts.reduce(
    (total, fairCount) => total + fairCount,
    0,
  );
  const positions = new Float32Array(instanceCount * 2);
  const masses = new Float32Array(instanceCount);
  const tileZooms = new Float32Array(instanceCount);
  const seenRows = new Set<number>();
  let outputIndex = 0;

  for (let tileIndex = 0; tileIndex < activeTiles.length; tileIndex += 1) {
    const weightedTile = activeTiles[tileIndex];
    const fairCount = fairCounts[tileIndex];
    if (weightedTile === undefined || fairCount === undefined) {
      continue;
    }
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
      if (pointIndex >= fairCount) {
        continue;
      }

      positions[outputIndex * 2] = pointX + 0.5;
      positions[outputIndex * 2 + 1] = pointY + 0.5;
      masses[outputIndex] = weightedTile.massPerPoint;
      tileZooms[outputIndex] = tile.coordinate.z;
      outputIndex += 1;
    }
  }

  return {
    instanceCount,
    masses,
    positions,
    tileZooms,
  };
};

/**
 * Selects `markCount` spatially fair delivered-point indices for one tile.
 *
 * Whole recovered buckets are taken in delivery order while they fit. The
 * bucket where the cap lands is stride-sampled across its full Morton range
 * instead of cut as a prefix: a mid-bucket prefix is a Z-curve staircase
 * region, which renders as sharp horizontal cuts through clusters.
 */
const selectMarkIndices = (
  weightedTile: WeightedAtlasTile,
  markCount: number,
): Set<number> => {
  const { tile } = weightedTile;
  const segments = atlasDeliverySegments(tile);
  const fairCount = atlasFairDeliveryCount(tile, segments);
  const selected = new Set<number>();

  for (const segment of segments) {
    const segmentEnd = Math.min(segment.end, fairCount);
    const segmentLength = segmentEnd - segment.start;
    const remaining = markCount - selected.size;
    if (segmentLength <= 0 || remaining <= 0) {
      break;
    }
    if (segmentLength <= remaining) {
      for (let index = segment.start; index < segmentEnd; index += 1) {
        selected.add(index);
      }
      continue;
    }
    for (let pick = 0; pick < remaining; pick += 1) {
      selected.add(
        segment.start + Math.floor((pick * segmentLength) / remaining),
      );
    }
    break;
  }
  return selected;
};

/**
 * Packs a globally mass-balanced, spatially fair subset of the marks.
 *
 * Independently capped tiles cannot all contribute their full delivery to a
 * point layer: doing so gives every saturated tile the same apparent density.
 * The largest representative mass defines one visual mark's support, and each
 * other tile contributes a corresponding number of points chosen bucket by
 * bucket (see {@link selectMarkIndices}), so the subset stays deterministic
 * and row-stable for one tile without inheriting Morton-prefix bias.
 */
export const packAtlasMarks = (
  activeTiles: readonly WeightedAtlasTile[],
  colorForRow?: AtlasMarkColorAccessor,
): PackedAtlasMarks => {
  const fairCounts = activeTiles.map(({ tile }) =>
    atlasFairDeliveryCount(tile),
  );
  const maximumMass = activeTiles.reduce(
    (maximum, { massPerPoint, tile }, tileIndex) =>
      tile.deliveredCount === 0 || fairCounts[tileIndex] === 0
        ? maximum
        : Math.max(maximum, massPerPoint),
    0,
  );
  const selectedIndices = activeTiles.map((weightedTile, tileIndex) =>
    selectMarkIndices(
      weightedTile,
      maximumMass > 0
        ? Math.min(
            fairCounts[tileIndex] ?? 0,
            Math.ceil(weightedTile.tile.visibleSubtreeCount / maximumMass),
          )
        : 0,
    ),
  );
  const instanceCount = selectedIndices.reduce(
    (total, selected) => total + selected.size,
    0,
  );
  const markColors = new Uint8Array(instanceCount * 4);
  const positions = new Float32Array(instanceCount * 2);
  const rowIds = new Uint32Array(instanceCount);
  const seenRows = new Set<number>();
  let outputIndex = 0;

  for (let tileIndex = 0; tileIndex < activeTiles.length; tileIndex += 1) {
    const weightedTile = activeTiles[tileIndex];
    const selected = selectedIndices[tileIndex];
    if (weightedTile === undefined || selected === undefined) {
      continue;
    }
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
      if (!selected.has(pointIndex)) {
        continue;
      }

      positions[outputIndex * 2] = pointX + 0.5;
      positions[outputIndex * 2 + 1] = pointY + 0.5;
      rowIds[outputIndex] = rowId;
      const markColor = colorForRow?.(rowId) ?? defaultMarkColor;
      markColors[outputIndex * 4] = markColor[0];
      markColors[outputIndex * 4 + 1] = markColor[1];
      markColors[outputIndex * 4 + 2] = markColor[2];
      markColors[outputIndex * 4 + 3] = defaultMarkAlpha;
      outputIndex += 1;
    }
  }

  return { instanceCount, markColors, positions, rowIds };
};

const percentile = (sorted: readonly number[], rank: number): number => {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * rank)),
  );
  return sorted[index] ?? 0;
};

/**
 * Derives a robust exposure scale from RGBA field readback.
 *
 * Zero samples remain transparent to the glow rather than becoming a hard
 * threshold. The positive-density percentile keeps a few overlapping kernels
 * from washing out the rest of the field.
 */
export const deriveAtlasFieldExposure = (
  rgbaSamples: Float32Array,
): AtlasFieldExposure => {
  const positive: number[] = [];
  for (let index = 0; index < rgbaSamples.length; index += 4) {
    const sample = rgbaSamples[index];
    if (sample !== undefined && Number.isFinite(sample) && sample > 0) {
      positive.push(sample);
    }
  }
  if (positive.length === 0) {
    return { densityScale: 1 };
  }

  positive.sort((left, right) => left - right);
  return {
    densityScale: 1 / Math.max(percentile(positive, 0.95), 0.000_1),
  };
};
