import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CborDecoder,
  CborDecoderError,
  type CborArrayAccess,
  type CborDecoderErrorReason,
  type CborMapAccess,
  type CborVisitor,
} from "./CborDecoder";
import * as Result from "./Result";

import type { F32, F64, U64 } from "./Decoder";

/** A generic value tree constructed by a visitor for the profile tests. */
type Value =
  | bigint
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | readonly Value[]
  | ReadonlyMap<bigint, Value>;

const unsignedVisitor: CborVisitor<U64, never> = {
  expecting: "an unsigned integer",
  visitUnsignedInteger: Result.ok,
};
const bytesVisitor: CborVisitor<Uint8Array, never> = {
  expecting: "a byte string",
  visitByteString: Result.ok,
};
const float32Visitor: CborVisitor<F32, never> = {
  expecting: "a single-precision float",
  visitFloat32: Result.ok,
};
const float64Visitor: CborVisitor<F64, never> = {
  expecting: "a double-precision float",
  visitFloat64: Result.ok,
};
const valueVisitor: CborVisitor<Value, never> = {
  expecting: "a CBOR value",
  visitUnsignedInteger: Result.ok,
  visitNegativeInteger: Result.ok,
  visitByteString: Result.ok,
  visitTextString: Result.ok,
  visitBoolean: Result.ok,
  visitNull: () => Result.ok(null),
  visitFloat32: Result.ok,
  visitFloat64: Result.ok,
  visitArray: (array) =>
    Result.gen(function* readArray() {
      const values: Value[] = [];
      while (array.remaining > 0) {
        values.push(yield* array.readElement(valueVisitor));
      }
      return values;
    }),
  visitMap: (map) =>
    Result.gen(function* readMap() {
      const entries = new Map<bigint, Value>();
      while (map.remaining > 0) {
        const key = yield* map.readKey();
        entries.set(key, yield* map.readValue(valueVisitor));
      }
      return entries;
    }),
};

/** Checks a profile error and its offset within the supplied byte view. */
const expectError = (
  result: Result.Result<unknown, CborDecoderError>,
  tag: CborDecoderErrorReason["_tag"],
  offset: number,
): void => {
  expect(Result.isErr(result)).toBe(true);
  if (Result.isErr(result)) {
    expect(result.error).toBeInstanceOf(CborDecoderError);
    expect(result.error.reason._tag).toBe(tag);
    expect(result.error.offset).toBe(offset);
  }
};

/** Domain output constructed directly from a CBOR map. */
class Header {
  /** Retains the generation bytes and variant index. */
  constructor(
    readonly generation: Uint8Array,
    readonly variant: U64,
  ) {}
}

/** A required header field was missing or malformed. */
class HeaderError extends Error {}

/** Construction of a header with keys 0 and 1. */
class HeaderVisitor implements CborVisitor<Header, HeaderError> {
  readonly expecting = "a generation and variant header";

  /** Decodes the generation byte string and unsigned variant index. */
  visitMap(
    map: CborMapAccess,
  ): Result.Result<Header, HeaderError | CborDecoderError> {
    return Result.gen(function* readHeader() {
      if (map.remaining !== 2 || (yield* map.readKey()) !== 0n) {
        return yield* Result.err(new HeaderError("missing generation"));
      }
      const generation = yield* map.readValue(bytesVisitor);
      if (generation.length !== 32 || (yield* map.readKey()) !== 1n) {
        return yield* Result.err(
          new HeaderError("invalid generation or missing variant"),
        );
      }
      const variant = yield* map.readValue(unsignedVisitor);
      return new Header(generation, variant);
    });
  }
}

/** Text visitor whose implementation reads instance state. */
class PrefixedTextVisitor implements CborVisitor<string, never> {
  readonly expecting = "text";

  /** Records a prefix for the constructed string. */
  constructor(readonly prefix: string) {}

  /** Prepends the instance's prefix to the decoded text. */
  visitTextString(value: string): Result.Result<string> {
    return Result.ok(this.prefix + value);
  }
}

