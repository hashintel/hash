import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BinaryEntityIdError } from "./BinaryEntityId";
import { CborDecoderError } from "./CborDecoder";
import { Decoder, DecoderError } from "./Decoder";
import * as EdgeDocument from "./EdgeDocument";
import * as Envelope from "./Envelope";
import {
  buildResponse,
  cborArray,
  cborBool,
  cborBstr,
  cborMap,
  cborNull,
  cborTstr,
  cborUint,
  u32le,
} from "./fixtures";
import * as GenerationId from "./GenerationId";
import { NodeIdColumnError } from "./NodeId";
import * as Result from "./Result";

import type { u64 } from "./Num";

const generationBytes = Array.from({ length: 32 }, (_, index) => index);
const sourcesDefault = [7, 11, 13];
const targetsDefault = [11, 42, 7];

/** Deterministic, distinguishable 32-byte identity bytes for row `n`. */
const identityRow = (row: number): number[] =>
  Array.from({ length: 32 }, (_, index) => (row * 32 + index) % 256);

const identitiesDefault = [0, 1, 2].flatMap((row) => identityRow(row));

/**
 * The edges HEAD (keys 0-4: generation, variant, count, complete,
 * hasTrailer), sorted for CborDecoder's strictly increasing map keys.
 * `overrides` replaces a key's encoded value; passing a key not in the
 * default set appends it (used for the unknown-field case).
 */
