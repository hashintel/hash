import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as CborDecoder from "./CborDecoder";
import * as Decoder from "./Decoder";
import * as Fixtures from "./fixtures";
import * as GenerationId from "./GenerationId";
import * as LocateDocument from "./LocateDocument";
import * as Option from "./Option";
import * as Result from "./Result";

import type * as Num from "./Num";

const uint = (value: number) => Fixtures.cborUint(value);
const generation = new Uint8Array(32).fill(0x77);
const identity = new Uint8Array(32).fill(0x42);
const defaultHead = (): [number, number[]][] => [
  [0, Fixtures.cborBstr([...generation])],
  [1, uint(0)],
  [2, uint(2)],
  [3, uint(3)],
  [4, Fixtures.cborArray([uint(3), uint(5), uint(2)])],
  [5, uint(1)],
  [6, Fixtures.cborBool(false)],
  [7, Fixtures.cborBstr([...identity])],
  [8, Fixtures.cborBool(true)],
  [9, Fixtures.cborBool(false)],
];
const defaultTrailer = (): [number, number[]][] => [
  [0, Fixtures.cborArray([Fixtures.cborTstr("https://example.test/type/v/1")])],
  [
    1,
    Fixtures.cborArray([Fixtures.cborTstr("https://example.test/property/")]),
  ],
  [2, Fixtures.cborArray([Fixtures.cborTstr("source"), Fixtures.cborNull()])],
  [3, Fixtures.cborArray([uint(0), Fixtures.cborNull()])],
  [4, Fixtures.cborMap([[0, uint(1)]])],
  [5, Fixtures.cborArray([Fixtures.cborTstr("link")])],
  [6, Fixtures.cborArray([Fixtures.cborArray([uint(0)])])],
  [7, Fixtures.cborBstr([1, 0, 0, 0, 0, 0, 0, 0])],
  [8, Fixtures.cborArray([Fixtures.cborNull()])],
  [9, Fixtures.cborBstr([0, 0, 0, 0, 0, 0, 0, 0])],
];
const replace = (
  entries: [number, number[]][],
  key: number,
  value: number[],
): [number, number[]][] =>
  entries.map(([field, bytes]) => [field, field === key ? value : bytes]);

const response = ({
  head = defaultHead(),
  trailer = defaultTrailer(),
  masks = [1, 2],
  columns = {},
}: {
  head?: [number, number[]][];
  trailer?: [number, number[]][];
  masks?: number[] | null;
  columns?: Record<number, number[]>;
} = {}) =>
  new Uint8Array(
    Fixtures.buildResponse(
      "locate",
      [
        Fixtures.cborMap(head),
        columns[1] ?? Fixtures.f32le([0.5, -0.25, 0, 1]),
        columns[2] ?? Fixtures.u32le([61, 11]),
        masks,
        columns[4] ?? Fixtures.u32le([61]),
        columns[5] ?? Fixtures.u32le([11]),
        columns[6] ?? [...identity],
      ],
      Fixtures.cborMap(trailer),
    ),
  );

const decode = (
  bytes: Uint8Array,
  options: Partial<LocateDocument.DecodeOptions> = {},
) =>
  LocateDocument.decode(
    new Decoder.Decoder(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ),
    {
      coloredTypeCount: 2,
      generation: Result.unwrap(GenerationId.fromHex("77".repeat(32))),
      variant: 0n as Num.u64,
      ...options,
    },
  );

const errorOf = <T>(
  result: Result.Result<T, LocateDocument.LocateDocumentError>,
) => {
  if (Result.isOk(result)) {
    throw new Error("expected failure");
  }
  return result.error;
};

const causes = (error: unknown): Error[] => {
  if (!(error instanceof Error)) {
    return [];
  }
  return [
    error,
    ...causes(error.cause),
    ...(error instanceof AggregateError ? error.errors.flatMap(causes) : []),
  ];
};
const domainReasons = (error: unknown) =>
  causes(error).flatMap((cause) =>
    cause instanceof LocateDocument.LocateDocumentError ? [cause.reason] : [],
  );

