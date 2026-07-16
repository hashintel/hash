/**
 * Recovers per-bucket delivery structure from a decoded tile.
 *
 * The tile wire delivers points in importance-bucket order with ascending
 * Morton keys inside each bucket, and the wire carries no explicit bucket
 * table. Bucket boundaries are therefore recovered as the positions where
 * the Morton key sequence decreases.
 *
 * This matters because the server backfills buckets until its point budget
 * is exhausted: when the budget lands mid-bucket, that final bucket holds
 * only the Morton-order (Z-curve) prefix of its range - a staircase-shaped,
 * spatially biased subset of the tile. Renderers that treat the delivery as
 * a uniform spatial sample must restrict themselves to the leading complete
 * buckets ({@link atlasFairDeliveryCount}).
 */

import type { DecodedAtlasTile } from "./decode-atlas-tile";

const spreadBits16 = (value: number): number => {
  let spread = value & 0xff_ff;
  spread = (spread | (spread << 8)) & 0x00_ff_00_ff;
  spread = (spread | (spread << 4)) & 0x0f_0f_0f_0f;
  spread = (spread | (spread << 2)) & 0x33_33_33_33;
  return (spread | (spread << 1)) & 0x55_55_55_55;
};

/**
 * Interleaves two 16-bit axes into the server's 32-bit Morton key.
 *
 * Matches `MortonKey::new` in the SALT materialize pass: x occupies the even
 * bits and y the odd bits. The y half is combined by addition to keep the
 * result an unsigned JavaScript number.
 */
export const atlasMortonKey = (x: number, y: number): number =>
  spreadBits16(x) + spreadBits16(y) * 2;

/** One recovered bucket's half-open delivered-point index range. */
export interface AtlasDeliverySegment {
  readonly end: number;
  readonly start: number;
}

/**
 * Splits a tile's delivered points into per-bucket segments.
 *
 * Keys within a bucket are non-decreasing (points sharing a maximum-depth
 * cell repeat a key in the overflow bucket), so every strict decrease marks
 * the start of the next bucket.
 */
export const atlasDeliverySegments = (
  tile: DecodedAtlasTile,
): AtlasDeliverySegment[] => {
  const segments: AtlasDeliverySegment[] = [];
  let segmentStart = 0;
  let previousKey = Number.NEGATIVE_INFINITY;

  for (let pointIndex = 0; pointIndex < tile.deliveredCount; pointIndex += 1) {
    const x = tile.positions[pointIndex * 2];
    const y = tile.positions[pointIndex * 2 + 1];
    if (x === undefined || y === undefined) {
      throw new Error(
        "Decoded tile positions are shorter than its delivered count",
      );
    }
    const key = atlasMortonKey(x, y);
    if (key < previousKey) {
      segments.push({ end: pointIndex, start: segmentStart });
      segmentStart = pointIndex;
    }
    previousKey = key;
  }
  if (segmentStart < tile.deliveredCount) {
    segments.push({ end: tile.deliveredCount, start: segmentStart });
  }
  return segments;
};

/**
 * Returns the leading delivered points that form a spatially fair sample.
 *
 * For a complete tile that is the whole delivery. For a budget-truncated
 * tile the final recovered bucket is the biased Z-curve prefix and is
 * excluded. Two limitations are inherent to the wire:
 *
 * - When the budget lands inside the first delivered bucket there is nothing
 *   to fall back on, so the biased delivery is returned unchanged; frontier
 *   refinement replaces such tiles with children.
 * - A budget that ends exactly on a bucket boundary is indistinguishable
 *   from a mid-bucket cut, so one complete bucket may be dropped needlessly.
 */
export const atlasFairDeliveryCount = (
  tile: DecodedAtlasTile,
  segments: readonly AtlasDeliverySegment[] = atlasDeliverySegments(tile),
): number => {
  if (tile.complete || segments.length <= 1) {
    return tile.deliveredCount;
  }
  const lastCompleteSegment = segments[segments.length - 2];
  return lastCompleteSegment === undefined
    ? tile.deliveredCount
    : lastCompleteSegment.end;
};
