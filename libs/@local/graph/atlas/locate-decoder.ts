/**
 * SALTILEL (locate) reference decoder - ISOLATED, ZERO DEPENDENCIES.
 *
 * One self-contained file decoding the atlas locate response:
 * `POST /v1/atlas/locate/{generation}/{variant}` under
 * `application/vnd.hash.saltile-v1`. The normative contract is
 * `libs/@local/graph/atlas/SPEC-ADDENDUM-WIRE.md` (sections 3, 4, 6b);
 * this file is a handover artifact for grafting into a consumer
 * codebase, deliberately importing nothing.
 *
 * Grafting notes for the existing `atlas-decode/` stack:
 * - `wire.ts` already knows the `locate` kind; the slot table below
 *   (`LocateSlot`) is the missing piece.
 * - The locate TRAILER introduces two CBOR shapes the older kinds
 *   never carried: NEGATIVE integers (major type 1) and DOUBLES
 *   (0xFB) - property values are tstr / int / f64 / bool / null.
 *   `cbor.ts` needs both when grafting.
 * - Property names are INTERNED (WIRE 6b): trailer key 2 is the
 *   bytewise-sorted, deduplicated name table; each per-node map keys
 *   by uint index into it, ascending. This decoder validates the
 *   laws and returns RESOLVED `Record<name, value>` objects.
 *
 * Integers beyond `Number.MAX_SAFE_INTEGER` throw rather than round;
 * extend to `bigint` if real data ever hits that.
 */

/* eslint-disable no-bitwise */

/** A response body violated the wire contract. */
export class SaltileLocateError extends Error {
  override readonly name = "SaltileLocateError";
  /** Byte offset at which the violated check applies. */
  readonly offset: number;

  constructor(detail: string, offset: number) {
    super(`${detail} (at byte ${offset})`);
    this.offset = offset;
  }
}

const fail = (detail: string, offset: number): never => {
  throw new SaltileLocateError(detail, offset);
};

// ---------------------------------------------------------------------------
// CBOR (RFC 8949 deterministic profile subset; WIRE section 4)
// ---------------------------------------------------------------------------

type CborValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | readonly CborValue[]
  | CborMap;

/** The profile's maps key by integer only. */
type CborMap = Map<number, CborValue>;

/** A mutable cursor over one self-delimiting CBOR item. */
interface Cursor {
  readonly bytes: Uint8Array;
  /** Offset of `bytes[0]` in the whole response, for error messages. */
  readonly base: number;
  offset: number;
}

const readArgument = (cursor: Cursor, head: number): number => {
  const at = cursor.base + cursor.offset - 1;
  const info = head & 0x1f;
  if (info < 24) {
    return info;
  }
  const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 8;
  if (info > 27) {
    return fail("indefinite lengths are outside the profile", at);
  }
  if (cursor.offset + width > cursor.bytes.length) {
    return fail("CBOR item is truncated", at);
  }
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    value = value * 256 + cursor.bytes[cursor.offset + index]!;
  }
  cursor.offset += width;
  if (!Number.isSafeInteger(value)) {
    return fail("integer exceeds Number.MAX_SAFE_INTEGER", at);
  }
  return value;
};

const readFloat = (cursor: Cursor, width: 4 | 8): number => {
  const at = cursor.base + cursor.offset - 1;
  if (cursor.offset + width > cursor.bytes.length) {
    return fail("CBOR float is truncated", at);
  }
  const view = new DataView(
    cursor.bytes.buffer,
    cursor.bytes.byteOffset + cursor.offset,
    width,
  );
  cursor.offset += width;
  return width === 4 ? view.getFloat32(0) : view.getFloat64(0);
};