const f64 = (value: number): number[] => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return [0xfb, ...bytes];
};
const integer64 = (value: bigint): number[] => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(
    0,
    value < 0n ? -1n - value : value,
    false,
  );
  return [value < 0n ? 0x3b : 0x1b, ...bytes];
};

describe("LocateDocument", () => {
  it("unexpected_trailer_exception", () => {
    const cause = new Error("trailer access failed");
    class ThrowingDecoder extends Decoder.Decoder<ArrayBuffer> {
      override nextUint8Array(length: number) {
        if (this.offset !== 0) {
          throw cause;
        }
        return super.nextUint8Array(length);
      }
    }
    const bytes = response();
    const result = LocateDocument.decode(
      new ThrowingDecoder(new DataView(bytes.buffer)),
      {
        generation: GenerationId.fromHex("77".repeat(32)).pipe(Result.unwrap),
        variant: 0n as Num.u64,
        coloredTypeCount: 2,
      },
    );
    const error = errorOf(result);
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBe(cause);
  });

  it("wire_fixture", () => {
    const bytes = readFileSync(
      new URL(
        "../../../../../../libs/@local/graph/atlas/fixtures/wire/g7-locate.saltile",
        import.meta.url,
      ),
    );
    const document = Result.unwrap(decode(bytes));
    expect(document.generation.toString()).toBe("77".repeat(32));
    expect(document.count).toBe(4n);
    expect(document.edges).toBe(3n);
    expect(document.cell).toEqual({ z: 3n, x: 5n, y: 2n });
    expect([...document.rowIds]).toEqual([61, 11, 21, 41]);
    expect([...document.sources]).toEqual([61, 41, 21]);
    expect([...document.targets]).toEqual([11, 61, 41]);
    expect([...document.positions]).toEqual([
      [0.625, -0.25],
      [-0.625, 0.375],
      [-0.375, 0.25],
      [0.125, 0],
    ]);
    expect(document.trailer.labels).toEqual(["Café", null, "𝔊", "é"]);
    expect(document.trailer.typeIds).toEqual([
      "https://t.test/person/v/3",
      null,
      "https://t.test/work/v/2",
      "https://t.test/authored/v/1",
    ]);
    expect(document.trailer.linkTypeIds).toEqual([
      ["https://t.test/person/v/3", "https://t.test/authored/v/1"],
      ["https://t.test/authored/v/1"],
      [],
    ]);
    expect([...(document.trailer.properties?.keys() ?? [])]).toEqual([
      "https://x.test/age/",
      "https://x.test/name/",
      "https://x.test/ok/",
      "https://x.test/score/",
    ]);
    expect([...(document.trailer.properties?.values() ?? [])]).toEqual([
      -3n,
      "Ada",
      true,
      0.5,
    ]);
    expect([...(document.trailer.linkProperties[0]?.values() ?? [])]).toEqual([
      977n,
      null,
      -2.5,
    ]);
    expect([...document.trailer.linkPropertiesComplete]).toEqual([
      true,
      false,
      true,
    ]);
    expect(document.complete).toBe(false);
    expect(document.typeIdsComplete).toBe(true);
    expect(document.propertiesComplete).toBe(false);
  });

  it("borrowed_subview", () => {
    const bytes = response();
    const storage = new Uint8Array(bytes.length + 9);
    storage.set(bytes, 5);
    const view = storage.subarray(5, 5 + bytes.length);
    const document = Result.unwrap(decode(view));
    expect(document.generation.bytes.buffer).toBe(storage.buffer);
    expect(document.entityId.bytes.buffer).toBe(storage.buffer);
    expect(Result.unwrap(document.edgeIds.at(0)).bytes.buffer).toBe(
      storage.buffer,
    );
    expect(Result.unwrap(document.trailer.linkPropertiesComplete.at(0))).toBe(
      false,
    );
    expect([...document.trailer.linkPropertiesComplete]).toEqual([false]);
    view[view.length - 8] = 1;
    expect(Result.unwrap(document.trailer.linkPropertiesComplete.at(0))).toBe(
      true,
    );
    expect([...document.trailer.linkPropertiesComplete]).toEqual([true]);
    const directory = new DataView(
      view.buffer,
      view.byteOffset,
      view.byteLength,
    );
    const positionOffset = directory.getUint32(16 + 8, true);
    directory.setFloat32(positionOffset, 0.75, true);
    expect(Result.unwrap(document.positions.at(0))[0]).toBe(0.75);
    const rowOffset = directory.getUint32(16 + 16, true);
    directory.setUint32(rowOffset, 99, true);
    expect(Result.unwrap(document.rowIds.at(0))).toBe(99);
    if (Option.isSome(document.typeMask)) {
      const mask = Result.unwrap(document.typeMask.value.at(0));
      expect([...mask]).toEqual([0]);
      const maskOffset = directory.getUint32(16 + 24, true);
      directory.setUint8(maskOffset, 2);
      expect(Result.unwrap(mask.has(0))).toBe(false);
      expect([...mask]).toEqual([1]);
    }
  });

  it.each(Array.from({ length: 10 }, (_, key) => key))(
    "missing_head_%i",
    (key) => {
      const error = errorOf(
        decode(
          response({ head: defaultHead().filter(([field]) => field !== key) }),
        ),
      );
      expect(
        domainReasons(error).some((reason) => reason._tag === "missing-field"),
      ).toBe(true);
    },
  );

  it.each(Array.from({ length: 10 }, (_, key) => key))(
    "missing_trailer_%i",
    (key) => {
      const error = errorOf(
        decode(
          response({
            trailer: defaultTrailer().filter(([field]) => field !== key),
          }),
        ),
      );
      expect(
        domainReasons(error).some((reason) => reason._tag === "missing-field"),
      ).toBe(true);
    },
  );

  it("missing_source_row", () => {
    const error = errorOf(
      decode(response({ head: replace(defaultHead(), 2, uint(0)) })),
    );
    expect(domainReasons(error)).toContainEqual({
      _tag: "invalid-field",
      field: "head.count",
      detail: "the source row is missing",
    });
  });

  it("column_request_failures", () => {
    const error = errorOf(
      decode(response({ columns: { 1: [0], 2: [0], 6: [0] } }), {
        coloredTypeCount: 2,
        generation: Result.unwrap(GenerationId.fromHex("aa".repeat(32))),
        variant: 9n as Num.u64,
      }),
    );
    const chain = causes(error);
    expect(
      chain.some(
        (cause) => "_tag" in cause && cause._tag === "PositionColumnError",
      ),
    ).toBe(true);
    expect(
      chain.some(
        (cause) => "_tag" in cause && cause._tag === "NodeIdColumnError",
      ),
    ).toBe(true);
    expect(
      chain.some(
        (cause) => "_tag" in cause && cause._tag === "BinaryEntityIdError",
      ),
    ).toBe(true);
    expect(
      domainReasons(error).filter(
        (reason) =>
          reason._tag === "generation-mismatch" ||
          reason._tag === "variant-mismatch",
      ),
    ).toHaveLength(2);
  });

  it("request_mismatch_values", () => {
    const expectedGeneration = Result.unwrap(
      GenerationId.fromHex("aa".repeat(32)),
    );
    const error = errorOf(
      decode(response(), {
        generation: expectedGeneration,
        variant: 9n as Num.u64,
      }),
    );
    const requestError = causes(error).find(
      (cause) =>
        cause instanceof LocateDocument.LocateDocumentError &&
        cause.reason._tag === "section" &&
        cause.reason.section === "request",
    );
    expect(requestError).toBeInstanceOf(LocateDocument.LocateDocumentError);
    const aggregate = requestError?.cause;
    expect(aggregate).toBeInstanceOf(Result.All);
    if (!(aggregate instanceof Result.All)) {
      throw new Error("expected an aggregate under request context");
    }
    expect(aggregate.errors).toHaveLength(2);
    const [generationError, variantError] = aggregate.errors;
    if (
      !(generationError instanceof LocateDocument.LocateDocumentError) ||
      generationError.reason._tag !== "generation-mismatch"
    ) {
      throw new Error("expected a typed generation mismatch");
    }
    expect(generationError.reason.expected).toBe(expectedGeneration);
    expect(generationError.reason.actual).toBeInstanceOf(
      GenerationId.GenerationId,
    );
    expect(generationError.reason.actual.toString()).toBe("77".repeat(32));
    if (
      !(variantError instanceof LocateDocument.LocateDocumentError) ||
      variantError.reason._tag !== "variant-mismatch"
    ) {
      throw new Error("expected a typed variant mismatch");
    }
    expect(variantError.reason.expected).toBe(9n);
    expect(variantError.reason.actual).toBe(0n);
  });

  it("matching_request", () => {
    expect(
      Result.isOk(
        decode(response(), {
          coloredTypeCount: 2,
          generation: Result.unwrap(GenerationId.fromHex("77".repeat(32))),
          variant: 0n as Num.u64,
        }),
      ),
    ).toBe(true);
  });

  it("scalar_categories", () => {
    const scalars = [
      integer64(-(2n ** 63n)),
      integer64(2n ** 63n - 1n),
      uint(1),
      f64(1),
      f64(-0),
      Fixtures.cborTstr("text"),
      Fixtures.cborBool(false),
      Fixtures.cborNull(),
    ];
    const trailer = replace(
      replace(
        defaultTrailer(),
        1,
        Fixtures.cborArray(
          scalars.map((_, index) =>
            Fixtures.cborTstr(`https://example.test/property-${index}/`),
          ),
        ),
      ),
      4,
      Fixtures.cborMap(scalars.map((scalar, index) => [index, scalar])),
    );
    const values = [
      ...(Result.unwrap(
        decode(response({ trailer })),
      ).trailer.properties?.values() ?? []),
    ];
    expect(values).toEqual([
      -(2n ** 63n),
      2n ** 63n - 1n,
      1n,
      1,
      -0,
      "text",
      false,
      null,
    ]);
    expect(typeof values[2]).toBe("bigint");
    expect(typeof values[3]).toBe("number");
    expect(Object.is(values[4], -0)).toBe(true);
  });

  it.each(
    [Fixtures.cborF32(1), Fixtures.cborArray([]), Fixtures.cborMap([])].map(
      (scalar) => ({ scalar }),
    ),
  )("property_category_$scalar", ({ scalar }) => {
    const error = errorOf(
      decode(
        response({
          trailer: replace(
            defaultTrailer(),
            4,
            Fixtures.cborMap([[0, scalar]]),
          ),
        }),
      ),
    );
    expect(
      causes(error).some(
        (cause) =>
          cause instanceof CborDecoder.CborDecoderError &&
          cause.reason._tag === "unexpected-kind",
      ),
    ).toBe(true);
  });

  it("null_source_properties", () => {
    const document = Result.unwrap(
      decode(
        response({
          trailer: replace(defaultTrailer(), 4, Fixtures.cborNull()),
        }),
      ),
    );
    expect(document.trailer.properties).toBeNull();
    expect(
      Result.isErr(
        decode(
          response({ trailer: defaultTrailer().filter(([key]) => key !== 4) }),
        ),
      ),
    ).toBe(true);
  });

  it.each([
    { key: 0, field: "typeTable", url: "https://example.test/type/v/1" },
    { key: 1, field: "propertyTable", url: "https://example.test/property/" },
  ])("duplicate_$field", ({ key, field, url }) => {
    const trailer = replace(
      defaultTrailer(),
      key,
      Fixtures.cborArray([Fixtures.cborTstr(url), Fixtures.cborTstr(url)]),
    );
    expect(
      domainReasons(errorOf(decode(response({ trailer })))),
    ).toContainEqual({
      _tag: "invalid-field",
      field,
      detail: "entries must be unique",
    });
  });

  it.each(["source", "link"])("property_collision_%s", (owner) => {
    const property = Fixtures.cborTstr("https://example.test/property/");
    const properties = Fixtures.cborMap([
      [0, uint(1)],
      [1, uint(2)],
    ]);
    const trailer = replace(
      replace(defaultTrailer(), 1, Fixtures.cborArray([property, property])),
      owner === "source" ? 4 : 8,
      owner === "source" ? properties : Fixtures.cborArray([properties]),
    );
    expect(
      domainReasons(errorOf(decode(response({ trailer })))),
    ).toContainEqual({
      _tag: "invalid-field",
      field: "propertyTable",
      detail: "entries must be unique",
    });
  });

  it("duplicate_tables_aggregate", () => {
    const type = Fixtures.cborTstr("https://example.test/type/v/1");
    const property = Fixtures.cborTstr("https://example.test/property/");
    const trailer = replace(
      replace(defaultTrailer(), 0, Fixtures.cborArray([type, type])),
      1,
      Fixtures.cborArray([property, property]),
    );
    expect(
      domainReasons(errorOf(decode(response({ trailer })))).filter(
        (reason) => reason._tag === "invalid-field",
      ),
    ).toEqual([
      {
        _tag: "invalid-field",
        field: "typeTable",
        detail: "entries must be unique",
      },
      {
        _tag: "invalid-field",
        field: "propertyTable",
        detail: "entries must be unique",
      },
    ]);
  });

  it("intern_order_preserved", () => {
    const types = ["https://example.test/z/v/1", "https://example.test/a/v/1"];
    const properties = ["https://example.test/z/", "https://example.test/a/"];
    let trailer = defaultTrailer();
    trailer = replace(
      trailer,
      0,
      Fixtures.cborArray(types.map(Fixtures.cborTstr)),
    );
    trailer = replace(
      trailer,
      1,
      Fixtures.cborArray(properties.map(Fixtures.cborTstr)),
    );
    trailer = replace(
      trailer,
      3,
      Fixtures.cborArray([uint(1), Fixtures.cborNull()]),
    );
    trailer = replace(
      trailer,
      4,
      Fixtures.cborMap([
        [0, uint(1)],
        [1, uint(2)],
      ]),
    );
    trailer = replace(
      trailer,
      6,
      Fixtures.cborArray([Fixtures.cborArray([uint(1), uint(0)])]),
    );
    const document = Result.unwrap(decode(response({ trailer })));
    expect(document.trailer.typeTable).toEqual(types);
    expect(document.trailer.propertyTable).toEqual(properties);
    expect(document.trailer.typeIds).toEqual([types[1], null]);
    expect(document.trailer.linkTypeIds).toEqual([[types[1], types[0]]]);
    expect([...document.trailer.properties!]).toEqual([
      [properties[0], 1n],
      [properties[1], 2n],
    ]);
  });

  it.each([
    {
      key: 0,
      field: "typeTable",
      url: "not-a-url",
      reason: "IncorrectFormatting",
    },
    {
      key: 1,
      field: "propertyTable",
      url: "https://example.test/property",
      reason: "MissingTrailingSlash",
    },
  ])("invalid_url_$field", ({ key, field, url, reason }) => {
    const trailer = replace(
      defaultTrailer(),
      key,
      Fixtures.cborArray([Fixtures.cborTstr(url)]),
    );
    const error = errorOf(decode(response({ trailer })));
    const fieldError = causes(error).find(
      (cause) =>
        cause instanceof LocateDocument.LocateDocumentError &&
        cause.reason._tag === "invalid-field" &&
        cause.reason.field === field,
    );
    expect(fieldError?.cause).toMatchObject({ reason });
  });

  it("empty_url_tables", () => {
    let trailer = defaultTrailer();
    trailer = replace(trailer, 0, Fixtures.cborArray([]));
    trailer = replace(trailer, 1, Fixtures.cborArray([]));
    trailer = replace(
      trailer,
      3,
      Fixtures.cborArray([Fixtures.cborNull(), Fixtures.cborNull()]),
    );
    trailer = replace(trailer, 4, Fixtures.cborMap([]));
    trailer = replace(trailer, 6, Fixtures.cborArray([Fixtures.cborArray([])]));
    trailer = replace(trailer, 8, Fixtures.cborArray([Fixtures.cborMap([])]));
    const document = Result.unwrap(decode(response({ trailer })));
    expect(document.trailer.typeIds).toEqual([null, null]);
    expect(document.trailer.linkTypeIds).toEqual([[]]);
    expect(document.trailer.properties).toEqual(new Map());
    expect(document.trailer.linkProperties).toEqual([new Map()]);
  });

  it("row_counts_and_intern_bounds", () => {
    const trailer = replace(
      replace(
        defaultTrailer(),
        3,
        Fixtures.cborArray([uint(1), Fixtures.cborNull()]),
      ),
      4,
      Fixtures.cborMap([[1, uint(2)]]),
    );
    const error = errorOf(decode(response({ trailer })));
    expect(
      domainReasons(error).filter((reason) => reason._tag === "invalid-field"),
    ).toHaveLength(2);
    expect(
      Result.isErr(
        decode(
          response({
            trailer: replace(defaultTrailer(), 2, Fixtures.cborArray([])),
          }),
        ),
      ),
    ).toBe(true);
    expect(
      Result.isErr(decode(response({ columns: { 4: Fixtures.u32le([]) } }))),
    ).toBe(true);
  });

  it("point_mask_stride_padding", () => {
    const document = Result.unwrap(
      decode(response({ masks: [0xff, 0xff, 0, 0x80] }), {
        coloredTypeCount: 9,
      }),
    );
    expect(Option.isSome(document.typeMask)).toBe(true);
    if (Option.isSome(document.typeMask)) {
      expect(document.typeMask.value.stride).toBe(2);
      expect([...Result.unwrap(document.typeMask.value.at(0))]).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect([...Result.unwrap(document.typeMask.value.at(1))]).toEqual([]);
      expect([...document.typeMask.value].map((mask) => [...mask])).toEqual([
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
        [],
      ]);
    }
    expect(
      Result.isErr(
        decode(response({ masks: [1, 2] }), { coloredTypeCount: 9 }),
      ),
    ).toBe(true);
    expect(
      Result.isOk(decode(response({ masks: null }), { coloredTypeCount: 0 })),
    ).toBe(true);
    expect(
      Result.isErr(decode(response({ masks: null }), { coloredTypeCount: 1 })),
    ).toBe(true);
    expect(Result.isErr(decode(response(), { coloredTypeCount: 0 }))).toBe(
      true,
    );
  });

  it("completeness_word_padding", () => {
    const document = Result.unwrap(
      decode(
        response({
          trailer: replace(
            defaultTrailer(),
            7,
            Fixtures.cborBstr([0xfe, 255, 255, 255, 255, 255, 255, 255]),
          ),
        }),
      ),
    );
    expect(document.trailer.linkTypeIdsComplete.length).toBe(1n);
    expect([...document.trailer.linkTypeIdsComplete]).toEqual([false]);
    const first = document.trailer.linkTypeIdsComplete[Symbol.iterator]();
    const second = document.trailer.linkTypeIdsComplete[Symbol.iterator]();
    expect(first.next()).toEqual({ value: false, done: false });
    expect(first.next()).toEqual({ value: undefined, done: true });
    expect(second.next()).toEqual({ value: false, done: false });
    expect(second.next()).toEqual({ value: undefined, done: true });
    expect(Result.unwrap(document.trailer.linkTypeIdsComplete.at(0))).toBe(
      false,
    );
    expect(Result.isErr(document.trailer.linkTypeIdsComplete.at(1))).toBe(true);
    expect(
      Result.isErr(
        decode(
          response({
            trailer: replace(defaultTrailer(), 7, Fixtures.cborBstr([1])),
          }),
        ),
      ),
    ).toBe(true);
  });

  it("completeness_word_boundary", () => {
    let trailer = defaultTrailer();
    trailer = replace(
      trailer,
      5,
      Fixtures.cborArray(Array.from({ length: 65 }, () => Fixtures.cborNull())),
    );
    trailer = replace(
      trailer,
      6,
      Fixtures.cborArray(
        Array.from({ length: 65 }, () => Fixtures.cborArray([])),
      ),
    );
    trailer = replace(
      trailer,
      8,
      Fixtures.cborArray(Array.from({ length: 65 }, () => Fixtures.cborNull())),
    );
    const bits = Array.from({ length: 16 }, (_, index) =>
      index < 7 ? 0 : index === 7 ? 128 : 255,
    );
    trailer = replace(trailer, 7, Fixtures.cborBstr(bits));
    trailer = replace(trailer, 9, Fixtures.cborBstr(bits));
    const document = Result.unwrap(
      decode(
        response({
          head: replace(defaultHead(), 5, uint(65)),
          trailer,
          columns: {
            4: Fixtures.u32le(Array<number>(65).fill(61)),
            5: Fixtures.u32le(Array<number>(65).fill(11)),
            6: Array<number>(65 * 32).fill(0),
          },
        }),
      ),
    );
    expect(Result.unwrap(document.trailer.linkTypeIdsComplete.at(62))).toBe(
      false,
    );
    expect(Result.unwrap(document.trailer.linkTypeIdsComplete.at(63))).toBe(
      true,
    );
    expect(Result.unwrap(document.trailer.linkTypeIdsComplete.at(64))).toBe(
      true,
    );
    expect(Result.isErr(document.trailer.linkTypeIdsComplete.at(65))).toBe(
      true,
    );
    const expected = Array.from({ length: 65 }, (_, index) => index >= 63);
    expect([...document.trailer.linkTypeIdsComplete]).toEqual(expected);
    expect([...document.trailer.linkTypeIdsComplete]).toEqual(expected);
  });

  it("isolated_source", () => {
    let trailer = replace(
      replace(defaultTrailer(), 2, Fixtures.cborArray([Fixtures.cborNull()])),
      3,
      Fixtures.cborArray([Fixtures.cborNull()]),
    );
    for (const key of [5, 6, 8]) {
      trailer = replace(trailer, key, Fixtures.cborArray([]));
    }
    for (const key of [7, 9]) {
      trailer = replace(trailer, key, Fixtures.cborBstr([]));
    }
    const document = Result.unwrap(
      decode(
        response({
          head: replace(replace(defaultHead(), 2, uint(1)), 5, uint(0)),
          trailer,
          masks: null,
          columns: {
            1: Fixtures.f32le([0, 0]),
            2: Fixtures.u32le([61]),
            4: [],
            5: [],
            6: [],
          },
        }),
        { coloredTypeCount: 0 },
      ),
    );
    expect(document.edgeIds.length).toBe(0);
    expect(document.trailer.linkPropertiesComplete.length).toBe(0n);
    expect([...document.trailer.linkPropertiesComplete]).toEqual([]);
    expect(Result.isErr(document.trailer.linkPropertiesComplete.at(0))).toBe(
      true,
    );
  });

  it("unknown_cbor_fields", () => {
    const head = [
      ...defaultHead(),
      [
        10,
        Fixtures.cborArray([Fixtures.cborMap([[0, Fixtures.cborNull()]])]),
      ] as [number, number[]],
    ];
    expect(Result.isOk(decode(response({ head })))).toBe(true);
  });

  it("invalid_input", () => {
    const bytes = response();
    expect(Result.isErr(decode(bytes.subarray(0, bytes.length - 1)))).toBe(
      true,
    );
    expect(Result.isErr(decode(new Uint8Array([...bytes, 0])))).toBe(true);
    for (const coloredTypeCount of [
      -1,
      0.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(Result.isErr(decode(bytes, { coloredTypeCount }))).toBe(true);
    }
  });
});