const defaultHeadEntries = (
  overrides: Partial<Record<number, number[]>> = {},
): [number, number[]][] => {
  const entries = new Map<number, number[]>([
    [0, cborBstr(generationBytes)],
    [1, cborUint(7)],
    [2, cborUint(3)],
    [3, cborBool(true)],
    [4, cborBool(false)],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    entries.set(Number(key), value!);
  }
  return [...entries.entries()].sort(([left], [right]) => left - right);
};

interface EdgesFixtureOptions {
  readonly head?: readonly [number, number[]][];
  readonly payloads?: readonly (number[] | null)[];
  readonly tail?: number[];
}

/** Builds one SALTILEE response from fixtures.ts's byte builders. */
const edgesResponse = ({
  head,
  payloads,
  tail = [],
}: EdgesFixtureOptions = {}): ArrayBuffer => {
  const slots = payloads ?? [
    cborMap([...(head ?? defaultHeadEntries())]),
    u32le(sourcesDefault),
    u32le(targetsDefault),
    identitiesDefault,
  ];
  return buildResponse("edges", [...slots], tail);
};

const decodeOptions: EdgeDocument.DecodeOptions = {
  generation: GenerationId.GenerationId.make(
    new Uint8Array(generationBytes),
  ).pipe(Result.unwrap),
  variant: 7n as u64,
  detail: "minimal",
};

const runDecode = (
  buffer: ArrayBuffer,
  options: EdgeDocument.DecodeOptions = decodeOptions,
): Result.Result<
  EdgeDocument.EdgeDocument<ArrayBuffer>,
  EdgeDocument.EdgeDocumentError
> => EdgeDocument.decode(new Decoder(new DataView(buffer)), options);

/** Unwraps a successful Result, failing the test if it is an Err. */
const unwrap = <T, E>(result: Result.Result<T, E>): T => {
  expect(Result.isOk(result)).toBe(true);
  if (!Result.isOk(result)) {
    throw new Error("expected an Ok result");
  }
  return result.value;
};

/** Asserts the response decodes and returns the document. */
const expectOk = (
  result: Result.Result<
    EdgeDocument.EdgeDocument<ArrayBuffer>,
    EdgeDocument.EdgeDocumentError
  >,
): EdgeDocument.EdgeDocument<ArrayBuffer> => unwrap(result);

/** Asserts the response is rejected and returns its EdgeDocumentError. */
const expectError = (
  result: Result.Result<unknown, EdgeDocument.EdgeDocumentError>,
): EdgeDocument.EdgeDocumentError => {
  expect(Result.isErr(result)).toBe(true);
  if (!Result.isErr(result)) {
    throw new Error("expected the edges document to be rejected");
  }
  expect(result.error).toBeInstanceOf(EdgeDocument.EdgeDocumentError);
  return result.error;
};

type SectionMember = EdgeDocument.EdgeDocumentError | Envelope.EnvelopeError;

/** Returns every error retained under a section's aggregate. */
const expectSectionErrors = (
  result: Result.Result<unknown, EdgeDocument.EdgeDocumentError>,
  section: "head" | "columns" | "trailer" | "request",
): SectionMember[] => {
  const error = expectError(result);
  expect(error.reason).toEqual({ _tag: "section", section });
  expect(error.cause).toBeInstanceOf(Result.All);
  if (!(error.cause instanceof Result.All)) {
    throw new Error("expected an aggregate cause");
  }
  return error.cause.errors.map((member: unknown) => {
    if (
      !(member instanceof EdgeDocument.EdgeDocumentError) &&
      !(member instanceof Envelope.EnvelopeError)
    ) {
      throw new Error("expected a document or envelope error member");
    }
    return member;
  });
};

/** Checks that a section retains exactly one failure, still inside an aggregate. */
const expectSingleSectionError = (
  result: Result.Result<unknown, EdgeDocument.EdgeDocumentError>,
  section: "head" | "columns" | "trailer" | "request",
): SectionMember => {
  const errors = expectSectionErrors(result, section);
  expect(errors).toHaveLength(1);
  return errors[0]!;
};

/**
 * Replicates buildResponse's sequential, 8-aligned slot layout, so tests
 * can locate an exact byte offset (a padding byte, a column's first byte)
 * without re-deriving the wire's alignment rule. `-1` marks an absent slot.
 */
const slotStarts = (payloads: readonly (number[] | null)[]): number[] => {
  const base =
    Envelope.PREFIX_BYTES + payloads.length * Envelope.DIRECTORY_ENTRY_BYTES;
  let cursor = base;
  return payloads.map((payload) => {
    if (payload === null) {
      return -1;
    }
    const start = cursor;
    cursor =
      Math.ceil((cursor + payload.length) / Envelope.PAYLOAD_ALIGNMENT) *
      Envelope.PAYLOAD_ALIGNMENT;
    return start;
  });
};

describe("EdgeDocument.decode geometry", () => {
  it("geometry_only", () => {
    const doc = expectOk(runDecode(edgesResponse()));

    expect(doc.variant).toBe(7n);
    expect(doc.count).toBe(3n);
    expect(doc.complete).toBe(true);
    expect([...doc.generation.bytes]).toEqual(generationBytes);
    expect(doc.sources.length).toBe(3);
    expect(doc.targets.length).toBe(3);
    expect(doc.identities.length).toBe(3);
    expect([...doc.sources]).toEqual(sourcesDefault);
    expect([...doc.targets]).toEqual(targetsDefault);
    expect(doc.sources.at(0)).toMatchObject({
      _tag: "ok",
      value: sourcesDefault[0],
    });

    for (const [index, identity] of [...doc.identities].entries()) {
      expect([...identity.bytes]).toEqual(identityRow(index));
    }

    expect(doc.trailer).toBeNull();
  });

  it("auxiliary_detail", () => {
    // The table's delivery order is descending ("cites" > "authored"): the
    // decoder must resolve indexes against it as given, not against a
    // sorted copy.
    const typeTable = [
      "https://t.test/cites/v/2",
      "https://t.test/authored/v/1",
    ];
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray(typeTable.map((url) => cborTstr(url)))],
        [1, cborArray([cborTstr("employs"), cborNull(), cborTstr("owns")])],
        [2, cborArray([cborUint(1), cborUint(0), cborNull()])],
      ]),
    });

    const doc = expectOk(
      runDecode(buffer, { ...decodeOptions, detail: "auxiliary" }),
    );

    expect(doc.trailer).not.toBeNull();
    expect(doc.trailer?.typeTable).toEqual(typeTable);
    expect(doc.trailer?.linkLabels).toEqual(["employs", null, "owns"]);
    expect(doc.trailer?.linkTypeIds).toEqual([
      "https://t.test/authored/v/1",
      "https://t.test/cites/v/2",
      null,
    ]);
  });

  it("zero_edge_present_empty", () => {
    // Present-empty (start === end, not the (0, 0) that marks absence): a
    // zero-edge response still carries its three columns.
    const buffer = edgesResponse({
      payloads: [cborMap(defaultHeadEntries({ 2: cborUint(0) })), [], [], []],
    });

    const doc = expectOk(runDecode(buffer));

    expect(doc.count).toBe(0n);
    expect(doc.sources.length).toBe(0);
    expect(doc.targets.length).toBe(0);
    expect(doc.identities.length).toBe(0);
    expect([...doc.sources]).toEqual([]);
    expect([...doc.identities]).toEqual([]);
  });

  it("zero_edge_with_empty_trailer", () => {
    const buffer = edgesResponse({
      payloads: [
        cborMap(defaultHeadEntries({ 2: cborUint(0), 4: cborBool(true) })),
        [],
        [],
        [],
      ],
      tail: cborMap([
        [0, cborArray([])],
        [1, cborArray([])],
        [2, cborArray([])],
      ]),
    });

    const doc = expectOk(
      runDecode(buffer, { ...decodeOptions, detail: "auxiliary" }),
    );

    expect(doc.trailer).toEqual({
      typeTable: [],
      linkLabels: [],
      linkTypeIds: [],
    });
  });

  it("high_bit_node_ids", () => {
    const highSources = [0xffffffff, 0x80000000, 0];
    const highTargets = [0, 0x80000000, 0xffffffff];
    const buffer = edgesResponse({
      payloads: [
        cborMap(defaultHeadEntries()),
        u32le(highSources),
        u32le(highTargets),
        identitiesDefault,
      ],
    });

    const doc = expectOk(runDecode(buffer));

    expect([...doc.sources]).toEqual(highSources);
    expect([...doc.targets]).toEqual(highTargets);
    expect(doc.sources.at(0)).toMatchObject({ _tag: "ok", value: 4294967295 });
    expect(doc.sources.at(1)).toMatchObject({ _tag: "ok", value: 2147483648 });
  });

  it("column_at_out_of_range", () => {
    const doc = expectOk(runDecode(edgesResponse()));

    const sourcesOutOfRange = doc.sources.at(doc.sources.length);
    expect(Result.isErr(sourcesOutOfRange)).toBe(true);
    if (Result.isErr(sourcesOutOfRange)) {
      expect(sourcesOutOfRange.error).toBeInstanceOf(NodeIdColumnError);
      expect(sourcesOutOfRange.error.reason).toEqual({
        _tag: "invalid-index",
        index: 3,
        length: 3,
      });
    }

    const identityNegative = doc.identities.at(-1);
    expect(Result.isErr(identityNegative)).toBe(true);
    if (Result.isErr(identityNegative)) {
      expect(identityNegative.error).toBeInstanceOf(BinaryEntityIdError);
      expect(identityNegative.error.reason).toEqual({
        _tag: "invalid-index",
        index: -1,
        length: 3,
      });
    }
  });

  it("borrowed_subview_offset", () => {
    const payloads = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      identitiesDefault,
    ];
    const inner = buildResponse("edges", payloads);
    const embeddedOffset = 37; // arbitrary, deliberately not 8-aligned
    const outer = new ArrayBuffer(embeddedOffset + inner.byteLength + 5);
    new Uint8Array(outer).set(new Uint8Array(inner), embeddedOffset);
    const view = new DataView(outer, embeddedOffset, inner.byteLength);

    const doc = expectOk(EdgeDocument.decode(new Decoder(view), decodeOptions));

    expect(doc.generation.bytes.buffer).toBe(outer);
    expect([...doc.generation.bytes]).toEqual(generationBytes);

    const identity = unwrap(doc.identities.at(0));
    expect(identity.bytes.buffer).toBe(outer);

    // The sources column is a live view, not a copy: writing into the
    // outer buffer after decoding changes what `.at` reads back.
    const sourcesStart = embeddedOffset + slotStarts(payloads)[1]!;
    expect(doc.sources.at(0)).toMatchObject({
      _tag: "ok",
      value: sourcesDefault[0],
    });
    new DataView(outer).setUint32(sourcesStart, 0xdeadbeef, true);
    expect(doc.sources.at(0)).toMatchObject({ _tag: "ok", value: 0xdeadbeef });
  });
});

