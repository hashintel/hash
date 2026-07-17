/**
 * Strict decoders for the immutable `ATLCONT1` and `ATLFLOW1` overlay bodies.
 *
 * Overlays share the tile wire's 160-byte identity header, so a decoded
 * overlay is bound to the same immutable generation as every rendered tile.
 * Geometry arrives already quantized into tile world coordinates; the
 * decoders validate counts and ranges and expose typed views, nothing more.
 */

export const ATLAS_CONTOUR_MEDIA_TYPE =
  "application/vnd.hash.atlas.contours-v1";
export const ATLAS_FLOW_MEDIA_TYPE = "application/vnd.hash.atlas.flows-v1";

const overlayHeaderBytes = 160;
const overlayWireVersion = 1;
const contourRecordBytes = 20;
const contourVertexBytes = 4;
const flowRegionBytes = 12;
const flowRecordBytes = 16;
const hashBytes = 32;
const noParent = 0xff_ff_ff_ff;
/** Watershed regions are capped server-side; anything above is malformed. */
const maximumRegionCount = 4_096;
const maximumContourCount = 4_096;

/** Bootstrap values that bind an overlay response to one immutable generation. */
export interface AtlasOverlayExpectation {
  readonly generation: string;
  readonly manifestHash: string;
  readonly releaseReportHash: string;
  readonly storeSnapshotIdentity: string;
  readonly variant: number;
}

/** One nested density contour in world coordinates. */
export interface AtlasContour {
  /** Superlevel density at the leaf's peak. */
  readonly birth: number;
  /** Superlevel density at which the leaf merges into its parent. */
  readonly death: number;
  /** Merge-tree leaf identity. */
  readonly leaf: number;
  /** Index of the enclosing contour in the same array, if any. */
  readonly parent: number | undefined;
  /** Closed ring [x0, y0, x1, y1, ...]; the first vertex is not repeated. */
  readonly positions: Float32Array;
}

/** Decoded contour overlay bound to one immutable generation. */
export interface DecodedAtlasContours {
  readonly byteLength: number;
  readonly contours: readonly AtlasContour[];
  readonly gridSize: number;
}

/** One watershed region peak in world coordinates. */
export interface AtlasFlowRegion {
  /** Index of the parent region in the same array, if any. */
  readonly parent: number | undefined;
  /** Density persistence of the region's peak. */
  readonly persistence: number;
  readonly x: number;
  readonly y: number;
}

/** Aggregated semantic flow between two distinct watershed regions. */
export interface AtlasRegionFlow {
  /** Number of directed semantic edges aggregated into this flow. */
  readonly edgeCount: number;
  readonly source: number;
  readonly target: number;
  /** Sum of fuzzy semantic edge weights between the two regions. */
  readonly weight: number;
}

/** Decoded region-flow overlay bound to one immutable generation. */
export interface DecodedAtlasFlows {
  readonly byteLength: number;
  readonly flows: readonly AtlasRegionFlow[];
  readonly gridSize: number;
  readonly regions: readonly AtlasFlowRegion[];
}

/** An overlay body violated the fixed version-1 binary contract. */
export class AtlasOverlayWireError extends Error {
  override readonly name = "AtlasOverlayWireError";
}

