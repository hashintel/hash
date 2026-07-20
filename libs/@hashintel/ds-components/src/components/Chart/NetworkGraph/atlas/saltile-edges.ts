/**
 * Edges-kind decoder for the SALTILE wire (normative schema:
 * `SPEC-ADDENDUM-WIRE.md` sections 3 and 6a). Layers over the envelope
 * reader: validates the HEAD schema and its echo of the request, then
 * exposes the three edge columns as typed-array views over the
 * response buffer - edge data is never copied and never walked.
 *
 * Delivery-set membership (sources/targets referencing node rows the
 * client holds) and the auth conjunction
 * (`edgeBit AND nodeBit[src] AND nodeBit[tgt]`) are server-side
 * contracts, not decoder walks.
 */

import { decodeCbor } from "./saltile-cbor";
import {
  fail,
  GENERATION_BYTES,
  isCborMap,
  isNullableStringArray,
  requireBool,
  requireGenerationEcho,
  requireSlot,
  requireUint,
  expectEqual,
} from "./saltile-schema";
import { EdgesSlot, readEnvelope } from "./saltile-wire";

/** The request context an edges response must echo. */
export interface SaltileEdgesRequest {
  /** Generation identity from the manifest, 32 raw bytes. */
  readonly generation: Uint8Array;
  readonly variant: number;
  readonly includeDetailedData: boolean;
}

/** Per-edge detail from the trailer tail, edge order. */
export interface SaltileEdgesDetail {
  readonly linkLabels: readonly (string | null)[];
  readonly linkIcons: readonly (string | null)[];
  readonly linkTypeLabels: readonly (string | null)[];
  readonly linkTypeIcons: readonly (string | null)[];
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
  /**
   * Edge row ids, edge order. Servers deliver ASCENDING row ids
   * (WIRE section 6a): merge-joins against held row ids may zip
   * linearly, and identical queries answer byte-identically. The
   * decoder does not re-walk the column to enforce this (structure-
   * only validation, ruled); the live smoke pins it against the
   * real server.
   */
  readonly rowIds: Uint32Array;
  readonly detail: SaltileEdgesDetail | null;
}

/** HEAD keys of the edges schema (section 6a). */
const edgesHeadKeys = {
  generation: 0,
  variant: 1,
  count: 2,
  complete: 3,
  trailer: 4,
} as const;

const knownHeadKeys = new Set<number>(Object.values(edgesHeadKeys));

const trailerColumns = [
  [0, "linkLabels"],
  [1, "linkIcons"],
  [2, "linkTypeLabels"],
  [3, "linkTypeIcons"],
] as const;

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
    if (key !== 0 && key !== 1 && key !== 2 && key !== 3) {
      return fail(`TRAILER carries unknown key ${key}`, offset);
    }
  }
  const columns: (readonly (string | null)[])[] = [];
  for (const [key, name] of trailerColumns) {
    const entries = value.get(key);
    if (!isNullableStringArray(entries)) {
      return fail(`TRAILER ${name} entries must be strings or null`, offset);
    }
    if (entries.length !== count) {
      return fail(
        `TRAILER ${name} must carry exactly ${count} entries`,
        offset,
      );
    }
    columns.push(entries);
  }
  return {
    linkLabels: columns[0]!,
    linkIcons: columns[1]!,
    linkTypeLabels: columns[2]!,
    linkTypeIcons: columns[3]!,
  };
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
  const rowIdsSlot = requireSlot(
    envelope.slots,
    EdgesSlot.RowIds,
    "EDGE_ROW_IDS",
    count * 4,
    buffer.byteLength,
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
    rowIds: new Uint32Array(buffer, rowIdsSlot.start, count),
    detail,
  };
};
