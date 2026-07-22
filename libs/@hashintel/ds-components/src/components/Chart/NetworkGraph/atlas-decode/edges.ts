/**
 * Edges-kind decoder for the SALTILE wire (normative contract:
 * `libs/@local/graph/atlas/docs/wire.md` sections 3, 5, and 7). Layers
 * over the envelope reader: validates the HEAD schema and its echo of
 * the request, exposes the endpoint columns as typed-array views over
 * the response buffer, and reads `EDGE_IDS` - 32-byte link-entity
 * identity records in ascending byte order, the edge's identity on
 * every binary surface (edges carry no wire id of their own).
 *
 * Delivery-set membership (sources/targets referencing node rows the
 * client holds) is a server-side contract, not a decoder walk.
 */

import { decodeCbor } from "./cbor";
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
  readEntityIdColumn,
  readInternTable,
  requireBool,
  requireGenerationEcho,
  requireSlot,
  requireUint,
} from "./schema";
import { EdgesSlot, readEnvelope } from "./wire";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** The request context an edges response must echo. */
export interface SaltileEdgesRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  readonly includeDetailedData: boolean;
}

/**
 * Per-edge detail from the trailer tail, edge order.
 *
 * The trailer ships type references: `linkTypeIds` entries are
 * versioned type URLs resolved through the trailer's intern table, and
 * label and icon rendering for a type is the client's own metadata.
 */
export interface SaltileEdgesDetail {
  /** The type intern table: every referenced versioned type URL once. */
  readonly typeTable: readonly VersionedUrl[];
  /** Link-entity labels, edge order. */
  readonly linkLabels: readonly (string | null)[];
  /**
   * Each link's first direct type as a versioned URL, edge order.
   *
   * `null` marks a link the store no longer serves or records no types
   * for.
   */
  readonly linkTypeIds: readonly (VersionedUrl | null)[];
}

/** One decoded edges response; typed arrays are views, not copies. */
export interface DecodedSaltileEdges {
  readonly count: number;
  /** False when the rank-ordered cap truncated the set. */
  readonly complete: boolean;
  /** Source node row ids, edge order. */
  readonly sources: Uint32Array;
  /** Target node row ids, edge order. */
  readonly targets: Uint32Array;
  /** Link-entity identities, edge order (ascending identity bytes). */
  readonly edgeIds: readonly EntityId[];
  readonly detail: SaltileEdgesDetail | null;
}

/** HEAD keys of the edges schema (wire.md section 7). */
const edgesHeadKeys = {
  generation: 0,
  variant: 1,
  count: 2,
  complete: 3,
  trailer: 4,
} as const;

const knownHeadKeys = new Set<number>(Object.values(edgesHeadKeys));

/** TRAILER keys of the edges schema (wire.md section 7). */
const trailerKeys = {
  typeTable: 0,
  linkLabels: 1,
  linkTypeIds: 2,
} as const;

const knownTrailerKeys = new Set<number>(Object.values(trailerKeys));

const readDetail = (
  payload: Uint8Array,
  count: number,
  offset: number,
): SaltileEdgesDetail => {
  const value = decodeCbor(payload);
  if (!isCborMap(value)) {
    return fail("TRAILER must be a map", offset);
  }
  for (const key of value.keys()) {
    if (!knownTrailerKeys.has(key)) {
      return fail(`TRAILER carries unknown key ${key}`, offset);
    }
  }

  // The wire contract pins the table entries as versioned type URLs.
  const typeTable = readInternTable(
    value.get(trailerKeys.typeTable),
    "typeTable",
    offset,
  ) as readonly VersionedUrl[];

  const linkLabels = value.get(trailerKeys.linkLabels);
  if (!isNullableStringArray(linkLabels) || linkLabels.length !== count) {
    return fail(
      `TRAILER linkLabels must carry exactly ${count} strings or nulls`,
      offset,
    );
  }

  const rawTypeIds = value.get(trailerKeys.linkTypeIds);
  if (!isCborArray(rawTypeIds) || rawTypeIds.length !== count) {
    return fail(
      `TRAILER linkTypeIds must carry exactly ${count} entries`,
      offset,
    );
  }
  const linkTypeIds = rawTypeIds.map((entry) => {
    if (entry === null) {
      return null;
    }
    if (!isUint(entry) || entry >= typeTable.length) {
      return fail(
        `linkTypeIds entry ${String(entry)} lies outside the intern table`,
        offset,
      );
    }
    return typeTable[entry]!;
  });

  return { typeTable, linkLabels, linkTypeIds };
};

/**
 * Decodes one edges response against the request that produced it.
 *
 * @throws {@link SaltileWireError} on envelope, schema, echo, or count
 *   violations; `SaltileCborError` on CBOR profile violations.
 */
export const decodeSaltileEdges = (
  buffer: ArrayBuffer,
  request: SaltileEdgesRequest,
): DecodedSaltileEdges => {
  if (request.generation.length !== GENERATION_BYTES) {
    fail(
      `request generation is ${request.generation.length} bytes; expected ${GENERATION_BYTES}`,
      0,
    );
  }

  const envelope = readEnvelope(buffer, "edges");
  const bytes = new Uint8Array(buffer);

  const headSlot = envelope.slots[EdgesSlot.Head]!;
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
    requireUint(head, edgesHeadKeys.variant, "variant", headOffset),
    request.variant,
    "variant",
    headOffset,
  );

  const count = requireUint(head, edgesHeadKeys.count, "count", headOffset);
  const complete = requireBool(
    head,
    edgesHeadKeys.complete,
    "complete",
    headOffset,
  );

  const trailerDeclared = requireBool(
    head,
    edgesHeadKeys.trailer,
    "trailer",
    headOffset,
  );
  if (trailerDeclared !== request.includeDetailedData) {
    return fail(
      `HEAD trailer is ${trailerDeclared}; the request expects ${request.includeDetailedData}`,
      headOffset,
    );
  }

  const sourcesSlot = requireSlot(
    envelope.slots,
    EdgesSlot.Sources,
    "EDGE_SOURCES",
    count * 4,
    buffer.byteLength,
  );
  const targetsSlot = requireSlot(
    envelope.slots,
    EdgesSlot.Targets,
    "EDGE_TARGETS",
    count * 4,
    buffer.byteLength,
  );
  const edgeIdsSlot = requireSlot(
    envelope.slots,
    EdgesSlot.EdgeIds,
    "EDGE_IDS",
    count * ENTITY_ID_BYTES,
    buffer.byteLength,
  );
  const edgeIdRecords = readEntityIdColumn(
    bytes.subarray(edgeIdsSlot.start, edgeIdsSlot.end),
    count,
    "EDGE_IDS",
    edgeIdsSlot.start,
  );

  let detail: SaltileEdgesDetail | null = null;
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
    complete,
    sources: new Uint32Array(buffer, sourcesSlot.start, count),
    targets: new Uint32Array(buffer, targetsSlot.start, count),
    edgeIds: edgeIdRecords.map((record) => formatEntityId(record)),
    detail,
  };
};
