/**
 * Locate-kind decoder for the SALTILE wire (normative schema:
 * `SPEC-ADDENDUM-WIRE.md` sections 3, 4, and 6b). Layers over the
 * envelope reader like {@link decodeSaltileTile}/{@link
 * decodeSaltileEdges}: validates the HEAD schema and its echo of the
 * request, exposes the node/edge columns as typed-array views over the
 * response buffer (never copied), and resolves the detail trailer.
 *
 * A locate response spotlights one entity: the source is delivered
 * first, then its nearest neighbours (ascending by distance then node
 * row id), with the edges among the delivered set riding the edge
 * columns. The HEAD also carries the source's first visible zoom and
 * its tile there — the client's fly-to target.
 *
 * Two shapes the tile/edges trailers never carry appear here (both
 * handled by the shared {@link decodeCbor}): negative integers, and
 * double-precision floats for property values. Property names are
 * interned (WIRE 6b) — the trailer's name table is bytewise-sorted and
 * deduplicated, and each per-node property map keys by uint index into
 * it; this decoder validates those laws and returns resolved
 * `Record<name, value>` objects.
 */

import { decodeCbor, type CborValue } from "./cbor";
import {
  expectEqual,
  fail,
  GENERATION_BYTES,
  isCborArray,
  isCborMap,
  isNullableStringArray,
  isUint,
  requireBool,
  requireGenerationEcho,
  requireSlot,
  requireUint,
} from "./schema";
import { LocateSlot, readEnvelope } from "./wire";

/** The request context a locate response must echo. */
export interface SaltileLocateRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  /** Count of colored type ids sent; 0 means TYPE_MASK is absent. */
  readonly coloredTypeIdCount: number;
  /** Locate DEFAULTS this to true — it is the detail view. */
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
   * Per-node simple properties, delivered order, intern indices resolved
   * to property base URLs. `null` marks an entity the store no longer
   * serves; an empty record one without simple properties.
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

/** The source's first visible zoom and its tile there — the fly-to target. */
export interface SaltileLocateCell {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** One decoded locate response; typed arrays are views, not copies. */
export interface DecodedSaltileLocate {
  /** Delivered node count; index 0 is the SOURCE. */
  readonly count: number;
  /** The source's first visible zoom. */
  readonly zoom: number;
  /** The source's tile at that zoom — the fly-to target. */
  readonly cell: SaltileLocateCell;
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

/** HEAD keys of the locate schema (section 6b). */
const locateHeadKeys = {
  generation: 0,
  variant: 1,
  count: 2,
  zoom: 3,
  cell: 4,
  edges: 5,
  complete: 6,
  trailer: 7,
} as const;

const knownHeadKeys = new Set<number>(Object.values(locateHeadKeys));

/** TRAILER keys of the locate schema (section 6b). */
const trailerKeys = {
  labels: 0,
  icons: 1,
  propertyNames: 2,
  properties: 3,
  linkLabels: 4,
  linkIcons: 5,
  linkTypeLabels: 6,
  linkTypeIcons: 7,
} as const;

const knownTrailerKeys = new Set<number>(Object.values(trailerKeys));

const isPropertyValue = (
  value: CborValue | undefined,
): value is SaltilePropertyValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/** Strict bytewise less-than over two UTF-8 encodings. */
const bytewiseLess = (left: Uint8Array, right: Uint8Array): boolean => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return left[index]! < right[index]!;
    }
  }
  return left.length < right.length;
};

const nullableStrings = (
  map: ReadonlyMap<number, CborValue>,
  key: number,
  name: string,
  count: number,
  offset: number,
): readonly (string | null)[] => {
  const value = map.get(key);
  if (!isNullableStringArray(value)) {
    return fail(`TRAILER ${name} entries must be strings or null`, offset);
  }
  if (value.length !== count) {
    return fail(`TRAILER ${name} must carry exactly ${count} entries`, offset);
  }
  return value;
};

