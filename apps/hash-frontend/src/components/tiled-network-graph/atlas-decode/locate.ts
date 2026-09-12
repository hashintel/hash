/**
 * Locate-kind decoder for the SALTILE wire (normative contract:
 * `libs/@local/graph/atlas/docs/wire.md` sections 3, 4, 5, and 8).
 * Layers over the envelope reader like {@link decodeSaltileTile}/
 * {@link decodeSaltileEdges}: validates the HEAD schema and its echo
 * of the request, exposes the node/edge columns as typed-array views
 * over the response buffer (never copied), and parses the trailer.
 *
 * A locate response answers one entity's ego-graph: the source is
 * delivered first, then the delivered edges' partners (both
 * directions, ascending wire row id), with every edge incident to the
 * source riding the edge columns in ascending `EDGE_IDS` bytes - the
 * link entity's 32-byte identity IS the edge's identity; edges carry
 * no wire id. The HEAD carries the source's upstream entity id (the
 * by-row flow's identity answer), its first visible zoom and tile
 * (the fly-to target), and the two completeness verdicts over the
 * source's types and properties.
 *
 * Locate is the detail view: the trailer is ALWAYS present. Its two
 * intern tables (`typeTable`, `propertyTable`) come first, and every
 * type or property reference in the node and link arrays is a uint
 * index into its table; this decoder validates the intern laws
 * (bytewise-sorted, deduplicated, indexes in range, property keys
 * ascending) and returns resolved URL-keyed objects.
 */

import { decodeCbor, type CborValue } from "./cbor";
import {
  ENTITY_ID_BYTES,
  expectEqual,
  fail,
  formatEntityId,
  GENERATION_BYTES,
  isCborArray,
  isCborMap,
  isNullableStringArray,
  isUint,
  readBitmask,
  readEntityIdColumn,
  readInternTable,
  requireBool,
  requireGenerationEcho,
  requireSlot,
  requireUint,
} from "./schema";
import { LocateSlot, readEnvelope } from "./wire";

import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** The request context a locate response must echo. */
export interface SaltileLocateRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  /** Count of colored type ids sent; 0 means TYPE_MASK is absent. */
  readonly coloredTypeIdCount: number;
}

/** One simple property value; nested shapes never ship. */
export type SaltilePropertyValue = string | number | boolean | null;

/** A property map resolved through the intern table, keyed by base URL. */
export type SaltileProperties = Readonly<Record<BaseUrl, SaltilePropertyValue>>;

/** Node and link detail from the always-present trailer tail. */
export interface SaltileLocateDetail {
  /** The type intern table: every referenced versioned type URL once. */
  readonly typeTable: readonly VersionedUrl[];
  /** The property intern table: every surviving property base URL once. */
  readonly propertyTable: readonly BaseUrl[];
  /** Node labels, delivered order. */
  readonly labels: readonly (string | null)[];
  /**
   * Each node's representative type as a versioned URL, delivered order.
   *
   * `null` marks a node the store no longer serves or records no types
   * for.
   */
  readonly typeIds: readonly (VersionedUrl | null)[];
  /**
   * The source's capped simple properties.
   *
   * `null` marks a store-absent source. Neighbour nodes ship no
   * properties; their detail is one locate away.
   */
  readonly properties: SaltileProperties | null;
  /** Link-entity labels, edge order. */
  readonly linkLabels: readonly (string | null)[];
  /**
   * Each link's direct types as versioned URLs, edge order.
   *
   * Canonical order is preserved and the list is capped; an empty list
   * marks a store-absent link.
   */
  readonly linkTypeIds: readonly (readonly VersionedUrl[])[];
  /** Bit e = edge e's type list is the link's whole direct set. */
  readonly linkTypeIdsComplete: readonly boolean[];
  /** Per-link capped simple properties; `null` = store-absent link. */
  readonly linkProperties: readonly (SaltileProperties | null)[];
  /** Bit e = edge e's property map is the link entity's whole set. */
  readonly linkPropertiesComplete: readonly boolean[];
}

