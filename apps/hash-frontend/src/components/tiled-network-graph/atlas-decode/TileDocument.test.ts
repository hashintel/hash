import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as CborDecoder from "./CborDecoder";
import * as Decoder from "./Decoder";
import * as Envelope from "./Envelope";
import * as GenerationId from "./GenerationId";
import * as Num from "./Num";
import * as Option from "./Option";
import * as Result from "./Result";
import * as TileDocument from "./TileDocument";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../libs/@local/graph/atlas/fixtures/wire",
);

interface TileSidecar {
  readonly head: {
    readonly generation: string;
    readonly variant: number;
    readonly coordinate: readonly [number, number, number];
    readonly mode: number;
    readonly delivered: number;
    readonly firstBucket: number;
    readonly runs: readonly number[];
    readonly children: number;
    readonly trailer: boolean;
    readonly global: {
      readonly visibleAtZoom: number;
      readonly boundsBits: readonly number[] | null;
      readonly minResolution: number;
    } | null;
  };
  readonly positions: readonly number[];
  readonly rowIds: readonly number[];
  readonly typeMask: readonly number[] | null;
  readonly mass: readonly number[] | null;
  readonly appended: Record<string, readonly number[]> | null;
  readonly trailer: {
    readonly labels: readonly (string | null)[];
    readonly icons: readonly (string | null)[];
  } | null;
  readonly declaration?: {
    readonly bucketSchedule: { readonly span: number };
    readonly scopeSchedule: { readonly k: number };
  };
}

const readFixture = (
  name: string,
): { buffer: ArrayBuffer; sidecar: TileSidecar } => {
  const bytes = readFileSync(path.join(fixturesDir, `${name}.saltile`));

  return {
    buffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    sidecar: JSON.parse(
      readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"),
    ) as TileSidecar,
  };
};

const runDecode = (
  buffer: ArrayBuffer,
  context: TileDocument.DecodeOptions,
): Result.Result<
  TileDocument.TileDocument<ArrayBuffer>,
  TileDocument.TileDocumentError
> => TileDocument.decode(new Decoder.Decoder(new DataView(buffer)), context);

const expectOk = <T, E>(result: Result.Result<T, E>): T => {
  if (!Result.isOk(result)) {
    throw new Error(`expected a value: ${String(result.error)}`, {
      cause: result.error,
    });
  }

  return result.value;
};

const expectError = <T, E>(result: Result.Result<T, E>): E => {
  if (!Result.isErr(result)) {
    throw new Error("expected the value to be rejected");
  }

  return result.error;
};

const reasons = (error: unknown): string[] => {
  const tags: string[] = [];
  if (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    typeof error.reason === "object" &&
    error.reason !== null &&
    "_tag" in error.reason &&
    typeof error.reason._tag === "string"
  ) {
    tags.push(error.reason._tag);
  }
  if (error instanceof Result.All) {
    for (const failure of error.errors) {
      tags.push(...reasons(failure));
    }
  } else if (error instanceof Error && error.cause !== undefined) {
    tags.push(...reasons(error.cause));
  }
  return tags;
};

const asTileDocumentError = (
  value: unknown,
): TileDocument.TileDocumentError => {
  expect(value).toBeInstanceOf(TileDocument.TileDocumentError);
  if (!(value instanceof TileDocument.TileDocumentError)) {
    throw new Error("expected a tile document error");
  }
  return value;
};

const sectionFailures = (
  error: TileDocument.TileDocumentError,
  section: "slot" | "columns" | "head" | "trailer" | "request",
): unknown[] => {
  expect(error.reason).toEqual({ _tag: "section", section });
  expect(error.cause).toBeInstanceOf(Result.All);
  if (!(error.cause instanceof Result.All)) {
    throw new Error("expected independent failures");
  }
  return error.cause.errors;
};

const positionBits = (
  column: Iterable<readonly [number, number]>,
): number[] => {
  const values = [...column].flatMap(([x, y]) => [x, y]);

  return [...new Uint32Array(Float32Array.from(values).buffer)];
};

const hexOf = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const bigEndian = (value: bigint, width: number): number[] =>
  Array.from({ length: width }, (_, index) =>
    // eslint-disable-next-line no-bitwise -- Extract one byte from the encoded integer.
    Number((value >> BigInt(8 * (width - 1 - index))) & 0xffn),
  );

const uint = (value: bigint | number, major = 0): number[] => {
  const head = major * 32;
  const encoded = BigInt(value);

  if (encoded < 24n) {
    return [head + Number(encoded)];
  }
  if (encoded <= 0xffn) {
    return [head + 24, ...bigEndian(encoded, 1)];
  }
  if (encoded <= 0xffffn) {
    return [head + 25, ...bigEndian(encoded, 2)];
  }
  if (encoded <= 0xffff_ffffn) {
    return [head + 26, ...bigEndian(encoded, 4)];
  }

  return [head + 27, ...bigEndian(encoded, 8)];
};