describe("EdgeDocument.decode envelope and head", () => {
  it("truncated_envelope", () => {
    const error = expectError(runDecode(new ArrayBuffer(4)));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(Envelope.EnvelopeError);
    const envelopeCause = error.cause as Envelope.EnvelopeError;
    expect(envelopeCause.reason).toEqual({ _tag: "decode" });
    expect(envelopeCause.cause).toBeInstanceOf(DecoderError);
  });

  it("dirty_envelope_padding", () => {
    const payloads = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      identitiesDefault,
    ];
    const buffer = buildResponse("edges", payloads);
    const bytes = new Uint8Array(buffer);
    const headEnd = slotStarts(payloads)[0]! + payloads[0]!.length;

    expect(bytes[headEnd]).toBe(0); // sanity: the wire pads with zero bytes
    bytes[headEnd] = 7;

    const error = expectError(runDecode(buffer));
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(Envelope.EnvelopeError);
    expect((error.cause as Envelope.EnvelopeError).reason).toEqual({
      _tag: "invalid-layout",
      detail: "slot 0 has nonzero padding",
    });
  });

  it("wrong_envelope_kind", () => {
    // A structurally valid envelope of a different kind: Envelope.decode
    // accepts it (its magic is one of the three SALTILE* kinds); only
    // EdgeDocument itself rejects it.
    const buffer = buildResponse("tile", [[0xa0], null, null, null, null]);

    const error = expectError(runDecode(buffer));
    expect(error.reason).toEqual({ _tag: "invalid-kind", actual: "SALTILET" });
  });

  it.each([
    { name: "generation", key: 0 },
    { name: "variant", key: 1 },
    { name: "count", key: 2 },
    { name: "complete", key: 3 },
    { name: "hasTrailer", key: 4 },
  ] as const)("missing_head_$name", ({ name, key }) => {
    const entries = defaultHeadEntries().filter(
      ([entryKey]) => entryKey !== key,
    );
    const error = expectSingleSectionError(
      runDecode(edgesResponse({ head: entries })),
      "head",
    );
    expect(error.reason).toEqual({
      _tag: "missing-field",
      field: `head.${name}`,
    });
  });

  it("all_missing_head_fields", () => {
    const errors = expectSectionErrors(
      runDecode(edgesResponse({ head: [] })),
      "head",
    );
    expect(errors.map((error) => error.reason)).toEqual(
      ["generation", "variant", "count", "complete", "hasTrailer"].map(
        (field) => ({ _tag: "missing-field", field: `head.${field}` }),
      ),
    );
  });

  it("unknown_head_field", () => {
    const entries = defaultHeadEntries({ 9: cborUint(1) });
    const error = expectError(runDecode(edgesResponse({ head: entries })));
    expect(error.reason).toEqual({
      _tag: "unknown-field",
      section: "head",
      key: 9n,
    });
  });

  it("wrong_cbor_category", () => {
    const entries = defaultHeadEntries({ 1: cborTstr("two") });
    const error = expectError(runDecode(edgesResponse({ head: entries })));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(CborDecoderError);
    expect((error.cause as CborDecoderError).reason).toEqual({
      _tag: "unexpected-kind",
      expected: "an unsigned integer",
      actual: "text-string",
    });
  });

  it("invalid_generation_length", () => {
    const shortGeneration = Array.from({ length: 16 }, (_, index) => index);
    const entries = defaultHeadEntries({ 0: cborBstr(shortGeneration) });
    const error = expectError(runDecode(edgesResponse({ head: entries })));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(GenerationId.GenerationIdError);
    expect((error.cause as GenerationId.GenerationIdError).reason).toEqual({
      _tag: "invalid-length",
      byteLength: 16,
    });
  });
});