const readValue = (cursor: Cursor): CborValue => {
  const at = cursor.base + cursor.offset;
  if (cursor.offset >= cursor.bytes.length) {
    return fail("CBOR item is truncated", at);
  }
  const head = cursor.bytes[cursor.offset]!;
  cursor.offset += 1;
  const major = head >> 5;

  switch (major) {
    case 0: {
      return readArgument(cursor, head);
    }
    case 1: {
      return -1 - readArgument(cursor, head);
    }
    case 2: {
      const length = readArgument(cursor, head);
      const start = cursor.offset;
      cursor.offset += length;
      if (cursor.offset > cursor.bytes.length) {
        return fail("byte string is truncated", at);
      }
      return cursor.bytes.subarray(start, cursor.offset);
    }
    case 3: {
      const length = readArgument(cursor, head);
      const start = cursor.offset;
      cursor.offset += length;
      if (cursor.offset > cursor.bytes.length) {
        return fail("text string is truncated", at);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(
        cursor.bytes.subarray(start, cursor.offset),
      );
    }
    case 4: {
      const length = readArgument(cursor, head);
      const entries: CborValue[] = [];
      for (let index = 0; index < length; index += 1) {
        entries.push(readValue(cursor));
      }
      return entries;
    }
    case 5: {
      const length = readArgument(cursor, head);
      const map: CborMap = new Map();
      let previous = -1;
      for (let index = 0; index < length; index += 1) {
        const key = readValue(cursor);
        if (typeof key !== "number" || !Number.isInteger(key) || key < 0) {
          return fail("map keys must be unsigned integers", at);
        }
        if (key <= previous) {
          return fail("map keys must ascend without duplicates", at);
        }
        previous = key;
        map.set(key, readValue(cursor));
      }
      return map;
    }
    case 6: {
      return fail("tags are outside the profile", at);
    }
    default: {
      if (head === 0xf4) {
        return false;
      }
      if (head === 0xf5) {
        return true;
      }
      if (head === 0xf6) {
        return null;
      }
      if (head === 0xfa) {
        return readFloat(cursor, 4);
      }
      if (head === 0xfb) {
        return readFloat(cursor, 8);
      }
      return fail(
        `simple value 0x${head.toString(16)} is outside the profile`,
        at,
      );
    }
  }
};

/** Decodes one item and requires it to consume the slice exactly. */
const decodeCbor = (bytes: Uint8Array, base: number): CborValue => {
  const cursor: Cursor = { bytes, base, offset: 0 };
  const value = readValue(cursor);
  if (cursor.offset !== bytes.length) {
    return fail("CBOR item leaves trailing bytes", base + cursor.offset);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Envelope (WIRE section 3)
// ---------------------------------------------------------------------------

/** Locate slot table (v1; WIRE section 3). */
export const LocateSlot = {
  Head: 0,
  Positions: 1,
  RowIds: 2,
  TypeMask: 3,
  EdgeSources: 4,
  EdgeTargets: 5,
  EdgeRowIds: 6,
} as const;

const MAGIC = "SALTILEL";
const WIRE_VERSION = 1;
const PREFIX_BYTES = 16;
const SLOT_COUNT = 7;

interface Slot {
  readonly start: number;
  readonly end: number;
}

const align8 = (offset: number): number => Math.ceil(offset / 8) * 8;

const readEnvelope = (
  buffer: ArrayBuffer,
): { slots: readonly (Slot | null)[]; tailOffset: number } => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < PREFIX_BYTES) {
    return fail("response is shorter than the prefix", 0);
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC.charCodeAt(index)) {
      return fail(`magic is not ${MAGIC}`, index);
    }
  }
  const view = new DataView(buffer);
  const version = view.getUint16(8, true);
  if (version !== WIRE_VERSION) {
    return fail(
      `wire version ${version}; this decoder speaks ${WIRE_VERSION}`,
      8,
    );
  }
  if (view.getUint16(10, true) !== 0) {
    return fail("flags must be zero", 10);
  }
  const slotCount = view.getUint16(12, true);
  if (slotCount < SLOT_COUNT) {
    return fail(
      `slotCount ${slotCount} is below the locate table's ${SLOT_COUNT}`,
      12,
    );
  }
  if (view.getUint16(14, true) !== 0) {
    return fail("reserved prefix bytes must be zero", 14);
  }

  const directoryEnd = PREFIX_BYTES + slotCount * 8;
  const slots: (Slot | null)[] = [];
  let cursor = align8(directoryEnd);
  for (let slot = 0; slot < slotCount; slot += 1) {
    const entry = PREFIX_BYTES + slot * 8;
    const start = view.getUint32(entry, true);
    const end = view.getUint32(entry + 4, true);
    if (start === 0 && end === 0) {
      slots.push(null);
      continue;
    }
    if (start !== cursor) {
      return fail(`slot ${slot} starts at ${start}; expected ${cursor}`, entry);
    }
    if (end < start || end > bytes.length) {
      return fail(`slot ${slot} extent (${start}, ${end}) is invalid`, entry);
    }
    slots.push({ start, end });
    cursor = align8(end);
  }
  if (slots[LocateSlot.Head] === null) {
    return fail("HEAD (slot 0) must be present", PREFIX_BYTES);
  }
  return { slots, tailOffset: cursor };
};