/** The source's first visible zoom and its tile there - the fly-to target. */
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
  /** The source's tile at that zoom - the fly-to target. */
  readonly cell: SaltileLocateCell;
  /** Delivered edge count. */
  readonly edgesCount: number;
  /** False when the locate edge cap truncated the subgraph. */
  readonly complete: boolean;
  /** The source's upstream entity identity. */
  readonly entityId: EntityId;
  /** The request's coloredTypeIds cover every direct type of the source. */
  readonly typeIdsComplete: boolean;
  /** The trailer's source property map is the entity's whole set. */
  readonly propertiesComplete: boolean;
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
  /** Link-entity identities, edge order (ascending identity bytes). */
  readonly edgeIds: readonly EntityId[];
  /** Trailer detail; locate is the detail view, always present. */
  readonly detail: SaltileLocateDetail;
}

/** HEAD keys of the locate schema (wire.md section 8). */
const locateHeadKeys = {
  generation: 0,
  variant: 1,
  count: 2,
  zoom: 3,
  cell: 4,
  edges: 5,
  complete: 6,
  entityId: 7,
  typeIdsComplete: 8,
  propertiesComplete: 9,
} as const;

const knownHeadKeys = new Set<number>(Object.values(locateHeadKeys));

/** TRAILER keys of the locate schema (wire.md section 8). */
const trailerKeys = {
  typeTable: 0,
  propertyTable: 1,
  labels: 2,
  typeIds: 3,
  properties: 4,
  linkLabels: 5,
  linkTypeIds: 6,
  linkTypeIdsComplete: 7,
  linkProperties: 8,
  linkPropertiesComplete: 9,
} as const;

const knownTrailerKeys = new Set<number>(Object.values(trailerKeys));

const isPropertyValue = (
  value: CborValue | undefined,
): value is SaltilePropertyValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

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
 * Resolves one wire property map (propertyTable index -> simple value,
 * keys ascending) into a base-URL-keyed object; `null` passes through.
 */
