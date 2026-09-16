import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as Decoder from "./Decoder";
import * as Result from "./Result";
import * as TileDocument from "./TileDocument";
import * as TypeMask from "./TypeMask";

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
  context: TileDocument.Context,
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

const failures = (error: TileDocument.TileDocumentError): unknown[] => {
  expect(error.reason._tag).toBe("section");
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
  overrides: Partial<TileDocument.Context> = {},
): TileDocument.Context => ({
  coloredTypeCount: 0,
  ...overrides,
});

const decodeFixture = (
  name: string,
  overrides: Partial<TileDocument.Context> = {},
): {
  document: TileDocument.TileDocument<ArrayBuffer>;
  sidecar: TileSidecar;
} => {
  const { buffer, sidecar } = readFixture(name);
  const document = expectOk(runDecode(buffer, tileContext(overrides)));
  const { head } = sidecar;

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
    const { document, sidecar } = decodeFixture("g1-minimal-tile", {
      coloredTypeCount: 8,
    });

    expect(document.firstBucket).toBe(4n);
    expect(document.runs).toEqual([3n]);
    expect(document.children).toBe(4n);
    expect(document.global).toBeNull();
    expect(document.trailer).toBeNull();

    const mask = document.typeMask;
    if (mask === null) {
      throw new Error("expected a type mask column");
    }
    expect(mask.stride).toBe(1);
    expect([...mask].map((row) => [...row])).toEqual(
      (sidecar.typeMask ?? []).map((byte) => [byte]),
    );
    expect(expectOk(mask.types(0))).toEqual([0]);
    expect(expectOk(mask.types(1))).toEqual([0, 2]);
    expect(expectOk(mask.types(2))).toEqual([]);
    expect(expectOk(mask.has(1, 2))).toBe(true);
    expect(expectOk(mask.has(1, 1))).toBe(false);
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
    expect(document.typeMask).toBeNull();
  });

  it("fixture_total_two_byte_mask", () => {
    const { document } = decodeFixture("g3-total-tile", {
      coloredTypeCount: 16,
    });

    expect(document.mode).toBe("total");
    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(4);
    expect(document.children).toBe(0n);
    expect(document.typeMask?.stride).toBe(2);
    expect(document.typeMask).toHaveLength(6);
    expect(expectOk(document.typeMask?.types(4) ?? Result.ok([]))).toEqual([7]);
    expect(expectOk(document.typeMask?.types(5) ?? Result.ok([]))).toEqual([
      0, 8,
    ]);
  });

  it("fixture_empty_root", () => {
    const { document } = decodeFixture("g4-empty-root");

    expect(document.delivered).toBe(0n);
    expect(document.positions).toHaveLength(0);
    expect([...document.rowIds]).toEqual([]);
    expect(document.typeMask).toBeNull();
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
    expect(expectOk(low.document.typeMask?.types(3) ?? Result.ok([]))).toEqual([
      0, 1,
    ]);
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

describe("TileDocument.decode consistency", () => {
  it("head_missing_fields_aggregate", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 0: null, 1: null, 4: null } }),
        tileContext(),
      ),
    );
    expect(error.reason).toEqual({ _tag: "section", section: "head" });
    expect(failures(error)).toMatchObject([
      { reason: { _tag: "missing-field", field: "head.generation" } },
      { reason: { _tag: "missing-field", field: "head.variant" } },
      { reason: { _tag: "missing-field", field: "head.delivered" } },
    ]);
  });

  it("columns_mixed_failures_aggregate", () => {
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
    const error = expectError(
      runDecode(buffer, tileContext({ coloredTypeCount: 1 })),
    );
    expect(error.reason).toEqual({ _tag: "section", section: "columns" });
    expect(failures(error)).toMatchObject([
      {
        reason: { _tag: "invalid-field", field: "positions" },
        cause: { reason: { _tag: "invalid-length", byteLength: 20 } },
      },
      { reason: { _tag: "length", field: "rowIds", expected: 3n, actual: 1 } },
      { reason: { _tag: "missing-slot", slot: 3 } },
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
    expect(error.reason).toEqual({ _tag: "section", section: "head" });
    expect(failures(error)).toMatchObject([
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
    expect(error.reason).toEqual({ _tag: "section", section: "trailer" });
    expect(failures(error)).toMatchObject([
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
    const mask = document.typeMask;
    if (mask === null) {
      throw new Error("expected a type mask");
    }
    const row = expectOk(mask.at(0));
    expect(row.buffer).toBe(buffer.buffer);
    expect([...row]).toEqual([1]);
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

    expect(error.reason).toEqual({
      _tag: "unknown-field",
      section: "head",
      key: 5n,
    });
  });

  it("head_missing_key", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 4: null } }), tileContext()),
    );

    expect(reasons(error)).toEqual(["section", "missing-field"]);
    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "missing-field", field: "head.delivered" },
    });
  });

  it("mode_invalid", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 3: uint(2) } }), tileContext()),
    );

    expect(error.reason).toMatchObject({
      _tag: "invalid-field",
      field: "head.mode",
    });
  });

  it("coordinate_length", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 2: list([uint(2), uint(3)]) } }),
        tileContext(),
      ),
    );

    expect(error.reason).toEqual({
      _tag: "length",
      field: "head.coordinate",
      expected: 3n,
      actual: 2,
    });
  });

  it("children_reserved_bits", () => {
    const error = expectError(
      runDecode(tileResponse({ head: { 9: uint(16) } }), tileContext()),
    );

    expect(reasons(error)).toEqual(["section", "invalid-field"]);
    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "invalid-field", field: "head.children" },
    });
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
        tileContext(),
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
        tileContext(),
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
        tileContext(),
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

    expect(failures(error)[0]).toMatchObject({
      reason: {
        _tag: "run-sum",
        expected: 3n,
        actual: 2n,
      },
    });
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

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "missing-field", field: "head.global" },
    });
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

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "missing-field", field: "head.global.bounds" },
    });
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

    expect(error.reason).toEqual({
      _tag: "length",
      field: "head.global.bounds",
      expected: 4n,
      actual: 3,
    });
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

    expect(reasons(error)).toEqual(["decode", "unexpected-kind"]);
  });

  it("integer_noncanonical", () => {
    const error = expectError(
      runDecode(
        tileResponse({ head: { 4: [0x19, 0x00, 0x03] } }),
        tileContext(),
      ),
    );

    expect(reasons(error)).toEqual(["decode", "invalid-encoding"]);
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
    expect(failures(error)[0]).toMatchObject({
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

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "length", field: "positions", expected: huge, actual: 3 },
    });
  });

  it("row_ids_absent", () => {
    const buffer = tileResponse();
    const view = new DataView(buffer);
    view.setUint32(16 + 8 * 2, 0, true);
    view.setUint32(16 + 8 * 2 + 4, 0, true);
    const error = expectError(runDecode(buffer, tileContext()));

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "missing-slot", slot: 2 },
    });
  });

  it("type_mask_unrequested", () => {
    const error = expectError(
      runDecode(tileResponse({ typeMask: [1, 2, 3] }), tileContext()),
    );

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "unexpected-slot", slot: 3 },
    });
  });

  it("type_mask_absent", () => {
    const error = expectError(
      runDecode(tileResponse(), tileContext({ coloredTypeCount: 4 })),
    );

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "missing-slot", slot: 3 },
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
    expect(document.typeMask).toHaveLength(0);
    expect(document.typeMask?.stride).toBe(1);
  });

  it("type_mask_unrequested_empty", () => {
    const error = expectError(
      runDecode(tileResponse({ typeMask: [] }), tileContext()),
    );

    expect(failures(error)[0]).toMatchObject({
      reason: { _tag: "unexpected-slot", slot: 3 },
    });
  });

  it("type_mask_width", () => {
    const error = expectError(
      runDecode(
        tileResponse({ typeMask: [1, 2, 3] }),
        tileContext({ coloredTypeCount: 9 }),
      ),
    );

    expect(failures(error)[0]).toMatchObject({
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

    expect(failures(error)[0]).toMatchObject({
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

    expect(document.typeMask?.stride).toBe(1);
    expect(expectOk(document.typeMask?.types(0) ?? Result.ok([]))).toEqual([0]);
    expect(expectOk(document.typeMask?.types(1) ?? Result.ok([]))).toEqual([1]);
    expect(expectOk(document.typeMask?.types(2) ?? Result.ok([]))).toEqual([]);
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
    expect(failures(error)[0]).toMatchObject({
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

describe("TypeMaskColumn", () => {
  it("type_index_above_signed_32_bit", () => {
    const type = 2 ** 31;
    const bytes = new Uint8Array(Math.floor(type / 8) + 1);
    bytes[bytes.length - 1] = 1;
    const column = new TypeMask.TypeMaskColumn(bytes, type + 1);
    expect(expectOk(column.has(0, type))).toBe(true);
    expect(expectOk(column.has(0, type - 1))).toBe(false);
  });

  it("empty_column_stride", () => {
    const column = new TypeMask.TypeMaskColumn(new Uint8Array(), 9);
    expect(column.length).toBe(0);
    expect(column.typeCount).toBe(9);
    expect(column.stride).toBe(2);
    expect([...column]).toEqual([]);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "type_count_invalid_%s",
    (typeCount) => {
      expect(
        () => new TypeMask.TypeMaskColumn(new Uint8Array(), typeCount),
      ).toThrow(TypeMask.TypeMaskColumnError);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "row_index_invalid_%s",
    (index) => {
      const column = new TypeMask.TypeMaskColumn(Uint8Array.of(1), 1);
      expect(Result.isErr(column.at(index))).toBe(true);
      expect(Result.isErr(column.has(index, 0))).toBe(true);
      expect(Result.isErr(column.types(index))).toBe(true);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "type_index_invalid_%s",
    (type) => {
      const column = new TypeMask.TypeMaskColumn(Uint8Array.of(1), 1);
      expect(Result.isErr(column.has(0, type))).toBe(true);
    },
  );
  it("storage_width", () => {
    expect(
      () => new TypeMask.TypeMaskColumn(Uint8Array.of(1, 2, 3), 9),
    ).toThrow(TypeMask.TypeMaskColumnError);
  });

  it("lookup_out_of_range", () => {
    const column = new TypeMask.TypeMaskColumn(Uint8Array.of(1, 2), 3);

    expect(expectError(column.at(2)).reason).toEqual({
      _tag: "invalid-index",
      index: 2,
      length: 2,
    });
    expect(expectError(column.has(0, 3)).reason).toEqual({
      _tag: "invalid-type",
      type: 3,
      typeCount: 3,
    });
  });

  it("mask_stride_and_padding", () => {
    const column = new TypeMask.TypeMaskColumn(
      Uint8Array.of(0x01, 0x02, 0x00, 0x01),
      9,
    );

    expect(column).toHaveLength(2);
    expect([...expectOk(column.at(0))]).toEqual([0x01, 0x02]);
    expect(expectOk(column.types(0))).toEqual([0]);
    expect(expectOk(column.has(1, 8))).toBe(true);
    expect(expectOk(column.types(1))).toEqual([8]);
  });
});