// ---------------------------------------------------------------------------
// Locate schema (WIRE section 6b)
// ---------------------------------------------------------------------------

/** The request context a locate response must echo. */
export interface SaltileLocateRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  /** Length of the request's coloredTypeIds; 0 means no TYPE_MASK. */
  readonly coloredTypeIds: number;
  /** Locate DEFAULTS this to true - it is the detail view. */
  readonly includeDetailedData: boolean;
}

/** One simple property value; nested shapes never ship. */
export type SaltilePropertyValue = string | number | boolean | null;

/** Per-node and per-edge detail from the trailer tail. */
export interface SaltileLocateDetail {
  /** Node labels, delivered order. */
  readonly labels: readonly (string | null)[];
  /** Node icons, delivered order. */
  readonly icons: readonly (string | null)[];
  /**
   * Per-node simple properties, delivered order, intern indexes
   * resolved to property base URLs. `null` marks an entity the store
   * no longer serves; an empty record one without simple properties.
   */
  readonly properties: readonly (Readonly<
    Record<string, SaltilePropertyValue>
  > | null)[];
  /** Link-entity labels, edge order. */
  readonly linkLabels: readonly (string | null)[];
  readonly linkIcons: readonly (string | null)[];
  readonly linkTypeLabels: readonly (string | null)[];
  readonly linkTypeIcons: readonly (string | null)[];
}

/** One decoded locate response; typed arrays are views, not copies. */
export interface DecodedSaltileLocate {
  /** Delivered node count; index 0 is the SOURCE. */
  readonly count: number;
  /** The source's first visible zoom. */
  readonly zoom: number;
  /** The source's tile at that zoom - the fly-to target. */
  readonly cell: { readonly z: number; readonly x: number; readonly y: number };
  /** Delivered edge count. */
  readonly edgesCount: number;
  /** False when the locate edge cap truncated the subgraph. */
  readonly complete: boolean;
  /** Wire-frame xy pairs, delivered order (source first). */
  readonly positions: Float32Array;
  /** Node row ids, delivered order (source first). */
  readonly rowIds: Uint32Array;
  /**
   * Per-node type masks, `ceil(coloredTypeIds / 8)` bytes each,
   * LSB-first; null when the request carried no coloredTypeIds.
   */
  readonly typeMask: Uint8Array | null;
  /** Source node row ids, edge order. */
  readonly sources: Uint32Array;
  /** Target node row ids, edge order. */
  readonly targets: Uint32Array;
  /** Edge row ids, edge order. */
  readonly edgeRowIds: Uint32Array;
  readonly detail: SaltileLocateDetail | null;
}

const headKeys = {
  generation: 0,
  variant: 1,
  count: 2,
  zoom: 3,
  cell: 4,
  edges: 5,
  complete: 6,
  trailer: 7,
} as const;

const requireUint = (
  map: CborMap,
  key: number,
  name: string,
  at: number,
): number => {
  const value = map.get(key);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail(`HEAD ${name} must be an unsigned integer`, at);
  }
  return value;
};

const requireBool = (
  map: CborMap,
  key: number,
  name: string,
  at: number,
): boolean => {
  const value = map.get(key);
  if (typeof value !== "boolean") {
    return fail(`HEAD ${name} must be a boolean`, at);
  }
  return value;
};

const isNullableStrings = (
  value: CborValue | undefined,
): value is readonly (string | null)[] =>
  Array.isArray(value) &&
  value.every((entry) => entry === null || typeof entry === "string");

const nullableStrings = (
  map: CborMap,
  key: number,
  name: string,
  count: number,
  at: number,
): readonly (string | null)[] => {
  const value = map.get(key);
  if (!isNullableStrings(value)) {
    return fail(`TRAILER ${name} entries must be strings or null`, at);
  }
  if (value.length !== count) {
    return fail(`TRAILER ${name} must carry exactly ${count} entries`, at);
  }
  return value;
};