const bstr = (bytes: readonly number[]): number[] => [
  ...uint(bytes.length, 2),
  ...bytes,
];

const tstr = (text: string): number[] => {
  const encoded = [...new TextEncoder().encode(text)];

  return [...uint(encoded.length, 3), ...encoded];
};

const list = (entries: readonly (readonly number[])[]): number[] => [
  ...uint(entries.length, 4),
  ...entries.flat(),
];

const map = (
  entries: readonly (readonly [number, readonly number[]])[],
): number[] => [
  ...uint(entries.length, 5),
  ...[...entries]
    .sort(([left], [right]) => left - right)
    .flatMap(([key, value]) => [...uint(key), ...value]),
];

const bool = (value: boolean): number[] => [value ? 0xf5 : 0xf4];

const nul = (): number[] => [0xf6];

const float32 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);

  return [0xfa, ...new Uint8Array(view.buffer)];
};

const float64 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);

  return [0xfb, ...new Uint8Array(view.buffer)];
};

const f32le = (values: readonly number[]): number[] => [
  ...new Uint8Array(Float32Array.from(values).buffer),
];

const u32le = (values: readonly number[]): number[] => [
  ...new Uint8Array(Uint32Array.from(values).buffer),
];

const buildResponse = (
  kind: "E" | "L" | "T",
  payloads: readonly (readonly number[] | null)[],
  tail: readonly number[] = [],
): ArrayBuffer => {
  const directory = new DataView(new ArrayBuffer(payloads.length * 8));
  const body: number[] = [];
  let cursor = 16 + payloads.length * 8;

  for (const [index, payload] of payloads.entries()) {
    if (payload === null) {
      continue;
    }

    directory.setUint32(index * 8, cursor, true);
    directory.setUint32(index * 8 + 4, cursor + payload.length, true);
    body.push(...payload);
    cursor += payload.length;
    while (cursor % 8 !== 0) {
      body.push(0);
      cursor += 1;
    }
  }

  const prefix = new DataView(new ArrayBuffer(16));
  for (const [index, character] of [...`SALTILE${kind}`].entries()) {
    prefix.setUint8(index, character.charCodeAt(0));
  }
  prefix.setUint16(8, 1, true);
  prefix.setUint16(12, payloads.length, true);

  return new Uint8Array([
    ...new Uint8Array(prefix.buffer),
    ...new Uint8Array(directory.buffer),
    ...body,
    ...tail,
  ]).buffer;
};

const generationBytes = Array.from({ length: 32 }, (_, index) => index);

const defaultHeadEntries = (
  overrides: Readonly<Record<number, readonly number[] | null>> = {},
): [number, readonly number[]][] => {
  const entries: Record<number, readonly number[] | null> = {
    0: bstr(generationBytes),
    1: uint(7),
    2: list([uint(2), uint(3), uint(1)]),
    3: uint(0),
    4: uint(3),
    6: uint(4),
    7: list([uint(3)]),
    9: uint(0),
    10: bool(false),
    ...overrides,
  };

  return Object.entries(entries).flatMap(([key, value]) =>
    value === null ? [] : [[Number(key), value] as [number, readonly number[]]],
  );
};

interface TileFixtureOptions {
  readonly head?: Readonly<Record<number, readonly number[] | null>>;
  readonly positions?: readonly number[];
  readonly rowIds?: readonly number[];
  readonly typeMask?: readonly number[] | null;
  readonly mass?: readonly number[] | null;
  readonly tail?: readonly number[];
  readonly kind?: "E" | "L" | "T";
}

const tileResponse = ({
  head = {},
  positions = [0.5, -0.25, 1.5, -1.25, 2.5, -2.25],
  rowIds = [31, 34, 37],
  typeMask = null,
  mass = null,
  tail = [],
  kind = "T",
}: TileFixtureOptions = {}): ArrayBuffer =>
  buildResponse(
    kind,
    [
      map(defaultHeadEntries(head)),
      f32le(positions),
      u32le(rowIds),
      typeMask,
      mass,
    ],
    tail,
  );

const tileContext = (
  overrides: Partial<TileDocument.DecodeOptions> = {},
): TileDocument.DecodeOptions => ({
  generation: GenerationId.GenerationId.make(
    new Uint8Array(generationBytes),
  ).pipe(Result.unwrap),
  variant: 7n as Num.u64,
  mode: "delta",
  coordinate: {
    z: 2n as Num.u64,
    x: 3n as Num.u64,
    y: 1n as Num.u64,
  },
  coloredTypeCount: 0,
  ...overrides,
});