/**
 * Reads the interned property-name table (bytewise-sorted, deduplicated
 * per WIRE 6b) and resolves each per-node property map's uint indices
 * back to the names they intern.
 */
const readProperties = (
  map: ReadonlyMap<number, CborValue>,
  nodes: number,
  offset: number,
): readonly (Readonly<Record<string, SaltilePropertyValue>> | null)[] => {
  const table = map.get(trailerKeys.propertyNames);
  if (!isCborArray(table) || !table.every((name) => typeof name === "string")) {
    return fail("TRAILER propertyNames must be a text array", offset);
  }
  const names = table;
  // The law is bytewise UTF-8 order; comparing the encoded bytes is exact
  // (a plain `<` on JS strings compares UTF-16 code units, which diverges
  // above U+FFFF).
  const encoder = new TextEncoder();
  const encoded = names.map((name) => encoder.encode(name));
  for (let index = 1; index < encoded.length; index += 1) {
    if (!bytewiseLess(encoded[index - 1]!, encoded[index]!)) {
      return fail(
        "TRAILER propertyNames must be bytewise-sorted and deduplicated",
        offset,
      );
    }
  }

  const raw = map.get(trailerKeys.properties);
  if (!isCborArray(raw) || raw.length !== nodes) {
    return fail(
      `TRAILER properties must carry exactly ${nodes} entries`,
      offset,
    );
  }
  return raw.map((entry) => {
    if (entry === null) {
      return null;
    }
    if (!isCborMap(entry)) {
      return fail("a properties entry must be a map or null", offset);
    }
    const resolved: Record<string, SaltilePropertyValue> = {};
    for (const [index, value] of entry) {
      const name = names[index];
      if (name === undefined) {
        return fail(
          `property index ${index} lies outside the intern table`,
          offset,
        );
      }
      if (!isPropertyValue(value)) {
        return fail("property values are simple only", offset);
      }
      resolved[name] = value;
    }
    return resolved;
  });
};

const readDetail = (
  payload: Uint8Array,
  nodes: number,
  edges: number,
  offset: number,
): SaltileLocateDetail => {
  const value = decodeCbor(payload);
  if (!isCborMap(value)) {
    return fail("TRAILER must be a map", offset);
  }
  for (const key of value.keys()) {
    if (!knownTrailerKeys.has(key)) {
      return fail(`TRAILER carries unknown key ${key}`, offset);
    }
  }

  return {
    labels: nullableStrings(value, trailerKeys.labels, "labels", nodes, offset),
    icons: nullableStrings(value, trailerKeys.icons, "icons", nodes, offset),
    properties: readProperties(value, nodes, offset),
    linkLabels: nullableStrings(
      value,
      trailerKeys.linkLabels,
      "linkLabels",
      edges,
      offset,
    ),
    linkIcons: nullableStrings(
      value,
      trailerKeys.linkIcons,
      "linkIcons",
      edges,
      offset,
    ),
    linkTypeLabels: nullableStrings(
      value,
      trailerKeys.linkTypeLabels,
      "linkTypeLabels",
      edges,
      offset,
    ),
    linkTypeIcons: nullableStrings(
      value,
      trailerKeys.linkTypeIcons,
      "linkTypeIcons",
      edges,
      offset,
    ),
  };
};

/**
 * Decodes one locate response against the request that produced it.
 *
 * @throws {@link SaltileWireError} on envelope, schema, echo, or count
 *   violations; `SaltileCborError` on CBOR profile violations.
 */