const resolveProperties = (
  entry: CborValue | undefined,
  table: readonly BaseUrl[],
  name: string,
  offset: number,
): SaltileProperties | null => {
  if (entry === null || entry === undefined) {
    return null;
  }
  if (!isCborMap(entry)) {
    return fail(`${name} must be a map or null`, offset);
  }
  const resolved: Record<BaseUrl, SaltilePropertyValue> = {};
  let previous = -1;
  for (const [index, value] of entry) {
    if (!isUint(index) || index >= table.length) {
      return fail(
        `${name} index ${index} lies outside the intern table`,
        offset,
      );
    }
    if (index <= previous) {
      return fail(`${name} keys must ascend`, offset);
    }
    previous = index;
    if (!isPropertyValue(value)) {
      return fail(`${name} values are simple only`, offset);
    }
    resolved[table[index]!] = value;
  }
  return resolved;
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

  // The wire contract pins typeTable entries as versioned type URLs and
  // propertyTable entries as property base URLs.
  const typeTable = readInternTable(
    value.get(trailerKeys.typeTable),
    "typeTable",
    offset,
  ) as readonly VersionedUrl[];
  const propertyTable = readInternTable(
    value.get(trailerKeys.propertyTable),
    "propertyTable",
    offset,
  ) as readonly BaseUrl[];

  const rawTypeIds = value.get(trailerKeys.typeIds);
  if (!isCborArray(rawTypeIds) || rawTypeIds.length !== nodes) {
    return fail(`TRAILER typeIds must carry exactly ${nodes} entries`, offset);
  }
  const typeIds = rawTypeIds.map((entry) => {
    if (entry === null) {
      return null;
    }
    if (!isUint(entry) || entry >= typeTable.length) {
      return fail(
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- diagnostic for a malformed, possibly non-numeric CBOR entry
        `typeIds entry ${String(entry)} lies outside the intern table`,
        offset,
      );
    }
    return typeTable[entry]!;
  });

  const rawLinkTypeIds = value.get(trailerKeys.linkTypeIds);
  if (!isCborArray(rawLinkTypeIds) || rawLinkTypeIds.length !== edges) {
    return fail(
      `TRAILER linkTypeIds must carry exactly ${edges} entries`,
      offset,
    );
  }
  const linkTypeIds = rawLinkTypeIds.map((entry) => {
    if (!isCborArray(entry)) {
      return fail("a linkTypeIds entry must be an index array", offset);
    }
    return entry.map((index) => {
      if (!isUint(index) || index >= typeTable.length) {
        return fail(
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- diagnostic for a malformed, possibly non-numeric CBOR index
          `linkTypeIds index ${String(index)} lies outside the intern table`,
          offset,
        );
      }
      return typeTable[index]!;
    });
  });

  const rawLinkProperties = value.get(trailerKeys.linkProperties);
  if (!isCborArray(rawLinkProperties) || rawLinkProperties.length !== edges) {
    return fail(
      `TRAILER linkProperties must carry exactly ${edges} entries`,
      offset,
    );
  }
  const linkProperties = rawLinkProperties.map((entry) =>
    resolveProperties(entry, propertyTable, "a linkProperties entry", offset),
  );

  return {
    typeTable,
    propertyTable,
    labels: nullableStrings(value, trailerKeys.labels, "labels", nodes, offset),
    typeIds,
    properties: resolveProperties(
      value.has(trailerKeys.properties)
        ? value.get(trailerKeys.properties)
        : fail("TRAILER properties (key 4) is required", offset),
      propertyTable,
      "properties",
      offset,
    ),
    linkLabels: nullableStrings(
      value,
      trailerKeys.linkLabels,
      "linkLabels",
      edges,
      offset,
    ),
    linkTypeIds,
    linkTypeIdsComplete: readBitmask(
      value.get(trailerKeys.linkTypeIdsComplete),
      edges,
      "linkTypeIdsComplete",
      offset,
    ),
    linkProperties,
    linkPropertiesComplete: readBitmask(
      value.get(trailerKeys.linkPropertiesComplete),
      edges,
      "linkPropertiesComplete",
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

  const rawEntityId = head.get(locateHeadKeys.entityId);
  if (
    !(rawEntityId instanceof Uint8Array) ||
    rawEntityId.length !== ENTITY_ID_BYTES
  ) {
    return fail(
      "HEAD entityId (key 7) must be a 32-byte identity record",
      headOffset,
    );
  }
  const typeIdsComplete = requireBool(
    head,
    locateHeadKeys.typeIdsComplete,
    "typeIdsComplete",
    headOffset,
  );
  const propertiesComplete = requireBool(
    head,
    locateHeadKeys.propertiesComplete,
    "propertiesComplete",
    headOffset,
  );

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
  const edgeIdsSlot = requireSlot(
    envelope.slots,
    LocateSlot.EdgeIds,
    "EDGE_IDS",
    edgesCount * ENTITY_ID_BYTES,
    buffer.byteLength,
  );
  const edgeIdRecords = readEntityIdColumn(
    bytes.subarray(edgeIdsSlot.start, edgeIdsSlot.end),
    edgesCount,
    "EDGE_IDS",
    edgeIdsSlot.start,
  );

  // Locate is the detail view: the trailer is always present (wire.md
  // section 8) - no HEAD key declares it.
  if (envelope.tailOffset >= buffer.byteLength) {
    return fail(
      "locate requires a trailer tail; the response carries none",
      envelope.tailOffset,
    );
  }
  const detail = readDetail(
    bytes.subarray(envelope.tailOffset),
    count,
    edgesCount,
    envelope.tailOffset,
  );

  return {
    count,
    zoom,
    cell: { z, x, y },
    edgesCount,
    complete,
    entityId: formatEntityId(rawEntityId),
    typeIdsComplete,
    propertiesComplete,
    positions: new Float32Array(buffer, positionsSlot.start, count * 2),
    rowIds: new Uint32Array(buffer, rowIdsSlot.start, count),
    typeMask,
    sources: new Uint32Array(buffer, sourcesSlot.start, edgesCount),
    targets: new Uint32Array(buffer, targetsSlot.start, edgesCount),
    edgeIds: edgeIdRecords.map((record) => formatEntityId(record)),
    detail,
  };
};