const fail = (detail: string): never => {
  throw new AtlasOverlayWireError(detail);
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
      return fail(`${field} extends beyond the overlay header`);
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

interface OverlayHeader {
  readonly countA: number;
  readonly countB: number;
  readonly gridSize: number;
  readonly view: DataView;
}

const decodeOverlayHeader = (
  buffer: ArrayBuffer,
  magic: string,
  expectation: AtlasOverlayExpectation,
): OverlayHeader => {
  if (buffer.byteLength < overlayHeaderBytes) {
    return fail(
      `overlay body is ${buffer.byteLength} bytes; header requires ${overlayHeaderBytes}`,
    );
  }
  const bytes = new Uint8Array(buffer);
  const expectedMagic = new TextEncoder().encode(magic);
  for (const [index, expectedByte] of expectedMagic.entries()) {
    if (bytes[index] !== expectedByte) {
      return fail(`overlay magic is invalid at byte ${index}`);
    }
  }

  const view = new DataView(buffer);
  expectEqual(view.getUint16(8, true), overlayWireVersion, "wire version");
  expectEqual(view.getUint16(10, true), overlayHeaderBytes, "header length");
  expectEqual(view.getUint16(12, true), expectation.variant, "variant");
  expectEqual(
    hashFromBytes(bytes, 32, "generation identity"),
    expectation.generation,
    "generation identity",
  );
  expectEqual(
    hashFromBytes(bytes, 64, "store snapshot identity"),
    expectation.storeSnapshotIdentity,
    "store snapshot identity",
  );
  expectEqual(
    hashFromBytes(bytes, 96, "manifest identity"),
    expectation.manifestHash,
    "manifest identity",
  );
  expectEqual(
    hashFromBytes(bytes, 128, "release-report identity"),
    expectation.releaseReportHash,
    "release-report identity",
  );

  return {
    countA: view.getUint32(16, true),
    countB: view.getUint32(20, true),
    gridSize: view.getUint32(24, true),
    view,
  };
};

/**
 * Decodes one contour overlay body.
 *
 * @throws {@link AtlasOverlayWireError} when the body is truncated,
 *   malformed, internally inconsistent, or bound to different identities.
 */
export const decodeAtlasContours = (
  buffer: ArrayBuffer,
  expectation: AtlasOverlayExpectation,
): DecodedAtlasContours => {
  const header = decodeOverlayHeader(buffer, "ATLCONT1", expectation);
  const contourCount = header.countA;
  const vertexTotal = header.countB;
  if (contourCount > maximumContourCount) {
    return fail(`contour count ${contourCount} exceeds ${maximumContourCount}`);
  }
  const verticesOffset = overlayHeaderBytes + contourCount * contourRecordBytes;
  const expectedByteLength = verticesOffset + vertexTotal * contourVertexBytes;
  if (buffer.byteLength !== expectedByteLength) {
    return fail(
      `overlay body is ${buffer.byteLength} bytes; counts require ${expectedByteLength}`,
    );
  }

  const view = header.view;
  const contourIndexByLeaf = new Map<number, number>();
  for (let index = 0; index < contourCount; index += 1) {
    const leaf = view.getUint32(
      overlayHeaderBytes + index * contourRecordBytes,
      true,
    );
    if (contourIndexByLeaf.has(leaf)) {
      return fail(`contour table repeats merge-tree leaf ${leaf}`);
    }
    contourIndexByLeaf.set(leaf, index);
  }

  const contours: AtlasContour[] = [];
  let vertexCursor = 0;
  for (let index = 0; index < contourCount; index += 1) {
    const record = overlayHeaderBytes + index * contourRecordBytes;
    const leaf = view.getUint32(record, true);
    const parentLeaf = view.getUint32(record + 4, true);
    const vertexCount = view.getUint32(record + 8, true);
    const birth = view.getFloat32(record + 12, true);
    const death = view.getFloat32(record + 16, true);
    if (vertexCount < 3) {
      return fail(`contour ${leaf} has ${vertexCount} vertices; rings need 3`);
    }
    if (vertexCursor + vertexCount > vertexTotal) {
      return fail("contour vertex counts overrun the vertex table");
    }
    if (!Number.isFinite(birth) || !Number.isFinite(death) || birth < death) {
      return fail(`contour ${leaf} has an inverted density interval`);
    }
    const positions = new Float32Array(vertexCount * 2);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset =
        verticesOffset + (vertexCursor + vertex) * contourVertexBytes;
      positions[vertex * 2] = view.getUint16(offset, true) + 0.5;
      positions[vertex * 2 + 1] = view.getUint16(offset + 2, true) + 0.5;
    }
    vertexCursor += vertexCount;
    const parent =
      parentLeaf === noParent ? undefined : contourIndexByLeaf.get(parentLeaf);
    if (parentLeaf !== noParent && parent === undefined) {
      return fail(
        `contour ${leaf} references missing parent leaf ${parentLeaf}`,
      );
    }
    if (parent === index) {
      return fail(`contour ${leaf} claims to enclose itself`);
    }
    contours.push({ birth, death, leaf, parent, positions });
  }
  if (vertexCursor !== vertexTotal) {
    return fail(
      `contour vertex counts sum to ${vertexCursor}; the table holds ${vertexTotal}`,
    );
  }

  return {
    byteLength: buffer.byteLength,
    contours,
    gridSize: header.gridSize,
  };
};

/**
 * Decodes one region-flow overlay body.
 *
 * @throws {@link AtlasOverlayWireError} when the body is truncated,
 *   malformed, internally inconsistent, or bound to different identities.
 */
export const decodeAtlasFlows = (
  buffer: ArrayBuffer,
  expectation: AtlasOverlayExpectation,
): DecodedAtlasFlows => {
  const header = decodeOverlayHeader(buffer, "ATLFLOW1", expectation);
  const regionCount = header.countA;
  const flowCount = header.countB;
  if (regionCount > maximumRegionCount) {
    return fail(`region count ${regionCount} exceeds ${maximumRegionCount}`);
  }
  const flowsOffset = overlayHeaderBytes + regionCount * flowRegionBytes;
  const expectedByteLength = flowsOffset + flowCount * flowRecordBytes;
  if (buffer.byteLength !== expectedByteLength) {
    return fail(
      `overlay body is ${buffer.byteLength} bytes; counts require ${expectedByteLength}`,
    );
  }

  const view = header.view;
  const regions: AtlasFlowRegion[] = [];
  for (let index = 0; index < regionCount; index += 1) {
    const record = overlayHeaderBytes + index * flowRegionBytes;
    const parentValue = view.getUint32(record + 4, true);
    const persistence = view.getFloat32(record + 8, true);
    if (parentValue !== noParent && parentValue >= regionCount) {
      return fail(`region ${index} references missing parent ${parentValue}`);
    }
    if (parentValue === index) {
      return fail(`region ${index} claims to be its own parent`);
    }
    if (!Number.isFinite(persistence) || persistence < 0) {
      return fail(`region ${index} has invalid persistence ${persistence}`);
    }
    regions.push({
      parent: parentValue === noParent ? undefined : parentValue,
      persistence,
      x: view.getUint16(record, true) + 0.5,
      y: view.getUint16(record + 2, true) + 0.5,
    });
  }

  const flows: AtlasRegionFlow[] = [];
  for (let index = 0; index < flowCount; index += 1) {
    const record = flowsOffset + index * flowRecordBytes;
    const source = view.getUint32(record, true);
    const target = view.getUint32(record + 4, true);
    const weight = view.getFloat32(record + 8, true);
    const edgeCount = view.getUint32(record + 12, true);
    if (source >= target) {
      return fail(`flow ${index} pair (${source}, ${target}) is not ordered`);
    }
    if (target >= regionCount) {
      return fail(`flow ${index} references missing region ${target}`);
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return fail(`flow ${index} has non-evidential weight ${weight}`);
    }
    if (edgeCount === 0) {
      return fail(`flow ${index} aggregates zero semantic edges`);
    }
    flows.push({ edgeCount, source, target, weight });
  }

  return {
    byteLength: buffer.byteLength,
    flows,
    gridSize: header.gridSize,
    regions,
  };
};