const readDetail = (
  payload: Uint8Array,
  nodes: number,
  edges: number,
  at: number,
): SaltileLocateDetail => {
  const value = decodeCbor(payload, at);
  if (!(value instanceof Map)) {
    return fail("TRAILER must be a map", at);
  }
  for (const key of value.keys()) {
    if (key < 0 || key > 7) {
      return fail(`TRAILER carries unknown key ${key}`, at);
    }
  }

  const table = value.get(2);
  if (
    !Array.isArray(table) ||
    !table.every((name) => typeof name === "string")
  ) {
    return fail("TRAILER propertyNames must be a text array", at);
  }
  const names = table as readonly string[];
  // The law is BYTEWISE UTF-8 order; UTF-8 preserves code point
  // order, so comparing code points is exact (plain < on JS strings
  // would compare UTF-16 code units, which diverges above U+FFFF).
  const encoder = new TextEncoder();
  const encoded = names.map((name) => encoder.encode(name));
  for (let index = 1; index < encoded.length; index += 1) {
    if (!bytewiseLess(encoded[index - 1]!, encoded[index]!)) {
      return fail("propertyNames must be bytewise-sorted and deduplicated", at);
    }
  }

  const rawProperties = value.get(3);
  if (!Array.isArray(rawProperties) || rawProperties.length !== nodes) {
    return fail(`TRAILER properties must carry exactly ${nodes} entries`, at);
  }
  const properties = rawProperties.map((entry) => {
    if (entry === null) {
      return null;
    }
    if (!(entry instanceof Map)) {
      return fail("a properties entry must be a map or null", at);
    }
    const resolved: Record<string, SaltilePropertyValue> = {};
    for (const [index, propertyValue] of entry) {
      const name = names[index];
      if (name === undefined) {
        return fail(
          `property index ${index} lies outside the intern table`,
          at,
        );
      }
      if (
        propertyValue !== null &&
        typeof propertyValue !== "string" &&
        typeof propertyValue !== "number" &&
        typeof propertyValue !== "boolean"
      ) {
        return fail("property values are simple only", at);
      }
      resolved[name] = propertyValue;
    }
    return resolved;
  });

  return {
    labels: nullableStrings(value, 0, "labels", nodes, at),
    icons: nullableStrings(value, 1, "icons", nodes, at),
    properties,
    linkLabels: nullableStrings(value, 4, "linkLabels", edges, at),
    linkIcons: nullableStrings(value, 5, "linkIcons", edges, at),
    linkTypeLabels: nullableStrings(value, 6, "linkTypeLabels", edges, at),
    linkTypeIcons: nullableStrings(value, 7, "linkTypeIcons", edges, at),
  };
};

/** Strict bytewise less-than over two UTF-8 encodings. */
const bytewiseLess = (left: Uint8Array, right: Uint8Array): boolean => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index]! !== right[index]!) {
      return left[index]! < right[index]!;
    }
  }
  return left.length < right.length;
};

const requireSlot = (
  slots: readonly (Slot | null)[],
  index: number,
  name: string,
  byteLength: number,
): Slot => {
  const slot = slots[index];
  if (slot === null || slot === undefined) {
    return fail(
      `${name} (slot ${index}) must be present`,
      PREFIX_BYTES + index * 8,
    );
  }
  if (slot.end - slot.start !== byteLength) {
    return fail(
      `${name} carries ${slot.end - slot.start} bytes; expected ${byteLength}`,
      slot.start,
    );
  }
  return slot;
};

/**
 * Decodes one locate response against the request that produced it.
 *
 * @throws {@link SaltileLocateError} on envelope, CBOR, schema, echo,
 *   or count violations.
 */