describe("EdgeDocument.decode request", () => {
  it.each(["minimal", "auxiliary"] as const)("detail_%s_mismatch", (detail) => {
    const hasTrailer = detail === "minimal";
    const buffer = edgesResponse({
      payloads: [
        cborMap(
          defaultHeadEntries({ 2: cborUint(0), 4: cborBool(hasTrailer) }),
        ),
        [],
        [],
        [],
      ],
      tail: hasTrailer
        ? cborMap([
            [0, cborArray([])],
            [1, cborArray([])],
            [2, cborArray([])],
          ])
        : [],
    });
    const error = expectSingleSectionError(
      runDecode(buffer, { ...decodeOptions, detail }),
      "request",
    );
    expect(error.reason).toEqual({
      _tag: "detail-mismatch",
      expected: detail,
      actual: hasTrailer ? "auxiliary" : "minimal",
    });
  });

  it("generation_mismatch", () => {
    const generation = GenerationId.GenerationId.make(
      new Uint8Array(32).fill(255),
    ).pipe(Result.unwrap);
    const error = expectSingleSectionError(
      runDecode(edgesResponse(), { ...decodeOptions, generation }),
      "request",
    );
    expect(error.reason._tag).toBe("generation-mismatch");
    if (error.reason._tag !== "generation-mismatch") {
      throw error;
    }
    expect(error.reason.expected).toBe(generation);
    expect(error.reason.actual.equals(decodeOptions.generation)).toBe(true);
  });

  it("variant_mismatch", () => {
    const error = expectSingleSectionError(
      runDecode(edgesResponse(), { ...decodeOptions, variant: 8n as u64 }),
      "request",
    );
    expect(error.reason).toEqual({
      _tag: "variant-mismatch",
      expected: 8n,
      actual: 7n,
    });
  });

  it("variant_u64_exact", () => {
    const variant = 0xffff_ffff_ffff_ffffn as u64;
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 1: cborUint(variant) }),
    });
    expectOk(runDecode(buffer, { ...decodeOptions, variant }));
    const error = expectSingleSectionError(
      runDecode(buffer, { ...decodeOptions, variant: (variant - 1n) as u64 }),
      "request",
    );
    expect(error.reason).toEqual({
      _tag: "variant-mismatch",
      expected: variant - 1n,
      actual: variant,
    });
  });

  it("independent_request_failures", () => {
    const generation = GenerationId.GenerationId.make(
      new Uint8Array(32).fill(255),
    ).pipe(Result.unwrap);
    const errors = expectSectionErrors(
      runDecode(edgesResponse(), {
        generation,
        variant: 8n as u64,
        detail: "auxiliary",
      }),
      "request",
    );
    expect(errors.map((error) => error.reason._tag)).toEqual([
      "generation-mismatch",
      "variant-mismatch",
      "detail-mismatch",
    ]);
    expect(errors[1]?.reason).toEqual({
      _tag: "variant-mismatch",
      expected: 8n,
      actual: 7n,
    });
  });
});

