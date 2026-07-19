/**
 * Tile-kind decoder for the SALTILE wire (normative schema:
 * `SPEC-ADDENDUM-WIRE.md` sections 3 and 5). Layers over the envelope
 * reader: validates the HEAD schema and its echo of the request, then
 * exposes the columns as typed-array views over the response buffer -
 * point data is never copied and never walked.
 */

import { decodeCbor, type CborValue } from "./saltile-cbor";
import {
  readEnvelope,
  SaltileMode,
  SaltileWireError,
  TileSlot,
  type SaltileSlot,
} from "./saltile-wire";

/** Length of a generation identity in bytes (sha256). */
const GENERATION_BYTES = 32;

/** The request context a tile response must echo. */
export interface SaltileTileRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  readonly coordinate: {
    readonly z: number;
    readonly x: number;
    readonly y: number;
  };
  readonly mode: SaltileMode;
  /** log2 of the bucket-schedule span (the manifest's `m`). */
  readonly spanLog2: number;
  /** Count of colored type ids sent; 0 means TYPE_MASK is absent. */
  readonly coloredTypeIdCount: number;
  readonly includeDetailedData: boolean;
}

/** Filtered-set metadata carried by HEAD key 8 when present. */
export interface SaltileTileGlobal {
  readonly visibleAtZoom: number;
  /** World-frame extent as [minX, minY, maxX, maxY]. */
  readonly bounds: readonly number[];
  readonly minResolution: number;
}

/** Per-point detail from the trailer tail, delivered order. */
export interface SaltileTileDetail {
  readonly labels: readonly (string | null)[];
  readonly icons: readonly (string | null)[];
}

/** One decoded tile response; typed arrays are views, not copies. */
export interface DecodedSaltileTile {
  readonly delivered: number;
  readonly visible: number;
  readonly firstBucket: number;
  /** Per-bucket delivered counts for buckets firstBucket.. */
  readonly runs: readonly number[];
  /** Occupancy bitmask of the four Morton children below this cut; 0 = complete. */
  readonly children: number;
  /** f32 xy pairs in the wire frame, length `delivered * 2`. */
  readonly positions: Float32Array;
  readonly rowIds: Uint32Array;
  /**
   * Per-point type bitmask rows, `ceil(coloredTypeIdCount / 8)` bytes
   * per point, LSB-first; null when the request sent no colored types.
   */
  readonly typeMask: Uint8Array | null;
  readonly detail: SaltileTileDetail | null;
  readonly global: SaltileTileGlobal | null;
}

const fail = (detail: string, offset: number): never => {
  throw new SaltileWireError(detail, offset);
};

const isUint = (value: CborValue | undefined): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isCborArray = (
  value: CborValue | undefined,
): value is readonly CborValue[] => Array.isArray(value);

const isCborMap = (
  value: CborValue | undefined,
): value is ReadonlyMap<number, CborValue> => value instanceof Map;

const isUintArray = (
  value: CborValue | undefined,
): value is readonly number[] =>
  isCborArray(value) && value.every((entry) => isUint(entry));

const isNumberArray = (
  value: CborValue | undefined,
): value is readonly number[] =>
  isCborArray(value) && value.every((entry) => typeof entry === "number");

const isNullableStringArray = (
  value: CborValue | undefined,
): value is readonly (string | null)[] =>
  isCborArray(value) &&
  value.every((entry) => entry === null || typeof entry === "string");

const requireUint = (
  map: ReadonlyMap<number, CborValue>,
  key: number,
  name: string,
  offset: number,
): number => {
  const value = map.get(key);
  if (!isUint(value)) {
    return fail(
      `HEAD ${name} (key ${key}) must be an unsigned integer`,
      offset,
    );
  }
  return value;
};

