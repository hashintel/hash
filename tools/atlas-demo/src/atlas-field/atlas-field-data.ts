/**
 * CPU preparation for the GPU field pass.
 *
 * Active frontier cells are disjoint, so a repeated generation row indicates
 * a frontier bug and is rejected instead of silently adding duplicate mass.
 */

import { atlasTileKey } from "../atlas-client";

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
  /** Per-mark pixel radii, area-proportional to represented mass. */
  readonly markRadii: Float32Array;
  readonly positions: Float32Array;
  readonly rowIds: Uint32Array;
}

/** Optional source for a future per-entity color plane. */
export type AtlasMarkColorAccessor = (
  rowId: number,
) => readonly [number, number, number] | undefined;

/** Additive far-field star attributes covering every active representative. */
export interface PackedAtlasStars {
  readonly instanceCount: number;
  readonly positions: Float32Array;
  readonly starColors: Uint8Array;
}

/** Positive-density percentile used to expose the color-agnostic glow. */
export interface AtlasFieldExposure {
  readonly densityScale: number;
}

const defaultMarkColor = [226, 234, 240] as const;
const defaultMarkAlpha = 168;
/** Mark radius for a fully delivered representative (mass 1). */
const baseMarkRadius = 0.65;
/** Cool star tint; accumulation toward white happens in the blend. */
const starColor = [186, 208, 232] as const;
/** Star intensity for a fully delivered representative (mass 1). */
const baseStarIntensity = 0.16;
/** Additional intensity per represented-mass octave. */
const starIntensityPerOctave = 0.11;

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
      const weight = tile.pointWeights[pointIndex];
      if (
        rowId === undefined ||
        pointX === undefined ||
        pointY === undefined ||
        weight === undefined
      ) {
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
      masses[outputIndex] = weight;
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
 * Packs a globally mass-balanced prefix of the active representatives.
 *
 * Independently capped tiles cannot all contribute their full delivery to a
 * point layer: doing so gives every saturated tile the same apparent density.
 * The largest representative mass defines one visual mark's support, and each
 * other tile contributes the corresponding prefix of its delivery. The server
 * emits each bucket in progressive (bit-reversed Morton) order, so every
 * prefix of a delivery is already a spatially stratified sample of its tile.
 */
export const packAtlasMarks = (
  activeTiles: readonly WeightedAtlasTile[],
  colorForRow?: AtlasMarkColorAccessor,
): PackedAtlasMarks => {
  const maximumMass = activeTiles.reduce(
    (maximum, { massPerPoint, tile }) =>
      tile.deliveredCount === 0 ? maximum : Math.max(maximum, massPerPoint),
    0,
  );
  const markCounts = activeTiles.map(({ tile }) =>
    maximumMass > 0
      ? Math.min(
          tile.deliveredCount,
          Math.ceil(tile.visibleSubtreeCount / maximumMass),
        )
      : 0,
  );
  const instanceCount = markCounts.reduce(
    (total, markCount) => total + markCount,
    0,
  );
  const markColors = new Uint8Array(instanceCount * 4);
  const markRadii = new Float32Array(instanceCount);
  const positions = new Float32Array(instanceCount * 2);
  const rowIds = new Uint32Array(instanceCount);
  const seenRows = new Set<number>();
  let outputIndex = 0;

  for (let tileIndex = 0; tileIndex < activeTiles.length; tileIndex += 1) {
    const weightedTile = activeTiles[tileIndex];
    const markCount = markCounts[tileIndex];
    if (weightedTile === undefined || markCount === undefined) {
      continue;
    }
    const { tile } = weightedTile;
    // Represented mass spans decades (a truncated coarse tile's marks stand
    // in for hundreds of entities), so area-proportional sizing saturates
    // any pixel clamp. Log compression gives each mass decade a legible
    // radius step instead: mass 1 -> 0.65px, 8 -> 1.3px, 64 -> 1.95px,
    // 4096 -> 3.25px.
    const markRadius =
      baseMarkRadius *
      (1 + Math.log2(Math.max(weightedTile.massPerPoint, 1)) / 3);
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
      if (pointIndex >= markCount) {
        continue;
      }

      positions[outputIndex * 2] = pointX + 0.5;
      positions[outputIndex * 2 + 1] = pointY + 0.5;
      rowIds[outputIndex] = rowId;
      markRadii[outputIndex] = markRadius;
      const markColor = colorForRow?.(rowId) ?? defaultMarkColor;
      markColors[outputIndex * 4] = markColor[0];
      markColors[outputIndex * 4 + 1] = markColor[1];
      markColors[outputIndex * 4 + 2] = markColor[2];
      markColors[outputIndex * 4 + 3] = defaultMarkAlpha;
      outputIndex += 1;
    }
  }

  return { instanceCount, markColors, markRadii, positions, rowIds };
};

/**
 * Packs every active representative as one additive star.
 *
 * The far-field effect is accumulation, not per-point size: each star is
 * rendered dim and additively blended, so dense regions brighten toward
 * white because light adds while isolated points stay faint sparks. Star
 * intensity grows with the log of represented mass, keeping brightness a
 * readout of delivered evidence rather than decoration.
 */
export const packAtlasStars = (
  activeTiles: readonly WeightedAtlasTile[],
): PackedAtlasStars => {
  const instanceCount = activeTiles.reduce(
    (total, weightedTile) => total + weightedTile.tile.deliveredCount,
    0,
  );
  const positions = new Float32Array(instanceCount * 2);
  const starColors = new Uint8Array(instanceCount * 4);
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
      const weight = tile.pointWeights[pointIndex];
      if (
        rowId === undefined ||
        pointX === undefined ||
        pointY === undefined ||
        weight === undefined
      ) {
        throw new Error(
          `Tile ${atlasTileKey(tile.coordinate)} has incomplete decoded arrays`,
        );
      }
      if (seenRows.has(rowId)) {
        throw new Error(`Active frontier repeats generation row ${rowId}`);
      }

      const intensity = Math.min(
        baseStarIntensity +
          starIntensityPerOctave * Math.log2(Math.max(weight, 1)),
        1,
      );
      seenRows.add(rowId);
      positions[outputIndex * 2] = pointX + 0.5;
      positions[outputIndex * 2 + 1] = pointY + 0.5;
      starColors[outputIndex * 4] = starColor[0];
      starColors[outputIndex * 4 + 1] = starColor[1];
      starColors[outputIndex * 4 + 2] = starColor[2];
      starColors[outputIndex * 4 + 3] = Math.round(intensity * 255);
      outputIndex += 1;
    }
  }

  return { instanceCount, positions, starColors };
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