const decodeFixture = (
  name: string,
  overrides: Partial<TileDocument.DecodeOptions> = {},
): {
  document: TileDocument.TileDocument<ArrayBuffer>;
  sidecar: TileSidecar;
} => {
  const { buffer, sidecar } = readFixture(name);
  const { head } = sidecar;
  const document = expectOk(
    runDecode(
      buffer,
      tileContext({
        generation: GenerationId.GenerationId.fromHex(head.generation).pipe(
          Result.unwrap,
        ),
        variant: BigInt(head.variant) as Num.u64,
        coordinate: {
          z: BigInt(head.coordinate[0]) as Num.u64,
          x: BigInt(head.coordinate[1]) as Num.u64,
          y: BigInt(head.coordinate[2]) as Num.u64,
        },
        mode: head.mode === 0 ? "delta" : "total",
        ...overrides,
      }),
    ),
  );

  expect(hexOf(document.generation.bytes)).toBe(head.generation);
  expect(document.variant).toBe(BigInt(head.variant));
  expect([
    document.coordinate.z,
    document.coordinate.x,
    document.coordinate.y,
  ]).toEqual(head.coordinate.map(BigInt));
  expect(document.mode).toBe(head.mode === 0 ? "delta" : "total");
  expect(document.trailer !== null).toBe(head.trailer);

  expect(document.delivered).toBe(BigInt(head.delivered));
  expect(document.firstBucket).toBe(BigInt(head.firstBucket));
  expect(document.runs).toEqual(head.runs.map(BigInt));
  expect(document.children).toBe(BigInt(head.children));

  expect(positionBits(document.positions)).toEqual(sidecar.positions);
  expect(document.positions).toHaveLength(head.delivered);
  expect([...document.rowIds]).toEqual(sidecar.rowIds);

  return { document, sidecar };
};