export const decodeSaltileLocate = (
  buffer: ArrayBuffer,
  request: SaltileLocateRequest,
): DecodedSaltileLocate => {
  if (request.generation.length !== 32) {
    fail(
      `request generation is ${request.generation.length} bytes; expected 32`,
      0,
    );
  }

  const { slots, tailOffset } = readEnvelope(buffer);
  const bytes = new Uint8Array(buffer);

  const headSlot = slots[LocateSlot.Head]!;
  const at = headSlot.start;
  const head = decodeCbor(bytes.subarray(headSlot.start, headSlot.end), at);
  if (!(head instanceof Map)) {
    return fail("HEAD must be a map", at);
  }
  for (const key of head.keys()) {
    if (key < 0 || key > 7) {
      return fail(`HEAD carries unknown key ${key}`, at);
    }
  }

  const generation = head.get(headKeys.generation);
  if (!(generation instanceof Uint8Array) || generation.length !== 32) {
    return fail("HEAD generation must be 32 bytes", at);
  }
  for (let index = 0; index < 32; index += 1) {
    if (generation[index] !== request.generation[index]) {
      return fail("HEAD generation does not echo the request", at);
    }
  }
  const variant = requireUint(head, headKeys.variant, "variant", at);
  if (variant !== request.variant) {
    return fail(`HEAD variant ${variant} does not echo ${request.variant}`, at);
  }

  const count = requireUint(head, headKeys.count, "count", at);
  const zoom = requireUint(head, headKeys.zoom, "zoom", at);
  const rawCell = head.get(headKeys.cell);
  if (!Array.isArray(rawCell) || rawCell.length !== 3) {
    return fail("HEAD cell must be [z, x, y]", at);
  }
  const [z, x, y] = rawCell;
  if (
    typeof z !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    z !== zoom
  ) {
    return fail("HEAD cell must carry uints with z equal to zoom", at);
  }
  const edgesCount = requireUint(head, headKeys.edges, "edges", at);
  const complete = requireBool(head, headKeys.complete, "complete", at);
  const trailerDeclared = requireBool(head, headKeys.trailer, "trailer", at);
  if (trailerDeclared !== request.includeDetailedData) {
    return fail(
      `HEAD trailer is ${trailerDeclared}; the request expects ${request.includeDetailedData}`,
      at,
    );
  }

  const positionsSlot = requireSlot(
    slots,
    LocateSlot.Positions,
    "POSITIONS",
    count * 8,
  );
  const rowIdsSlot = requireSlot(
    slots,
    LocateSlot.RowIds,
    "ROW_IDS",
    count * 4,
  );
  const stride = Math.ceil(request.coloredTypeIds / 8);
  let typeMask: Uint8Array | null = null;
  if (request.coloredTypeIds > 0) {
    const maskSlot = requireSlot(
      slots,
      LocateSlot.TypeMask,
      "TYPE_MASK",
      count * stride,
    );
    typeMask = bytes.subarray(maskSlot.start, maskSlot.end);
  } else if (slots[LocateSlot.TypeMask] !== null) {
    return fail(
      "TYPE_MASK must be absent without coloredTypeIds",
      PREFIX_BYTES + 3 * 8,
    );
  }
  const sourcesSlot = requireSlot(
    slots,
    LocateSlot.EdgeSources,
    "EDGE_SOURCES",
    edgesCount * 4,
  );
  const targetsSlot = requireSlot(
    slots,
    LocateSlot.EdgeTargets,
    "EDGE_TARGETS",
    edgesCount * 4,
  );
  const edgeRowsSlot = requireSlot(
    slots,
    LocateSlot.EdgeRowIds,
    "EDGE_ROW_IDS",
    edgesCount * 4,
  );

  let detail: SaltileLocateDetail | null = null;
  if (trailerDeclared) {
    if (tailOffset >= buffer.byteLength) {
      return fail(
        "TRAILER is declared but the response carries no tail",
        tailOffset,
      );
    }
    detail = readDetail(
      bytes.subarray(tailOffset),
      count,
      edgesCount,
      tailOffset,
    );
  } else if (tailOffset !== buffer.byteLength) {
    return fail(
      "response carries a tail but HEAD declares no trailer",
      tailOffset,
    );
  }

  return {
    count,
    zoom,
    cell: { z, x, y },
    edgesCount,
    complete,
    positions: new Float32Array(buffer, positionsSlot.start, count * 2),
    rowIds: new Uint32Array(buffer, rowIdsSlot.start, count),
    typeMask,
    sources: new Uint32Array(buffer, sourcesSlot.start, edgesCount),
    targets: new Uint32Array(buffer, targetsSlot.start, edgesCount),
    edgeRowIds: new Uint32Array(buffer, edgeRowsSlot.start, edgesCount),
    detail,
  };
};
