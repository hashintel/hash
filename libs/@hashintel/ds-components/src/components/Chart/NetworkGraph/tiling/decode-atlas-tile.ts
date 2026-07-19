/**
 * Strict decoder for the immutable `ATLTILE4` response body.
 *
 * The decoder treats path coordinates and bootstrap identities as part of the
 * wire contract. A syntactically valid body for another generation or tile is
 * rejected before any typed arrays reach the renderer.
 */

import {
  atlasTileBounds,
  atlasTileKey,
  validateAtlasTileCoordinate,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";

export const ATLAS_TILE_MEDIA_TYPE = "application/vnd.hash.atlas.tile-v4";

const tileMagic = [65, 84, 76, 84, 73, 76, 69, 52] as const;
const tileWireVersion = 4;
const tileHeaderBytes = 160;
const tileBucketBytes = 4;
const tilePointBytes = 8;
const tileWeightBytes = 4;
const completeFlag = 1;
const knownFlags = completeFlag;
const maximumDeliveredPoints = 65_536;
const maximumBucketCount = 64;
const hashBytes = 32;

/** Bootstrap values that bind a tile response to one immutable generation. */
export interface AtlasTileExpectation {
  readonly coordinate: AtlasTileCoordinate;
  readonly generation: string;
  readonly manifestHash: string;
  readonly releaseReportHash: string;
  readonly storeSnapshotIdentity: string;
  readonly variant: number;
}

/** Decoded point representatives and immutable provenance for one tile. */
export interface DecodedAtlasTile {
  /** Delivered record count per importance bucket, in delivery order. */
  readonly bucketCounts: Uint32Array;
  readonly byteLength: number;
  readonly complete: boolean;
  readonly coordinate: AtlasTileCoordinate;
  readonly deliveredCount: number;
  readonly generation: string;
  readonly manifestHash: string;
  /**
   * Visible points each record stands for, itself included.
   *
   * The server attributes every undelivered visible point to the delivered
   * record sharing its deepest Morton cell, so the counts sum to
   * {@link DecodedAtlasTile.visibleSubtreeCount} and render as an unbiased
   * linear-mass density field.
   */
  readonly pointWeights: Uint32Array;
  readonly positions: Uint16Array;
  readonly releaseReportHash: string;
  readonly rowIds: Uint32Array;
  readonly storeSnapshotIdentity: string;
  readonly variant: number;
  readonly visibleSubtreeCount: number;
}

/** A tile body violated the fixed version-4 binary contract. */
export class AtlasTileWireError extends Error {
  override readonly name = "AtlasTileWireError";
}

const fail = (detail: string): never => {
  throw new AtlasTileWireError(detail);
};

const hashFromBytes = (
  bytes: Uint8Array,
  offset: number,
  field: string,
): string => {
  let hash = "";
  for (let index = 0; index < hashBytes; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined) {
      return fail(`${field} extends beyond the tile header`);
    }
    hash += byte.toString(16).padStart(2, "0");
  }
  return hash;
};

const expectEqual = (
  actual: string | number,
  expected: string | number,
  field: string,
): void => {
  if (actual !== expected) {
    fail(`${field} is ${String(actual)}; expected ${String(expected)}`);
  }
};

/**
 * Decodes one tile body and verifies that it belongs to the requested route.
 *
 * @throws {@link AtlasTileWireError} when the body is truncated, malformed,
 *   internally inconsistent, or bound to different immutable identities.
 */