describe("TileDocument.decode against the wire fixtures", () => {
  it("fixture_delta_nonroot", () => {
    const { document } = decodeFixture("g1-minimal-tile", {
      coloredTypeCount: 8,
    });

    expect(document.firstBucket).toBe(4n);
    expect(document.runs).toEqual([3n]);
    expect(document.children).toBe(4n);
    expect(document.global).toBeNull();
    expect(document.trailer).toBeNull();

    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    const mask = document.typeMask.value;
    expect(mask.stride).toBe(1);
    expect([...mask].map((row) => [...row])).toEqual([[0], [0, 2], []]);
    expect([...expectOk(mask.at(0))]).toEqual([0]);
    expect([...expectOk(mask.at(1))]).toEqual([0, 2]);
    expect([...expectOk(mask.at(2))]).toEqual([]);
    expect(expectOk(expectOk(mask.at(1)).has(2))).toBe(true);
    expect(expectOk(expectOk(mask.at(1)).has(1))).toBe(false);
  });

  it("fixture_root_global", () => {
    const { document, sidecar } = decodeFixture("g2-root-tile");
    const global = sidecar.head.global;
    const boundsBits = global?.boundsBits;
    if (!global || !boundsBits) {
      throw new Error("expected recorded global bounds");
    }

    expect(document.global?.visible).toBe(BigInt(global.visibleAtZoom));
    expect(document.global?.minResolution).toBe(BigInt(global.minResolution));
    expect([
      ...new Uint32Array(
        Float32Array.from(document.global?.bounds ?? []).buffer,
      ),
    ]).toEqual(boundsBits);
    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(3);
    expect(document.children).toBe(15n);
    expect(Option.isNone(document.typeMask)).toBe(true);
  });

  it("fixture_total_two_byte_mask", () => {
    const { document } = decodeFixture("g3-total-tile", {
      coloredTypeCount: 16,
    });

    expect(document.mode).toBe("total");
    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(4);
    expect(document.children).toBe(0n);
    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect(document.typeMask.value.stride).toBe(2);
    expect(document.typeMask.value).toHaveLength(6);
    expect([...expectOk(document.typeMask.value.at(4))]).toEqual([7]);
    expect([...expectOk(document.typeMask.value.at(5))]).toEqual([0, 8]);
  });

  it("fixture_empty_root", () => {
    const { document } = decodeFixture("g4-empty-root");

    expect(document.delivered).toBe(0n);
    expect(document.positions).toHaveLength(0);
    expect([...document.rowIds]).toEqual([]);
    expect(Option.isNone(document.typeMask)).toBe(true);
    expect(document.global?.visible).toBe(0n);
    expect(document.global?.bounds).toBeNull();
    expect(document.global?.minResolution).toBe(0n);
  });

  it("fixture_trailer", () => {
    const { document, sidecar } = decodeFixture("g5-trailer-tile");

    expect(document.trailer?.labels).toEqual(sidecar.trailer?.labels);
    expect(document.trailer?.icons).toEqual(sidecar.trailer?.icons);
    expect(document.trailer?.labels).toHaveLength(sidecar.head.delivered);
  });

  it("fixture_appended_slot", () => {
    const { document, sidecar } = decodeFixture("g8-appended-slot");
    expect(sidecar.mass).not.toBeNull();
    expect(sidecar.appended).not.toBeNull();
    expect(document.firstBucket).toBe(5n);
    expect(document.trailer).toBeNull();
    expect(document.global).toBeNull();
  });

  it("fixture_alignment_padding", () => {
    const low = decodeFixture("g9-padding-low", { coloredTypeCount: 8 });
    const high = decodeFixture("g10-padding-high", { coloredTypeCount: 8 });
    expect(low.document.firstBucket).toBe(26n);
    expect(high.document.firstBucket).toBe(27n);
    expect(high.sidecar.appended).not.toBeNull();
    if (!Option.isSome(low.document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect([...expectOk(low.document.typeMask.value.at(3))]).toEqual([0, 1]);
  });

  it("fixture_scoped_declaration", () => {
    const { sidecar } = readFixture("r1-scoped-route-tile");
    const declaration = sidecar.declaration;
    if (!declaration) {
      throw new Error("expected a served declaration");
    }

    expect(declaration.scopeSchedule.k).toBeGreaterThanOrEqual(1);

    const { document } = decodeFixture("r1-scoped-route-tile");
    expect(document.runs.reduce((sum, run) => sum + run, 0n)).toBe(
      document.delivered,
    );
    expect(document.delivered).toBe(30n);
    expect(document.children).toBe(5n);
  });
});

describe("TileDocument.decode request", () => {
  it("equal_values", () => {
    const options = tileContext();
    const document = expectOk(runDecode(tileResponse(), options));
    expect(document.coordinate).toEqual(options.coordinate);
    expect(document.generation.equals(options.generation)).toBe(true);
  });

  it.each(["z", "x", "y"] as const)("coordinate_%s_mismatch", (axis) => {
    const actual = tileContext().coordinate;
    const coordinate = {
      ...actual,
      [axis]: (actual[axis] + 1n) as Num.u64,
    };
    const failures = sectionFailures(
      expectError(runDecode(tileResponse(), tileContext({ coordinate }))),
      "request",
    ).map(asTileDocumentError);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toEqual({
      _tag: "coordinate-mismatch",
      expected: coordinate,
      actual,
    });
  });

  it("coordinate_u64_exact", () => {
    const x = 0xffff_ffff_ffff_ffffn as Num.u64;
    const coordinate = { ...tileContext().coordinate, x };
    const buffer = tileResponse({
      head: { 2: list([uint(coordinate.z), uint(x), uint(coordinate.y)]) },
    });
    expect(
      expectOk(runDecode(buffer, tileContext({ coordinate }))).coordinate.x,
    ).toBe(x);
    const expected = { ...coordinate, x: (x - 1n) as Num.u64 };
    const failures = sectionFailures(
      expectError(runDecode(buffer, tileContext({ coordinate: expected }))),
      "request",
    ).map(asTileDocumentError);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toEqual({
      _tag: "coordinate-mismatch",
      expected,
      actual: coordinate,
    });
  });

  it("independent_request_failures", () => {
    const actual = tileContext();
    const expected = tileContext({
      generation: GenerationId.GenerationId.make(
        new Uint8Array(32).fill(255),
      ).pipe(Result.unwrap),
      variant: 8n as Num.u64,
      mode: "total",
      coordinate: {
        z: 3n as Num.u64,
        x: 4n as Num.u64,
        y: 5n as Num.u64,
      },
    });
    const failures = sectionFailures(
      expectError(runDecode(tileResponse(), expected)),
      "request",
    ).map(asTileDocumentError);
    expect(failures.map((failure) => failure.reason._tag)).toEqual([
      "generation-mismatch",
      "variant-mismatch",
      "mode-mismatch",
      "coordinate-mismatch",
    ]);
    const generation = failures[0]?.reason;
    if (generation?._tag !== "generation-mismatch") {
      throw new Error("expected a generation mismatch");
    }
    expect(generation.expected).toBe(expected.generation);
    expect(generation.actual.equals(actual.generation)).toBe(true);
    expect(failures.slice(1).map((failure) => failure.reason)).toEqual([
      {
        _tag: "variant-mismatch",
        expected: expected.variant,
        actual: actual.variant,
      },
      { _tag: "mode-mismatch", expected: expected.mode, actual: actual.mode },
      {
        _tag: "coordinate-mismatch",
        expected: expected.coordinate,
        actual: actual.coordinate,
      },
    ]);
  });
});

describe("TileDocument.decode consistency", () => {
  it("head_missing_fields_aggregate", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 0: null, 1: null, 4: null } }),
        tileContext(),
      ),
    );
    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.generation" } },
      { reason: { _tag: "missing-field", field: "head.variant" } },
      { reason: { _tag: "missing-field", field: "head.delivered" } },
    ]);
  });

  it("slot_multiple_failures_aggregate", () => {
    const buffer = tileResponse({ head: { 1: null } });
    const view = new DataView(buffer);
    view.setUint32(16 + 8 * 2, 0, true);
    view.setUint32(16 + 8 * 2 + 4, 0, true);

    const error = expectError(runDecode(buffer, tileContext()));
    const [headError, rowIdsError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.variant" } },
    ]);
    expect(rowIdsError).toBeInstanceOf(Envelope.EnvelopeError);
    expect((rowIdsError as Envelope.EnvelopeError).reason).toEqual({
      _tag: "missing-slot",
      slot: 2,
    });
  });

  it("columns_mixed_failures_aggregate", () => {
    // Mask presence must pass for both column failures to reach the aggregate.
    const buffer = tileResponse({
      rowIds: [1],
      positions: [0.5, -0.25, 1.5, -1.25, 2.5, 0],
    });
    const directory = new DataView(buffer);
    directory.setUint32(
      16 + 8 + 4,
      directory.getUint32(16 + 8 + 4, true) - 4,
      true,
    );
    const error = expectError(runDecode(buffer, tileContext()));
    expect(sectionFailures(error, "columns")).toMatchObject([
      {
        reason: { _tag: "invalid-field", field: "positions" },
        cause: { reason: { _tag: "invalid-length", byteLength: 20 } },
      },
      { reason: { _tag: "length", field: "rowIds", expected: 3n, actual: 1 } },
    ]);
  });

  it("head_consistency_failures_aggregate", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            2: list([uint(0), uint(0), uint(0)]),
            7: list([uint(1), uint(1)]),
            9: uint(16),
          },
        }),
        tileContext(),
      ),
    );
    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "run-sum", expected: 3n, actual: 2n } },
      { reason: { _tag: "invalid-field", field: "head.children" } },
      { reason: { _tag: "missing-field", field: "head.global" } },
    ]);
  });

  it("trailer_missing_fields_aggregate", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 10: bool(true) }, tail: map([]) }),
        tileContext(),
      ),
    );
    expect(sectionFailures(error, "trailer")).toMatchObject([
      { reason: { _tag: "missing-field", field: "trailer.labels" } },
      { reason: { _tag: "missing-field", field: "trailer.icons" } },
    ]);
  });

  it("context_invalid_count", () => {
    const error = expectError(
      runDecode(tileResponse(), tileContext({ coloredTypeCount: NaN })),
    );
    expect(error.reason).toEqual({
      _tag: "invalid-context",
      field: "coloredTypeCount",
      value: NaN,
    });
  });

  it("buffer_unaligned_subview", () => {
    const encoded = tileResponse({ typeMask: [1, 2, 3] });
    const buffer = new Uint8Array(encoded.byteLength + 2).fill(255);
    buffer.set(new Uint8Array(encoded), 1);
    const document = expectOk(
      TileDocument.decode(
        new Decoder.Decoder(new DataView(buffer.buffer, 1, encoded.byteLength)),
        tileContext({ coloredTypeCount: 8 }),
      ),
    );
    expect([...document.rowIds]).toEqual([31, 34, 37]);
    expect([...document.positions]).toEqual([
      [0.5, -0.25],
      [1.5, -1.25],
      [2.5, -2.25],
    ]);
    expect(document.generation.bytes.buffer).toBe(buffer.buffer);
    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask");
    }
    const row = expectOk(document.typeMask.value.at(0));
    expect([...row]).toEqual([0]);
    buffer.fill(0);
    expect([...row]).toEqual([]);
  });
  it("kind_edges", () => {
    const error = expectError(
      runDecode(tileResponse({ kind: "E" }), tileContext()),
    );

    expect(error.reason).toEqual({ _tag: "invalid-kind", actual: "SALTILEE" });
  });

  it("kind_locate", () => {
    const buffer = buildResponse("L", [
      map(defaultHeadEntries()),
      f32le([0.5, -0.25, 1.5, -1.25, 2.5, -2.25]),
      u32le([31, 34, 37]),
      null,
      null,
      null,
      null,
    ]);
    const error = expectError(runDecode(buffer, tileContext()));

    expect(error.reason).toEqual({ _tag: "invalid-kind", actual: "SALTILEL" });
  });

  it("envelope_version", () => {
    const buffer = tileResponse();
    new DataView(buffer).setUint16(8, 2, true);
    const error = expectError(runDecode(buffer, tileContext()));

    expect(reasons(error)).toEqual(["decode", "invalid-version"]);
  });

  it("envelope_truncation", () => {
    const whole = tileResponse();
    const error = expectError(
      runDecode(whole.slice(0, whole.byteLength - 4), tileContext()),
    );

    expect(reasons(error)).toEqual(["decode", "decode", "eof"]);
  });

  it("head_unknown_key", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 5: uint(1) } }), tileContext()),
    );

    const [unknownFieldError] = sectionFailures(error, "slot");
    expect(unknownFieldError).toMatchObject({
      reason: { _tag: "unknown-field", section: "head", key: 5n },
    });
  });

  it("head_missing_key", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 4: null } }), tileContext()),
    );

    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.delivered" } },
    ]);
  });

  it("mode_invalid", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 3: uint(2) } }), tileContext()),
    );

    const [modeError] = sectionFailures(error, "slot");
    expect(modeError).toMatchObject({
      reason: { _tag: "invalid-field", field: "head.mode" },
    });
  });

  it("coordinate_length", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 2: list([uint(2), uint(3)]) } }),
        tileContext(),
      ),
    );

    const [lengthError] = sectionFailures(error, "slot");
    expect(lengthError).toMatchObject({
      reason: {
        _tag: "length",
        field: "head.coordinate",
        expected: 3n,
        actual: 2,
      },
    });
  });

  it("children_reserved_bits", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 9: uint(16) } }), tileContext()),
    );

    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "invalid-field", field: "head.children" } },
    ]);
  });

  it("delta_first_bucket", () => {
    const document = expectOk(
      runDecode(tileResponse({ head: { 6: uint(3) } }), tileContext()),
    );
    expect(document.firstBucket).toBe(3n);
  });

  it("delta_run_count", () => {
    const document = expectOk(
      runDecode(
        tileResponse({ head: { 7: list([uint(1), uint(2)]) } }),
        tileContext(),
      ),
    );
    expect(document.runs).toEqual([1n, 2n]);
  });

  it("total_run_count", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: {
            3: uint(1),
            6: uint(0),
            7: list([uint(1), uint(1), uint(1)]),
          },
        }),
        tileContext({ mode: "total" }),
      ),
    );
    expect(document.runs).toEqual([1n, 1n, 1n]);
  });

  it("total_bucket_gaps", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: {
            3: uint(1),
            6: uint(0),
            7: list([uint(1), uint(0), uint(0), uint(0), uint(2)]),
          },
        }),
        tileContext({ mode: "total" }),
      ),
    );

    expect(document.mode).toBe("total");
    expect(document.runs).toEqual([1n, 0n, 0n, 0n, 2n]);
  });

  it("delta_root_bucket_gaps", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: {
            2: list([uint(0), uint(0), uint(0)]),
            6: uint(0),
            7: list([uint(1), uint(0), uint(2)]),
            8: map([
              [0, uint(3)],
              [1, list([float32(-1), float32(-1), float32(1), float32(1)])],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext({
          coordinate: {
            z: 0n as Num.u64,
            x: 0n as Num.u64,
            y: 0n as Num.u64,
          },
        }),
      ),
    );

    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(3);
    expect(document.global?.bounds).toEqual([-1, -1, 1, 1]);
  });

  it("run_sum_mismatch", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 7: list([uint(2)]) } }), tileContext()),
    );

    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      {
        reason: {
          _tag: "run-sum",
          expected: 3n,
          actual: 2n,
        },
      },
    ]);
  });

  it.each([0, 3])("root_global_missing_%i", (count) => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            2: list([uint(0), uint(0), uint(0)]),
            4: uint(count),
            6: uint(0),
            7: list([uint(count)]),
          },
          positions: [0.5, -0.25, 1.5, -1.25, 2.5, -2.25].slice(0, count * 2),
          rowIds: [31, 34, 37].slice(0, count),
        }),
        tileContext(),
      ),
    );

    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.global" } },
    ]);
  });

  it("global_bounds_missing", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            8: map([
              [0, uint(7)],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext(),
      ),
    );

    const [headError] = sectionFailures(error, "slot");
    expect(
      sectionFailures(asTileDocumentError(headError), "head"),
    ).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.global.bounds" } },
    ]);
  });

  it("global_bounds_empty", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: {
            8: map([
              [0, uint(0)],
              [2, uint(0)],
            ]),
          },
        }),
        tileContext(),
      ),
    );

    expect(document.global?.bounds).toBeNull();
  });

  it("global_bounds_length", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            8: map([
              [0, uint(3)],
              [1, list([float32(0), float32(0), float32(1)])],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext(),
      ),
    );

    const [lengthError] = sectionFailures(error, "slot");
    expect(lengthError).toMatchObject({
      reason: {
        _tag: "length",
        field: "head.global.bounds",
        expected: 4n,
        actual: 3,
      },
    });
  });

  it.each([
    [NaN, 0, 1, 1],
    [0, NaN, 1, 1],
    [0, 0, NaN, 1],
    [0, 0, 1, NaN],
    [Infinity, 0, 1, 1],
    [0, Infinity, 1, 1],
    [0, 0, Infinity, 1],
    [0, 0, 1, Infinity],
    [-Infinity, 0, 1, 1],
    [0, -Infinity, 1, 1],
    [0, 0, -Infinity, 1],
    [0, 0, 1, -Infinity],
    [1, 0, -1, 1],
    [0, 1, 1, -1],
  ])("global_bounds_invalid_%s_%s_%s_%s", (minX, minY, maxX, maxY) => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            2: list([uint(0), uint(0), uint(0)]),
            8: map([
              [0, uint(3)],
              [1, list([minX, minY, maxX, maxY].map(float32))],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext({
          coordinate: {
            z: Num.u64.unsafe(0n),
            x: Num.u64.unsafe(0n),
            y: Num.u64.unsafe(0n),
          },
        }),
      ),
    );

    expect(sectionFailures(error, "slot")).toMatchObject([
      { reason: { _tag: "invalid-field", field: "head.global.bounds" } },
    ]);
  });

  it.each([
    [-0, -0, 0, 0],
    [-0.5, -2, -0.5, 3],
    [-2, 0, 3, 0],
    [-3.4028234663852886e38, -1, 3.4028234663852886e38, 1],
  ])("global_bounds_valid_%s_%s_%s_%s", (minX, minY, maxX, maxY) => {
    const bounds = [minX, minY, maxX, maxY];
    const document = expectOk(
      runDecode(
        tileResponse({
          head: {
            2: list([uint(0), uint(0), uint(0)]),
            8: map([
              [0, uint(3)],
              [1, list(bounds.map(float32))],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext({
          coordinate: {
            z: Num.u64.unsafe(0n),
            x: Num.u64.unsafe(0n),
            y: Num.u64.unsafe(0n),
          },
        }),
      ),
    );

    expect(document.global?.bounds).toEqual(bounds);
  });

  it("global_bounds_f64", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: {
            8: map([
              [0, uint(3)],
              [1, list([float64(0), float64(0), float64(1), float64(1)])],
              [2, uint(5)],
            ]),
          },
        }),
        tileContext(),
      ),
    );

    const [cborError] = sectionFailures(error, "slot");
    expect(cborError).toBeInstanceOf(CborDecoder.CborDecoderError);
    expect((cborError as CborDecoder.CborDecoderError).reason).toMatchObject({
      _tag: "unexpected-kind",
    });
  });

  it("integer_noncanonical", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 4: [0x19, 0x00, 0x03] } }),
        tileContext(),
      ),
    );

    const [cborError] = sectionFailures(error, "slot");
    expect(cborError).toBeInstanceOf(CborDecoder.CborDecoderError);
    expect((cborError as CborDecoder.CborDecoderError).reason).toMatchObject({
      _tag: "invalid-encoding",
    });
  });

  it("positions_count_mismatch", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: { 4: uint(4), 7: list([uint(4)]) },
          rowIds: [1, 2, 3, 4],
        }),
        tileContext(),
      ),
    );

    expect(reasons(error)).toEqual(["section", "length"]);
    expect(sectionFailures(error, "columns")[0]).toMatchObject({
      reason: {
        _tag: "length",
        field: "positions",
        expected: 4n,
        actual: 3,
      },
    });
  });

  it("count_above_safe_integer", () => {
    const huge = 2n ** 53n + 1n;
    const error = expectError(
      runDecode(
        tileResponse({ head: { 4: uint(huge), 7: list([uint(huge)]) } }),
        tileContext(),
      ),
    );

    expect(sectionFailures(error, "columns")[0]).toMatchObject({
      reason: { _tag: "length", field: "positions", expected: huge, actual: 3 },
    });
  });

  it("row_ids_absent", () => {
    const buffer = tileResponse();
    const view = new DataView(buffer);
    view.setUint32(16 + 8 * 2, 0, true);
    view.setUint32(16 + 8 * 2 + 4, 0, true);
    const error = expectError(runDecode(buffer, tileContext()));

    const [rowIdsError] = sectionFailures(error, "slot");
    expect(rowIdsError).toBeInstanceOf(Envelope.EnvelopeError);
    expect((rowIdsError as Envelope.EnvelopeError).reason).toEqual({
      _tag: "missing-slot",
      slot: 2,
    });
  });

  it("type_mask_unrequested", () => {
    const error = expectError(
      runDecode(tileResponse({ typeMask: [1, 2, 3] }), tileContext()),
    );

    expect(error.reason).toEqual({ _tag: "unexpected-slot", slot: 3 });
  });

  it("type_mask_absent", () => {
    const error = expectError(
      runDecode(tileResponse(), tileContext({ coloredTypeCount: 4 })),
    );

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(Envelope.EnvelopeError);
    expect((error.cause as Envelope.EnvelopeError).reason).toEqual({
      _tag: "missing-slot",
      slot: 3,
    });
  });

  it("columns_present_empty", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: { 4: uint(0), 7: list([uint(0)]) },
          positions: [],
          rowIds: [],
          typeMask: [],
        }),
        tileContext({ coloredTypeCount: 4 }),
      ),
    );

    expect(document.delivered).toBe(0n);
    expect(document.positions).toHaveLength(0);
    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect(document.typeMask.value).toHaveLength(0);
    expect(document.typeMask.value.stride).toBe(1);
  });

  it("type_mask_unrequested_empty", () => {
    const error = expectError(
      runDecode(tileResponse({ typeMask: [] }), tileContext()),
    );

    expect(error.reason).toEqual({ _tag: "unexpected-slot", slot: 3 });
  });

  it("type_mask_width", () => {
    const error = expectError(
      runDecode(
        tileResponse({ typeMask: [1, 2, 3] }),
        tileContext({ coloredTypeCount: 9 }),
      ),
    );

    expect(sectionFailures(error, "columns")[0]).toMatchObject({
      reason: { _tag: "invalid-field", field: "typeMask" },
    });
  });

  it("type_mask_count_mismatch", () => {
    const error = expectError(
      runDecode(
        tileResponse({ typeMask: [1, 2, 3, 4] }),
        tileContext({ coloredTypeCount: 8 }),
      ),
    );

    expect(sectionFailures(error, "columns")[0]).toMatchObject({
      reason: { _tag: "length", field: "typeMask", expected: 3n, actual: 4 },
    });
  });

  it("type_mask_unused_bits", () => {
    const document = expectOk(
      runDecode(
        tileResponse({ typeMask: [0b1111_1101, 0b0000_0010, 0b0000_0000] }),
        tileContext({ coloredTypeCount: 2 }),
      ),
    );

    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect(document.typeMask.value.stride).toBe(1);
    expect([...expectOk(document.typeMask.value.at(0))]).toEqual([0]);
    expect([...expectOk(document.typeMask.value.at(1))]).toEqual([1]);
    expect([...expectOk(document.typeMask.value.at(2))]).toEqual([]);
  });

  it("trailer_absent", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 10: bool(true) } }), tileContext()),
    );
    expect(reasons(error)).toEqual(["decode", "unexpected-end"]);
  });

  it("trailer_undeclared", () => {
    const error = expectError(
      runDecode(
        tileResponse({ tail: map([[0, list([nul(), nul(), nul()])]]) }),
        tileContext(),
      ),
    );

    expect(error.reason).toEqual({
      _tag: "invalid-field",
      field: "head.trailer",
      detail: "undeclared trailing bytes",
    });
  });

  it("trailer_delivered_order", () => {
    const document = expectOk(
      runDecode(
        tileResponse({
          head: { 10: bool(true) },
          tail: map([
            [0, list([tstr("Zürich"), nul(), tstr("🦀")])],
            [1, list([nul(), tstr("水戸"), nul()])],
          ]),
        }),
        tileContext(),
      ),
    );

    expect(document.trailer?.labels).toEqual(["Zürich", null, "🦀"]);
    expect(document.trailer?.icons).toEqual([null, "水戸", null]);
  });

  it("trailer_count_mismatch", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: { 10: bool(true) },
          tail: map([
            [0, list([tstr("one"), tstr("two")])],
            [1, list([nul(), nul(), nul()])],
          ]),
        }),
        tileContext(),
      ),
    );

    expect(error.reason).toEqual({
      _tag: "length",
      field: "trailer.labels",
      expected: 3n,
      actual: 2,
    });
  });

  it("trailer_missing_column", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: { 10: bool(true) },
          tail: map([[0, list([nul(), nul(), nul()])]]),
        }),
        tileContext(),
      ),
    );

    expect(reasons(error)).toEqual(["section", "missing-field"]);
    expect(sectionFailures(error, "trailer")[0]).toMatchObject({
      reason: { _tag: "missing-field", field: "trailer.icons" },
    });
  });

  it("trailer_unknown_key", () => {
    const error = expectError(
      runDecode(
        tileResponse({
          head: { 10: bool(true) },
          tail: map([
            [0, list([nul(), nul(), nul()])],
            [1, list([nul(), nul(), nul()])],
            [2, uint(1)],
          ]),
        }),
        tileContext(),
      ),
    );

    expect(error.reason).toEqual({
      _tag: "unknown-field",
      section: "trailer",
      key: 2n,
    });
  });

  it("context_negative_count", () => {
    const error = expectError(
      runDecode(tileResponse(), tileContext({ coloredTypeCount: -1 })),
    );
    expect(error.reason).toEqual({
      _tag: "invalid-context",
      field: "coloredTypeCount",
      value: -1,
    });
  });

  it("columns_borrowed", () => {
    const buffer = tileResponse({ rowIds: [7, 8, 9] });
    const document = expectOk(runDecode(buffer, tileContext()));

    expect([...document.rowIds]).toEqual([7, 8, 9]);
    const rowIdsStart = new DataView(buffer).getUint32(16 + 8 * 2, true);
    new DataView(buffer).setUint32(rowIdsStart, 11, true);

    expect([...document.rowIds]).toEqual([11, 8, 9]);
  });

  it("unexpected_exception", () => {
    const decoder = new Decoder.Decoder(new DataView(tileResponse()));
    const failing = new Proxy(decoder, {
      get: (target, property) => {
        if (property === "remaining") {
          throw new RangeError("cursor unavailable");
        }

        const value = Reflect.get(target, property, target) as unknown;

        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const error = expectError(TileDocument.decode(failing, tileContext()));

    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(RangeError);
  });

  it("buffer_detached", () => {
    const buffer = tileResponse();
    const decoder = new Decoder.Decoder(new DataView(buffer));
    structuredClone(buffer, { transfer: [buffer] });

    expect(Result.isErr(TileDocument.decode(decoder, tileContext()))).toBe(
      true,
    );
  });
});