describe("EdgeDocument.decode columns", () => {
  it("independent_column_failures", () => {
    const errors = expectSectionErrors(
      runDecode(
        buildResponse("edges", [cborMap(defaultHeadEntries()), [1], [], null]),
      ),
      "columns",
    );
    expect(errors.map((error) => error.reason)).toEqual([
      {
        _tag: "invalid-field",
        field: "sources",
        detail: "invalid node column width",
      },
      { _tag: "length", field: "targets", expected: 3n, actual: 0 },
      { _tag: "missing-slot", slot: 3 },
    ]);
    expect(errors[0]).toBeInstanceOf(EdgeDocument.EdgeDocumentError);
    expect((errors[0] as EdgeDocument.EdgeDocumentError).cause).toBeInstanceOf(
      NodeIdColumnError,
    );
    expect(errors[1]).toBeInstanceOf(EdgeDocument.EdgeDocumentError);
    expect(errors[2]).toBeInstanceOf(Envelope.EnvelopeError);
  });

  it.each([
    { name: "sources", slot: 1 },
    { name: "targets", slot: 2 },
    { name: "identities", slot: 3 },
  ] as const)("absent_$name_column", ({ slot }) => {
    const payloads: (number[] | null)[] = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      identitiesDefault,
    ];
    payloads[slot] = null;

    const error = expectSingleSectionError(
      runDecode(buildResponse("edges", payloads)),
      "columns",
    );
    expect(error).toBeInstanceOf(Envelope.EnvelopeError);
    expect(error.reason).toEqual({ _tag: "missing-slot", slot });
  });

  it.each([
    { name: "sources", slot: 1, rows: sourcesDefault },
    { name: "targets", slot: 2, rows: targetsDefault },
  ] as const)("mismatched_$name_count", ({ name, slot, rows }) => {
    const payloads: (number[] | null)[] = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      identitiesDefault,
    ];
    payloads[slot] = u32le(rows.slice(0, 2));

    const error = expectSingleSectionError(
      runDecode(buildResponse("edges", payloads)),
      "columns",
    );
    expect(error.reason).toEqual({
      _tag: "length",
      field: name,
      expected: 3n,
      actual: 2,
    });
  });

  it.each([
    { name: "descending", rows: [0, 2, 1] },
    { name: "duplicate", rows: [0, 0, 1] },
  ])("identity_delivery_order_$name", ({ rows }) => {
    const document = expectOk(
      runDecode(
        edgesResponse({
          payloads: [
            cborMap(defaultHeadEntries()),
            u32le(sourcesDefault),
            u32le(targetsDefault),
            rows.flatMap((row) => identityRow(row)),
          ],
        }),
      ),
    );
    expect(
      [...document.identities].map((identity) => [...identity.bytes]),
    ).toEqual(rows.map((row) => identityRow(row)));
    expect([...document.sources]).toEqual(sourcesDefault);
    expect([...document.targets]).toEqual(targetsDefault);
  });

  it("mismatched_identities_count", () => {
    const payloads: (number[] | null)[] = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      [0, 1].flatMap((row) => identityRow(row)),
    ];

    const error = expectSingleSectionError(
      runDecode(buildResponse("edges", payloads)),
      "columns",
    );
    expect(error.reason).toEqual({
      _tag: "length",
      field: "identities",
      expected: 3n,
      actual: 2,
    });
  });

  it.each([
    { name: "sources", slot: 1 },
    { name: "targets", slot: 2 },
  ] as const)("partial_row_width_$name", ({ name, slot }) => {
    // 3 bytes: not a whole number of 4-byte node identities.
    const payloads: (number[] | null)[] = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      identitiesDefault,
    ];
    payloads[slot] = [1, 2, 3];

    const error = expectSingleSectionError(
      runDecode(buildResponse("edges", payloads)),
      "columns",
    );
    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: name,
      detail: "invalid node column width",
    });
    expect(error.cause).toBeInstanceOf(NodeIdColumnError);
    expect((error.cause as NodeIdColumnError).reason).toEqual({
      _tag: "invalid-length",
      byteLength: 3,
    });
  });

  it("partial_row_width_identities", () => {
    // 35 bytes: not a whole number of 32-byte identities.
    const payloads: (number[] | null)[] = [
      cborMap(defaultHeadEntries()),
      u32le(sourcesDefault),
      u32le(targetsDefault),
      [...identityRow(0), 1, 2, 3],
    ];

    const error = expectSingleSectionError(
      runDecode(buildResponse("edges", payloads)),
      "columns",
    );
    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "identities",
      detail: "invalid identity column width",
    });
    expect(error.cause).toBeInstanceOf(BinaryEntityIdError);
    expect((error.cause as BinaryEntityIdError).reason).toEqual({
      _tag: "column-length",
      byteLength: 35,
    });
  });
});