describe("CborDecoder scalars", () => {
  it.each([
    { bytes: [0x00], value: 0n },
    { bytes: [0x17], value: 23n },
    { bytes: [0x18, 0x18], value: 24n },
    { bytes: [0x18, 0xff], value: 255n },
    { bytes: [0x19, 0x01, 0x00], value: 256n },
    { bytes: [0x19, 0xff, 0xff], value: 65535n },
    { bytes: [0x1a, 0x00, 0x01, 0x00, 0x00], value: 65536n },
    { bytes: [0x1a, 0xff, 0xff, 0xff, 0xff], value: 4294967295n },
    { bytes: [0x1b, 0, 0, 0, 1, 0, 0, 0, 0], value: 4294967296n },
    {
      bytes: [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      value: 18446744073709551615n,
    },
    { bytes: [0x20], value: -1n },
    { bytes: [0x38, 0x18], value: -25n },
    {
      bytes: [0x3b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      value: -18446744073709551616n,
    },
    { bytes: [0xf4], value: false },
    { bytes: [0xf5], value: true },
    { bytes: [0xf6], value: null },
    { bytes: [0x60], value: "" },
    { bytes: [0x63, 0x63, 0xc3, 0xa9], value: "cé" },
    { bytes: [0x64, 0xef, 0xbb, 0xbf, 0x61], value: "\ufeffa" },
  ])("scalar $value", ({ bytes, value }) => {
    expect(
      new CborDecoder(Uint8Array.from(bytes)).decode(valueVisitor),
    ).toEqual(Result.ok(value));
  });

  it("float_width", () => {
    const single = Uint8Array.of(0xfa, 0x3f, 0xc0, 0, 0);
    const double = Uint8Array.of(0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0);
    const first = new CborDecoder(single).decode(float32Visitor);
    const second = new CborDecoder(double).decode(float64Visitor);
    expect(first).toEqual(Result.ok(1.5));
    expect(second).toEqual(Result.ok(1.5));
    expectTypeOf(first).toEqualTypeOf<Result.Result<F32, CborDecoderError>>();
    expectTypeOf(second).toEqualTypeOf<Result.Result<F64, CborDecoderError>>();
    expectError(
      new CborDecoder(single).decode(float64Visitor),
      "unexpected-kind",
      0,
    );
    expectError(
      new CborDecoder(double).decode(unsignedVisitor),
      "unexpected-kind",
      0,
    );
  });

  it.each([
    { name: "negative_zero", bytes: [0xfa, 0x80, 0, 0, 0], value: -0 },
    { name: "infinity", bytes: [0xfa, 0x7f, 0x80, 0, 0], value: Infinity },
    { name: "nan", bytes: [0xfa, 0x7f, 0xc0, 0, 0], value: NaN },
  ])("float_$name", ({ bytes, value }) => {
    const result = new CborDecoder(Uint8Array.from(bytes)).decode(
      float32Visitor,
    );
    expect(
      Result.match(result, {
        onOk: (decoded) => Object.is(decoded, value),
        onErr: () => false,
      }),
    ).toBe(true);
  });

  it("borrowed_subview", () => {
    const buffer = Uint8Array.of(0xff, 0x42, 0xaa, 0xbb, 0xff);
    const result = new CborDecoder(buffer.subarray(1, 4)).decode(bytesVisitor);
    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.buffer).toBe(buffer.buffer);
      expect(result.value.byteOffset).toBe(buffer.byteOffset + 2);
      expect([...result.value]).toEqual([0xaa, 0xbb]);
    }
  });

  it("big_endian_subview", () => {
    const bytes = Uint8Array.of(0xff, 0x19, 0x12, 0x34, 0xff);
    expect(
      new CborDecoder(bytes.subarray(1, 4)).decode(unsignedVisitor),
    ).toEqual(Result.ok(0x1234n));
  });

  it("visitor_receiver", () => {
    expect(
      new CborDecoder(Uint8Array.of(0x61, 0x61)).decode(
        new PrefixedTextVisitor("label:"),
      ),
    ).toEqual(Result.ok("label:a"));
  });
});