const expectEqual = (
  actual: number,
  expected: number,
  name: string,
  offset: number,
): void => {
  if (actual !== expected) {
    fail(`HEAD ${name} is ${actual}; the request expects ${expected}`, offset);
  }
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

/** HEAD keys of the tile schema. */
const tileHeadKeys = {
  generation: 0,
  variant: 1,
  coordinate: 2,
  mode: 3,
  delivered: 4,
  visible: 5,
  firstBucket: 6,
  runs: 7,
  global: 8,
  children: 9,
  trailer: 10,
} as const;

const knownHeadKeys = new Set<number>(Object.values(tileHeadKeys));

const readGlobal = (value: CborValue, offset: number): SaltileTileGlobal => {
  if (!isCborMap(value)) {
    return fail("HEAD global (key 8) must be a map", offset);
  }
  for (const key of value.keys()) {
    if (key !== 0 && key !== 1 && key !== 2) {
      return fail(`HEAD global carries unknown key ${key}`, offset);
    }
  }
  const visibleAtZoom = value.get(0);
  const bounds = value.get(1);
  const minResolution = value.get(2);
  if (!isUint(visibleAtZoom) || !isUint(minResolution)) {
    return fail("HEAD global counts must be unsigned integers", offset);
  }
  if (!isNumberArray(bounds) || bounds.length !== 4) {
    return fail("HEAD global bounds must be four floats", offset);
  }
  return { visibleAtZoom, bounds, minResolution };
};

const readDetail = (
  payload: Uint8Array,
  delivered: number,
  offset: number,
): SaltileTileDetail => {
  const value = decodeCbor(payload);
  if (!isCborMap(value)) {
    return fail("TRAILER must be a map", offset);
  }
  for (const key of value.keys()) {
    if (key !== 0 && key !== 1) {
      return fail(`TRAILER carries unknown key ${key}`, offset);
    }
  }
  const columns: (readonly (string | null)[])[] = [];
  for (const [key, name] of [
    [0, "labels"],
    [1, "icons"],
  ] as const) {
    const entries = value.get(key);
    if (!isNullableStringArray(entries)) {
      return fail(`TRAILER ${name} entries must be strings or null`, offset);
    }
    if (entries.length !== delivered) {
      return fail(
        `TRAILER ${name} must carry exactly ${delivered} entries`,
        offset,
      );
    }
    columns.push(entries);
  }
  return { labels: columns[0]!, icons: columns[1]! };
};

const requireSlot = (
  slots: readonly (SaltileSlot | null)[],
  slot: number,
  name: string,
  expectedLength: number,
  responseLength: number,
): SaltileSlot => {
  const extent = slots[slot] ?? null;
  if (extent === null) {
    return fail(`required slot ${slot} (${name}) is absent`, responseLength);
  }
  const length = extent.end - extent.start;
  if (length !== expectedLength) {
    return fail(
      `slot ${slot} (${name}) is ${length} bytes; ${expectedLength} required`,
      extent.start,
    );
  }
  return extent;
};

/**
 * Decodes one tile response against the request that produced it.
 *
 * Slots beyond the ones this decoder consumes - the reserved MASS
 * slot and any appended by a newer table - are ignored by design
 * (structural optionality; the envelope validated their extents).
 *
 * @throws {@link SaltileWireError} on envelope, schema, echo, or count
 *   violations; `SaltileCborError` on CBOR profile violations.
 */
export const decodeSaltileTile = (
  buffer: ArrayBuffer,
  request: SaltileTileRequest,
): DecodedSaltileTile => {
  if (request.generation.length !== GENERATION_BYTES) {
    fail(
      `request generation is ${request.generation.length} bytes; expected ${GENERATION_BYTES}`,
      0,
    );
  }

  const envelope = readEnvelope(buffer, "tile");
  const bytes = new Uint8Array(buffer);

  const headSlot = envelope.slots[TileSlot.Head]!;
  const head = decodeCbor(bytes.subarray(headSlot.start, headSlot.end));
  const headOffset = headSlot.start;
  if (!isCborMap(head)) {
    return fail("HEAD must be a map", headOffset);
  }
  for (const key of head.keys()) {
    if (!knownHeadKeys.has(key)) {
      return fail(`HEAD carries unknown key ${key}`, headOffset);
    }
  }

  const generation = head.get(tileHeadKeys.generation);
  if (
    !(generation instanceof Uint8Array) ||
    generation.length !== GENERATION_BYTES
  ) {
    return fail("HEAD generation must be a 32-byte identity", headOffset);
  }
  if (!bytesEqual(generation, request.generation)) {
    return fail("HEAD generation does not match the request", headOffset);
  }

  expectEqual(
    requireUint(head, tileHeadKeys.variant, "variant", headOffset),
    request.variant,
    "variant",
    headOffset,
  );

  const coordinate = head.get(tileHeadKeys.coordinate);
  if (!isUintArray(coordinate) || coordinate.length !== 3) {
    return fail("HEAD coordinate must be [z, x, y]", headOffset);
  }
  expectEqual(coordinate[0]!, request.coordinate.z, "z", headOffset);
  expectEqual(coordinate[1]!, request.coordinate.x, "x", headOffset);
  expectEqual(coordinate[2]!, request.coordinate.y, "y", headOffset);

  expectEqual(
    requireUint(head, tileHeadKeys.mode, "mode", headOffset),
    request.mode,
    "mode",
    headOffset,
  );

  const delivered = requireUint(
    head,
    tileHeadKeys.delivered,
    "delivered",
    headOffset,
  );
  const visible = requireUint(
    head,
    tileHeadKeys.visible,
    "visible",
    headOffset,
  );
  if (visible < delivered) {
    return fail(
      `HEAD visible ${visible} is below delivered ${delivered}`,
      headOffset,
    );
  }

  const firstBucket = requireUint(
    head,
    tileHeadKeys.firstBucket,
    "firstBucket",
    headOffset,
  );
  const runs = head.get(tileHeadKeys.runs);
  if (!isUintArray(runs)) {
    return fail("HEAD runs must be an array of unsigned integers", headOffset);
  }

  const { z } = request.coordinate;
  const cut = z + request.spanLog2;
  const delta = request.mode === SaltileMode.Delta;
  const expectedFirst = delta && z !== 0 ? cut : 0;
  const expectedRuns = delta ? (z === 0 ? request.spanLog2 + 1 : 1) : cut + 1;
  expectEqual(firstBucket, expectedFirst, "firstBucket", headOffset);
  expectEqual(runs.length, expectedRuns, "runs length", headOffset);

  const runSum = runs.reduce((sum, entry) => sum + entry, 0);
  if (runSum !== delivered) {
    return fail(
      `HEAD runs sum to ${runSum}; delivered is ${delivered}`,
      headOffset,
    );
  }

  const children = requireUint(
    head,
    tileHeadKeys.children,
    "children",
    headOffset,
  );
  if (children > 15) {
    return fail(
      "HEAD children carries bits above the four Morton children",
      headOffset,
    );
  }

  const trailerDeclared = head.get(tileHeadKeys.trailer);
  if (typeof trailerDeclared !== "boolean") {
    return fail("HEAD trailer (key 10) must be a boolean", headOffset);
  }
  if (trailerDeclared !== request.includeDetailedData) {
    return fail(
      `HEAD trailer is ${trailerDeclared}; the request expects ${request.includeDetailedData}`,
      headOffset,
    );
  }

  const globalValue = head.get(tileHeadKeys.global);
  const global =
    globalValue === undefined ? null : readGlobal(globalValue, headOffset);

  const positionsSlot = requireSlot(
    envelope.slots,
    TileSlot.Positions,
    "POSITIONS",
    delivered * 8,
    buffer.byteLength,
  );
  const rowIdsSlot = requireSlot(
    envelope.slots,
    TileSlot.RowIds,
    "ROW_IDS",
    delivered * 4,
    buffer.byteLength,
  );

  const maskStride = Math.ceil(request.coloredTypeIdCount / 8);
  const maskExtent = envelope.slots[TileSlot.TypeMask] ?? null;
  let typeMask: Uint8Array | null = null;
  if (request.coloredTypeIdCount === 0) {
    if (maskExtent !== null) {
      return fail(
        "TYPE_MASK is present; the request sent no coloredTypeIds",
        maskExtent.start,
      );
    }
  } else {
    const slot = requireSlot(
      envelope.slots,
      TileSlot.TypeMask,
      "TYPE_MASK",
      delivered * maskStride,
      buffer.byteLength,
    );
    typeMask = bytes.subarray(slot.start, slot.end);
  }

  let detail: SaltileTileDetail | null = null;
  if (trailerDeclared) {
    if (envelope.tailOffset >= buffer.byteLength) {
      return fail(
        "TRAILER is declared but the response carries no tail",
        envelope.tailOffset,
      );
    }
    detail = readDetail(
      bytes.subarray(envelope.tailOffset),
      delivered,
      envelope.tailOffset,
    );
  } else if (envelope.tailOffset !== buffer.byteLength) {
    return fail(
      "response carries a tail but HEAD declares no trailer",
      envelope.tailOffset,
    );
  }

  return {
    delivered,
    visible,
    firstBucket,
    runs,
    children,
    positions: new Float32Array(buffer, positionsSlot.start, delivered * 2),
    rowIds: new Uint32Array(buffer, rowIdsSlot.start, delivered),
    typeMask,
    detail,
    global,
  };
};