describe("EdgeDocument.decode trailer", () => {
  it("all_missing_trailer_fields", () => {
    const errors = expectSectionErrors(
      runDecode(
        edgesResponse({
          head: defaultHeadEntries({ 4: cborBool(true) }),
          tail: cborMap([]),
        }),
      ),
      "trailer",
    );
    expect(errors.map((error) => error.reason)).toEqual(
      ["typeTable", "linkLabels", "linkTypeIds"].map((field) => ({
        _tag: "missing-field",
        field: `trailer.${field}`,
      })),
    );
  });

  it("undeclared_trailer_bytes", () => {
    // hasTrailer is false (the default head), but the response carries a
    // tail anyway.
    const error = expectError(runDecode(edgesResponse({ tail: [0xf6] })));
    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "head.hasTrailer",
      detail: "undeclared trailing bytes",
    });
  });

  it("missing_trailer_bytes", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(CborDecoderError);
    expect((error.cause as CborDecoderError).reason).toEqual({
      _tag: "unexpected-end",
    });
  });

  it("malformed_trailer_shape", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborArray([cborUint(1)]),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(CborDecoderError);
    expect((error.cause as CborDecoderError).reason).toEqual({
      _tag: "unexpected-kind",
      expected: "an edges trailer",
      actual: "array",
    });
  });

  it("trailing_trailer_bytes", () => {
    const trailerBytes = cborMap([
      [0, cborArray([])],
      [1, cborArray([cborNull(), cborNull(), cborNull()])],
      [2, cborArray([cborNull(), cborNull(), cborNull()])],
    ]);
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: [...trailerBytes, 0xf6], // a stray byte after the self-delimiting trailer
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(CborDecoderError);
    expect((error.cause as CborDecoderError).reason).toEqual({
      _tag: "trailing-data",
      remaining: 1,
    });
  });

  it.each([
    { name: "linkLabels", key: 1 },
    { name: "linkTypeIds", key: 2 },
  ] as const)("wrong_trailer_array_length_$name", ({ key, name }) => {
    const trailerEntries: [number, number[]][] = [
      [0, cborArray([])],
      [1, cborArray([cborNull(), cborNull(), cborNull()])],
      [2, cborArray([cborNull(), cborNull(), cborNull()])],
    ];
    trailerEntries[key] = [key, cborArray([cborNull(), cborNull()])];

    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap(trailerEntries),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({
      _tag: "length",
      field: `trailer.${name}`,
      expected: 3n,
      actual: 2,
    });
  });

  it("duplicate_type_table_entries", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap([
        [
          0,
          cborArray([
            cborTstr("https://t.test/authored/v/1"),
            cborTstr("https://t.test/authored/v/1"),
          ]),
        ],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        [2, cborArray([cborUint(0), cborNull(), cborNull()])],
      ]),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "trailer.typeTable",
      detail: "entries must be unique",
    });
  });

  it("out_of_range_type_index", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray([cborTstr("https://t.test/authored/v/1")])],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        // The table has one entry (index 0); index 1 is out of range.
        [2, cborArray([cborUint(1), cborNull(), cborNull()])],
      ]),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "trailer.linkTypeIds",
      detail: "index 1 is outside the type table",
    });
  });

  it("negative_type_index", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray([cborTstr("https://t.test/authored/v/1")])],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        // cborUint(0, 1) is CBOR major type 1 (negative integer), value -1:
        // the type-index visitor accepts an unsigned integer or null, not
        // this category.
        [2, cborArray([cborUint(0, 1), cborNull(), cborNull()])],
      ]),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(CborDecoderError);
    expect((error.cause as CborDecoderError).reason).toEqual({
      _tag: "unexpected-kind",
      expected: "a type index or null",
      actual: "negative-integer",
    });
  });

  it("non_url_type_table_entry", () => {
    const buffer = edgesResponse({
      head: defaultHeadEntries({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray([cborTstr("not a url")])],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        [2, cborArray([cborNull(), cborNull(), cborNull()])],
      ]),
    });
    const error = expectError(runDecode(buffer));

    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "trailer.typeTable",
      detail: "expected a versioned URL",
    });
  });
});