describe("CborDecoder containers", () => {
  it("direct_class", () => {
    const generation = Uint8Array.from({ length: 32 }, (_, index) => index);
    const bytes = Uint8Array.of(0xa2, 0, 0x58, 32, ...generation, 1, 0x18, 42);
    const result = new CborDecoder(bytes).decode(new HeaderVisitor());
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<Header, HeaderError | CborDecoderError>
    >();
    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value).toBeInstanceOf(Header);
      expect(result.value.variant).toBe(42n);
      expect(result.value.generation.buffer).toBe(bytes.buffer);
      expect(result.value.generation).toEqual(generation);
    }
  });

  it("nested_tree", () => {
    const bytes = Uint8Array.of(
      0x83,
      0x80,
      0xa0,
      0xa2,
      0,
      0x82,
      1,
      0xf6,
      1,
      0x61,
      0x61,
    );
    expect(new CborDecoder(bytes).decode(valueVisitor)).toEqual(
      Result.ok([
        [],
        new Map(),
        new Map<bigint, Value>([
          [0n, [1n, null]],
          [1n, "a"],
        ]),
      ]),
    );
  });

  it("wide_map_keys", () => {
    const bytes = Uint8Array.of(
      0xa1,
      0x1b,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xf6,
    );
    expect(new CborDecoder(bytes).decode(valueVisitor)).toEqual(
      Result.ok(new Map([[18446744073709551615n, null]])),
    );
  });

  it("domain_error", () => {
    const error = new HeaderError("not this variant");
    const visitor: CborVisitor<never, HeaderError> = {
      expecting: "an accepted variant",
      visitUnsignedInteger: () => Result.err(error),
    };
    const result = new CborDecoder(Uint8Array.of(1)).decode(visitor);
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error).toBe(error);
    }
  });

  it.each([
    { name: "error", cause: new Error("visitor exception") },
    { name: "string", cause: "visitor exception" },
    { name: "undefined", cause: undefined },
  ])("visitor_exception_$name", ({ cause }) => {
    const visitor: CborVisitor<never, never> = {
      expecting: "an unsigned integer",
      visitUnsignedInteger: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- visitor exceptions can be arbitrary JavaScript values.
        throw cause;
      },
    };
    const result = new CborDecoder(Uint8Array.of(1)).decode(visitor);
    expectError(result, "exception", 1);
    if (Result.isErr(result)) {
      expect(result.error.cause).toBe(cause);
    }
  });

  it("container_exception", () => {
    const cause = new Error("container visitor exception");
    let saved: CborArrayAccess | undefined;
    const visitor: CborVisitor<never, never> = {
      expecting: "an array",
      visitArray: (array) => {
        saved = array;
        throw cause;
      },
    };
    const decoder = new CborDecoder(Uint8Array.of(0x81, 0));
    const result = decoder.decode(visitor);
    expectError(result, "exception", 1);
    expect(saved).toBeDefined();
    if (Result.isErr(result)) {
      expect(result.error.cause).toBe(cause);
      if (saved) {
        const later = saved.readElement(unsignedVisitor);
        expect(Result.isErr(later)).toBe(true);
        if (Result.isErr(later)) {
          expect(later.error).toBe(result.error);
        }
      }
    }
  });

  it("nested_exception", () => {
    const cause = new Error("nested visitor exception");
    const visitor: CborVisitor<never, never> = {
      expecting: "a map",
      visitMap: (map) =>
        Result.gen(function* readNestedException() {
          yield* map.readKey();
          return yield* map.readValue<never, never>({
            expecting: "an array",
            visitArray: (array) =>
              array.readElement<never, never>({
                expecting: "an unsigned integer",
                visitUnsignedInteger: () => {
                  throw cause;
                },
              }),
          });
        }),
    };
    const result = new CborDecoder(Uint8Array.of(0xa1, 0, 0x81, 1)).decode(
      visitor,
    );
    expectError(result, "exception", 4);
    if (Result.isErr(result)) {
      expect(result.error.cause).toBe(cause);
    }
  });
});