export const decodeAtlasTile = (
  buffer: ArrayBuffer,
  expectation: AtlasTileExpectation,
): DecodedAtlasTile => {
  validateAtlasTileCoordinate(expectation.coordinate);

  if (buffer.byteLength < tileHeaderBytes) {
    return fail(
      `tile body is ${buffer.byteLength} bytes; header requires ${tileHeaderBytes}`,
    );
  }

  const bytes = new Uint8Array(buffer);
  for (const [index, expectedByte] of tileMagic.entries()) {
    if (bytes[index] !== expectedByte) {
      return fail(`tile magic is invalid at byte ${index}`);
    }
  }

  const view = new DataView(buffer);
  const version = view.getUint16(8, true);
  const headerLength = view.getUint16(10, true);
  const variant = view.getUint16(12, true);
  const z = view.getUint8(14);
  const flags = view.getUint8(15);
  const x = view.getUint32(16, true);
  const y = view.getUint32(20, true);
  const visibleSubtreeCount = view.getUint32(24, true);
  const deliveredCount = view.getUint32(28, true);
  const generation = hashFromBytes(bytes, 32, "generation identity");
  const storeSnapshotIdentity = hashFromBytes(
    bytes,
    64,
    "store snapshot identity",
  );
  const manifestHash = hashFromBytes(bytes, 96, "manifest identity");
  const releaseReportHash = hashFromBytes(
    bytes,
    128,
    "release-report identity",
  );

  expectEqual(version, tileWireVersion, "wire version");
  expectEqual(headerLength, tileHeaderBytes, "header length");
  expectEqual(variant, expectation.variant, "variant");
  expectEqual(z, expectation.coordinate.z, "tile zoom");
  expectEqual(x, expectation.coordinate.x, "tile x");
  expectEqual(y, expectation.coordinate.y, "tile y");
  expectEqual(generation, expectation.generation, "generation identity");
  expectEqual(
    storeSnapshotIdentity,
    expectation.storeSnapshotIdentity,
    "store snapshot identity",
  );
  expectEqual(manifestHash, expectation.manifestHash, "manifest identity");
  expectEqual(
    releaseReportHash,
    expectation.releaseReportHash,
    "release-report identity",
  );

  // eslint-disable-next-line no-bitwise -- masking off known flag bits is the point
  if ((flags & ~knownFlags) !== 0) {
    return fail(`tile flags contain unsupported bits: 0x${flags.toString(16)}`);
  }
  if (deliveredCount > maximumDeliveredPoints) {
    return fail(
      `delivered count ${deliveredCount} exceeds ${maximumDeliveredPoints}`,
    );
  }
  if (visibleSubtreeCount < deliveredCount) {
    return fail(
      `visible count ${visibleSubtreeCount} is below delivered count ${deliveredCount}`,
    );
  }

  // eslint-disable-next-line no-bitwise -- extracting the complete flag bit
  const complete = (flags & completeFlag) !== 0;
  if (complete !== (visibleSubtreeCount === deliveredCount)) {
    return fail(
      "complete flag disagrees with visible and delivered point counts",
    );
  }

  if (buffer.byteLength < tileHeaderBytes + tileBucketBytes) {
    return fail(
      `tile body is ${buffer.byteLength} bytes; the bucket table requires ${tileHeaderBytes + tileBucketBytes}`,
    );
  }
  const bucketCount = view.getUint32(tileHeaderBytes, true);
  if (bucketCount === 0 || bucketCount > maximumBucketCount) {
    return fail(
      `bucket count ${bucketCount} is outside 1..=${maximumBucketCount}`,
    );
  }
  const recordsOffset =
    tileHeaderBytes + tileBucketBytes + bucketCount * tileBucketBytes;
  const weightsOffset = recordsOffset + deliveredCount * tilePointBytes;
  const expectedByteLength = weightsOffset + deliveredCount * tileWeightBytes;
  if (buffer.byteLength !== expectedByteLength) {
    return fail(
      `tile body is ${buffer.byteLength} bytes; counts require ${expectedByteLength}`,
    );
  }
  const bucketCounts = new Uint32Array(bucketCount);
  let tabulated = 0;
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const count = view.getUint32(
      tileHeaderBytes + tileBucketBytes + bucketIndex * tileBucketBytes,
      true,
    );
    bucketCounts[bucketIndex] = count;
    tabulated += count;
  }
  if (tabulated !== deliveredCount) {
    return fail(
      `bucket table sums to ${tabulated}; delivered count is ${deliveredCount}`,
    );
  }

  const rowIds = new Uint32Array(deliveredCount);
  const positions = new Uint16Array(deliveredCount * 2);
  const seenRows = new Set<number>();
  const bounds = atlasTileBounds(expectation.coordinate);

  for (let pointIndex = 0; pointIndex < deliveredCount; pointIndex += 1) {
    const pointOffset = recordsOffset + pointIndex * tilePointBytes;
    const rowId = view.getUint32(pointOffset, true);
    const pointX = view.getUint16(pointOffset + 4, true);
    const pointY = view.getUint16(pointOffset + 6, true);

    if (seenRows.has(rowId)) {
      return fail(
        `tile ${atlasTileKey(expectation.coordinate)} repeats row ${rowId}`,
      );
    }
    if (
      pointX < bounds.minimumX ||
      pointX >= bounds.maximumX ||
      pointY < bounds.minimumY ||
      pointY >= bounds.maximumY
    ) {
      return fail(
        `row ${rowId} lies outside tile ${atlasTileKey(expectation.coordinate)}`,
      );
    }

    seenRows.add(rowId);
    rowIds[pointIndex] = rowId;
    positions[pointIndex * 2] = pointX;
    positions[pointIndex * 2 + 1] = pointY;
  }

  const pointWeights = new Uint32Array(deliveredCount);
  let representedTotal = 0;
  for (let pointIndex = 0; pointIndex < deliveredCount; pointIndex += 1) {
    const weight = view.getUint32(
      weightsOffset + pointIndex * tileWeightBytes,
      true,
    );
    if (weight === 0) {
      return fail(`record ${pointIndex} represents zero points`);
    }
    pointWeights[pointIndex] = weight;
    representedTotal += weight;
  }
  if (representedTotal !== visibleSubtreeCount) {
    return fail(
      `represented counts sum to ${representedTotal}; visible count is ${visibleSubtreeCount}`,
    );
  }

  return {
    bucketCounts,
    byteLength: buffer.byteLength,
    complete,
    coordinate: expectation.coordinate,
    deliveredCount,
    generation,
    manifestHash,
    pointWeights,
    positions,
    releaseReportHash,
    rowIds,
    storeSnapshotIdentity,
    variant,
    visibleSubtreeCount,
  };
};