describe("EdgeDocument.decode real fixture", () => {
  const wireFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../../../libs/@local/graph/atlas/fixtures/wire",
  );

  /** Expected fields of the encoded edges fixture. */
  interface EdgesFixture {
    readonly head: {
      readonly generation: string;
      readonly variant: number;
      readonly count: number;
      readonly complete: boolean;
      readonly trailer: boolean;
    };
    readonly sources: readonly number[];
    readonly targets: readonly number[];
    readonly edgeIds: readonly string[];
    readonly trailer: {
      readonly typeTable: readonly string[];
      readonly linkLabels: readonly (string | null)[];
      readonly linkTypeIds: readonly (number | null)[];
    };
  }

  /** Loads an encoded response and its expected fields. */
  const readWireFixture = (
    name: string,
  ): { buffer: ArrayBuffer; sidecar: EdgesFixture } => {
    const bytes = readFileSync(path.join(wireFixturesDir, `${name}.saltile`));
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sidecar = JSON.parse(
      readFileSync(path.join(wireFixturesDir, `${name}.json`), "utf8"),
    ) as EdgesFixture;
    return { buffer, sidecar };
  };

  /** Decodes the fixture's hexadecimal generation identity. */
  const bytesFromHex = (hex: string): Uint8Array =>
    new Uint8Array(
      Array.from({ length: hex.length / 2 }, (_, index) =>
        Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
      ),
    );

  it("g6_edges", () => {
    const { buffer, sidecar } = readWireFixture("g6-edges");
    const doc = expectOk(
      runDecode(buffer, {
        generation: GenerationId.GenerationId.fromHex(
          sidecar.head.generation,
        ).pipe(Result.unwrap),
        variant: BigInt(sidecar.head.variant) as u64,
        detail: "auxiliary",
      }),
    );

    expect([...doc.generation.bytes]).toEqual([
      ...bytesFromHex(sidecar.head.generation),
    ]);
    expect(doc.variant).toBe(BigInt(sidecar.head.variant));
    expect(doc.count).toBe(BigInt(sidecar.head.count));
    expect(doc.complete).toBe(sidecar.head.complete);
    expect([...doc.sources]).toEqual(sidecar.sources);
    expect([...doc.targets]).toEqual(sidecar.targets);

    const identityHex = [...doc.identities].map((identity) =>
      [...identity.bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
    expect(identityHex).toEqual(sidecar.edgeIds);

    expect(doc.trailer).not.toBeNull();
    expect(doc.trailer?.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(doc.trailer?.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(doc.trailer?.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
  });
});