describe("CborDecoder profile", () => {
  it.each([
    { name: "empty", bytes: [], tag: "unexpected-end", offset: 0 },
    {
      name: "truncated_integer",
      bytes: [0x19, 0],
      tag: "unexpected-end",
      offset: 1,
    },
    {
      name: "truncated_float",
      bytes: [0xfa, 0],
      tag: "unexpected-end",
      offset: 1,
    },
    {
      name: "truncated_bytes",
      bytes: [0x42, 0],
      tag: "unexpected-end",
      offset: 1,
    },
    {
      name: "truncated_array",
      bytes: [0x82, 0],
      tag: "unexpected-end",
      offset: 1,
    },
    {
      name: "truncated_map",
      bytes: [0xa1, 0],
      tag: "unexpected-end",
      offset: 1,
    },
    {
      name: "huge_length",
      bytes: [0x5b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      tag: "unexpected-end",
      offset: 9,
    },
    {
      name: "shortest_u8",
      bytes: [0x18, 0x17],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "shortest_u16",
      bytes: [0x19, 0, 0xff],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "shortest_u32",
      bytes: [0x1a, 0, 0, 0xff, 0xff],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "shortest_u64",
      bytes: [0x1b, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "shortest_length",
      bytes: [0x58, 0],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "shortest_negative",
      bytes: [0x38, 0x17],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "indefinite_array",
      bytes: [0x9f, 0xff],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "indefinite_map",
      bytes: [0xbf, 0xff],
      tag: "invalid-encoding",
      offset: 0,
    },
    {
      name: "reserved_argument",
      bytes: [0x1c],
      tag: "invalid-encoding",
      offset: 0,
    },
    { name: "tag", bytes: [0xc0, 0], tag: "invalid-encoding", offset: 0 },
    {
      name: "half_precision",
      bytes: [0xf9, 0, 0],
      tag: "invalid-encoding",
      offset: 0,
    },
    { name: "undefined", bytes: [0xf7], tag: "invalid-encoding", offset: 0 },
    {
      name: "duplicate_key",
      bytes: [0xa2, 0, 0xf6, 0, 0xf6],
      tag: "invalid-encoding",
      offset: 3,
    },
    {
      name: "descending_key",
      bytes: [0xa2, 1, 0xf6, 0, 0xf6],
      tag: "invalid-encoding",
      offset: 3,
    },
    {
      name: "negative_key",
      bytes: [0xa1, 0x20, 0xf6],
      tag: "invalid-encoding",
      offset: 1,
    },
    {
      name: "float_key",
      bytes: [0xa1, 0xfa, 0x3f, 0x80, 0, 0, 0xf6],
      tag: "invalid-encoding",
      offset: 1,
    },
    {
      name: "invalid_utf8",
      bytes: [0x61, 0xff],
      tag: "invalid-utf8",
      offset: 1,
    },
    { name: "trailing_data", bytes: [0, 0], tag: "trailing-data", offset: 1 },
  ] as const)("$name", ({ bytes, tag, offset }) => {
    expectError(
      new CborDecoder(Uint8Array.from(bytes)).decode(valueVisitor),
      tag,
      offset,
    );
  });

  it("relative_error_offset", () => {
    const bytes = Uint8Array.of(0, 0, 0x61, 0xff, 0);
    expectError(
      new CborDecoder(bytes.subarray(2, 4)).decode(valueVisitor),
      "invalid-utf8",
      1,
    );
  });

  it("depth_boundary", () => {
    const bytes = Uint8Array.of(0x81, 0x81, 0);
    expect(
      new CborDecoder(bytes, { maximumDepth: 2 }).decode(valueVisitor),
    ).toEqual(Result.ok([[0n]]));
    expectError(
      new CborDecoder(bytes, { maximumDepth: 1 }).decode(valueVisitor),
      "nesting-limit",
      2,
    );
    expect(
      new CborDecoder(Uint8Array.of(0), { maximumDepth: 0 }).decode(
        valueVisitor,
      ),
    ).toEqual(Result.ok(0n));
  });

  it("default_depth", () => {
    const bytes = Uint8Array.of(...Array<number>(17).fill(0x81), 0);
    expectError(
      new CborDecoder(bytes).decode(valueVisitor),
      "nesting-limit",
      17,
    );
  });

  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "invalid_depth_%s",
    (maximumDepth) => {
      expect(() => new CborDecoder(Uint8Array.of(0), { maximumDepth })).toThrow(
        RangeError,
      );
    },
  );
});

describe("CborDecoder access", () => {
  it("partial_array", () => {
    const visitor: CborVisitor<null, never> = {
      expecting: "an array",
      visitArray: () => Result.ok(null),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0x81, 0)).decode(visitor),
      "unconsumed-container",
      1,
    );
  });

  it("partial_map", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "a map",
      visitMap: (map) => map.readKey(),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0xa1, 0, 0)).decode(visitor),
      "unconsumed-container",
      2,
    );
  });

  it("value_without_key", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "a map",
      visitMap: (map) => map.readValue(unsignedVisitor),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0xa1, 0, 0)).decode(visitor),
      "invalid-access",
      1,
    );
  });

  it("key_without_value", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "a map",
      visitMap: (map) =>
        Result.gen(function* readDuplicateKey() {
          yield* map.readKey();
          return yield* map.readKey();
        }),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0xa1, 0, 0)).decode(visitor),
      "invalid-access",
      2,
    );
  });

  it("exhausted_array", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "an array",
      visitArray: (array) => array.readElement(unsignedVisitor),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0x80)).decode(visitor),
      "invalid-access",
      1,
    );
  });

  it("closed_access", () => {
    let saved: CborArrayAccess | undefined;
    const visitor: CborVisitor<null, never> = {
      expecting: "an empty array",
      visitArray: (array) => {
        saved = array;
        return Result.ok(null);
      },
    };
    expect(new CborDecoder(Uint8Array.of(0x80)).decode(visitor)).toEqual(
      Result.ok(null),
    );
    expect(saved).toBeDefined();
    if (saved) {
      expectError(saved.readElement(unsignedVisitor), "invalid-access", 1);
    }
  });

  it("closed_access_domain_error", () => {
    const error = new HeaderError("unsupported array");
    let saved: CborArrayAccess | undefined;
    const visitor: CborVisitor<never, HeaderError> = {
      expecting: "an array",
      visitArray: (array) => {
        saved = array;
        return Result.err(error);
      },
    };
    const result = new CborDecoder(Uint8Array.of(0x81, 0)).decode(visitor);
    expect(result).toEqual(Result.err(error));
    expect(saved).toBeDefined();
    if (saved) {
      expectError(saved.readElement(unsignedVisitor), "invalid-access", 1);
    }
  });

  it("ignored_array_visitor_error", () => {
    const result = new CborDecoder(Uint8Array.of(0x81, 1, 2)).decode({
      expecting: "an array",
      visitArray: (array) => {
        const first = array.readElement({
          expecting: "an accepted integer",
          visitUnsignedInteger: () => Result.err("rejected"),
        });
        expect(Result.isErr(first)).toBe(true);
        return array.readElement(unsignedVisitor);
      },
    });
    expectError(result, "invalid-access", 2);
  });

  it("ignored_map_visitor_error", () => {
    const result = new CborDecoder(Uint8Array.of(0xa1, 0, 1, 2)).decode({
      expecting: "a map",
      visitMap: (map) => {
        expect(Result.isOk(map.readKey())).toBe(true);
        const first = map.readValue({
          expecting: "an accepted integer",
          visitUnsignedInteger: () => Result.err("rejected"),
        });
        expect(Result.isErr(first)).toBe(true);
        return map.readValue(unsignedVisitor);
      },
    });
    expectError(result, "invalid-access", 3);
  });

  it("caught_element_exception", () => {
    const cause = new Error("rejected integer");
    const result = new CborDecoder(Uint8Array.of(0x81, 1, 2)).decode({
      expecting: "an array",
      visitArray: (array) => {
        expect(() =>
          array.readElement({
            expecting: "an accepted integer",
            visitUnsignedInteger: () => {
              throw cause;
            },
          }),
        ).toThrow(cause);
        return array.readElement(unsignedVisitor);
      },
    });
    expectError(result, "invalid-access", 2);
  });

  it("parse_error_precedence", () => {
    const result = new CborDecoder(Uint8Array.of(0x81, 0xff)).decode({
      expecting: "an array",
      visitArray: (array) => {
        expect(Result.isErr(array.readElement(unsignedVisitor))).toBe(true);
        return Result.err("domain error");
      },
    });
    expectError(result, "invalid-encoding", 1);
  });

  it("ignored_parse_error", () => {
    const visitor: CborVisitor<null, never> = {
      expecting: "an array",
      visitArray: (array) => {
        const ignored = array.readElement(valueVisitor);
        expect(Result.isErr(ignored)).toBe(true);
        return Result.ok(null);
      },
    };
    expectError(
      new CborDecoder(Uint8Array.of(0x81, 0xff)).decode(visitor),
      "invalid-encoding",
      1,
    );
  });

  it("reentrant_array_access", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "an array",
      visitArray: (array) =>
        array.readElement({
          expecting: "an unsigned integer",
          visitUnsignedInteger: () => array.readElement(unsignedVisitor),
        }),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0x82, 0, 1)).decode(visitor),
      "invalid-access",
      2,
    );
  });

  it("reentrant_map_access", () => {
    const visitor: CborVisitor<U64, never> = {
      expecting: "a map",
      visitMap: (map) =>
        Result.gen(function* readReentrantValue() {
          yield* map.readKey();
          return yield* map.readValue({
            expecting: "an unsigned integer",
            visitUnsignedInteger: () => map.readValue(unsignedVisitor),
          });
        }),
    };
    expectError(
      new CborDecoder(Uint8Array.of(0xa1, 0, 1)).decode(visitor),
      "invalid-access",
      3,
    );
  });

  it("reused_decoder", () => {
    const decoder = new CborDecoder(Uint8Array.of(0));
    expect(decoder.decode(unsignedVisitor)).toEqual(Result.ok(0n));
    expectError(decoder.decode(unsignedVisitor), "invalid-access", 1);
  });

  it("reentrant_decode", () => {
    const decoder = new CborDecoder(Uint8Array.of(0));
    const visitor: CborVisitor<U64, never> = {
      expecting: "an unsigned integer",
      visitUnsignedInteger: () => decoder.decode(unsignedVisitor),
    };
    expectError(decoder.decode(visitor), "invalid-access", 1);
  });
});