export const decodeSaltileLocate = (
  buffer: ArrayBuffer,
  request: SaltileLocateRequest,
): DecodedSaltileLocate => {
  if (request.generation.length !== GENERATION_BYTES) {
    fail(
      `request generation is ${request.generation.length} bytes; expected ${GENERATION_BYTES}`,
      0,
    );
  }

  const envelope = readEnvelope(buffer, "locate");
  const bytes = new Uint8Array(buffer);

  const headSlot = envelope.slots[LocateSlot.Head]!;
  const headOffset = headSlot.start;
  const head = decodeCbor(bytes.subarray(headSlot.start, headSlot.end));
  if (!isCborMap(head)) {
    return fail("HEAD must be a map", headOffset);
  }
  for (const key of head.keys()) {
    if (!knownHeadKeys.has(key)) {
      return fail(`HEAD carries unknown key ${key}`, headOffset);
    }
  }

  requireGenerationEcho(head, request.generation, headOffset);
  expectEqual(
    requireUint(head, locateHeadKeys.variant, "variant", headOffset),
    request.variant,
    "variant",
    headOffset,
  );

  const count = requireUint(head, locateHeadKeys.count, "count", headOffset);
  const zoom = requireUint(head, locateHeadKeys.zoom, "zoom", headOffset);
  const rawCell = head.get(locateHeadKeys.cell);
  if (!isCborArray(rawCell) || rawCell.length !== 3) {
    return fail("HEAD cell must be [z, x, y]", headOffset);
  }
  const [z, x, y] = rawCell;
  if (!isUint(z) || !isUint(x) || !isUint(y) || z !== zoom) {
    return fail("HEAD cell must carry uints with z equal to zoom", headOffset);
  }
  const edgesCount = requireUint(
    head,
    locateHeadKeys.edges,
    "edges",
    headOffset,
  );
  const complete = requireBool(
    head,
    locateHeadKeys.complete,
    "complete",
    headOffset,
  );
  const trailerDeclared = requireBool(
    head,
    locateHeadKeys.trailer,
    "trailer",
    headOffset,
  );
  if (trailerDeclared !== request.includeDetailedData) {
    return fail(
      `HEAD trailer is ${trailerDeclared}; the request expects ${request.includeDetailedData}`,
      headOffset,
    );
  }

  const positionsSlot = requireSlot(
    envelope.slots,
    LocateSlot.Positions,
    "POSITIONS",
    count * 8,
    buffer.byteLength,
  );
  const rowIdsSlot = requireSlot(
    envelope.slots,
    LocateSlot.RowIds,
    "ROW_IDS",
    count * 4,
    buffer.byteLength,
  );

  const stride = Math.ceil(request.coloredTypeIdCount / 8);
  let typeMask: Uint8Array | null = null;
  if (request.coloredTypeIdCount > 0) {
    const maskSlot = requireSlot(
      envelope.slots,
      LocateSlot.TypeMask,
      "TYPE_MASK",
      count * stride,
      buffer.byteLength,
    );
    typeMask = bytes.subarray(maskSlot.start, maskSlot.end);
  } else if (envelope.slots[LocateSlot.TypeMask] !== null) {
    return fail("TYPE_MASK must be absent without coloredTypeIds", headOffset);
  }

  const sourcesSlot = requireSlot(
    envelope.slots,
    LocateSlot.EdgeSources,
    "EDGE_SOURCES",
    edgesCount * 4,
    buffer.byteLength,
  );
  const targetsSlot = requireSlot(
    envelope.slots,
    LocateSlot.EdgeTargets,
    "EDGE_TARGETS",
    edgesCount * 4,
    buffer.byteLength,
  );
  const edgeRowsSlot = requireSlot(
    envelope.slots,
    LocateSlot.EdgeRowIds,
    "EDGE_ROW_IDS",
    edgesCount * 4,
    buffer.byteLength,
  );

  let detail: SaltileLocateDetail | null = null;
  if (trailerDeclared) {
    if (envelope.tailOffset >= buffer.byteLength) {
      return fail(
        "TRAILER is declared but the response carries no tail",
        envelope.tailOffset,
      );
    }
    detail = readDetail(
      bytes.subarray(envelope.tailOffset),
      count,
      edgesCount,
      envelope.tailOffset,
    );
  } else if (envelope.tailOffset !== buffer.byteLength) {
    return fail(
      "response carries a tail but HEAD declares no trailer",
      envelope.tailOffset,
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
