import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BinaryEntityId,
  BinaryEntityIdColumn,
  BinaryEntityIdError,
  Visitor,
} from "./BinaryEntityId";
import * as CborDecoder from "./CborDecoder";
import * as Result from "./Result";

import type * as TypeSystem from "@blockprotocol/type-system";

/** 32 sequential bytes starting at `start`, one entity identity's worth. */
const identityBytes = (start = 0): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);

const viewOf = <T extends ArrayBufferLike>(bytes: Uint8Array<T>): DataView<T> =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Narrows a Result to its Err and returns the error. */
const expectErr = <E>(result: Result.Result<unknown, E>): E => {
  expect(result._tag).toBe("err");
  if (!Result.isErr(result)) {
    throw new Error("expected an Err");
  }
  return result.error;
};

/** Narrows a Result to its Ok and returns the value. */
const expectOk = <T>(result: Result.Result<T, unknown>): T => {
  expect(result._tag).toBe("ok");
  if (!Result.isOk(result)) {
    throw new Error("expected an Ok");
  }
  return result.value;
};

type Constructor<E> = new (...args: never[]) => E;

/** Catches a synchronous constructor throw. */
const expectThrows = <E extends Error>(
  fn: () => unknown,
  ctor: Constructor<E>,
): E => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ctor);
    if (error instanceof ctor) {
      return error;
    }
  }
  throw new Error("expected a throw");
};

describe("BinaryEntityId constructor", () => {
  it("accepts_exactly_32_bytes", () => {
    const bytes = identityBytes();
    const identity = new BinaryEntityId(bytes);
    expect(identity.bytes).toBe(bytes);
  });

  it.each([0, 16, 31, 33, 64])(
    "rejects_length_other_than_32_%i",
    (byteLength) => {
      const error = expectThrows(
        () => new BinaryEntityId(new Uint8Array(byteLength)),
        BinaryEntityIdError,
      );
      expect(error.reason).toEqual({
        _tag: "identity-length",
        byteLength,
      });
    },
  );
});

describe("BinaryEntityId.toString", () => {
  it("component_order", () => {
    const bytes = Uint8Array.of(
      0x00,
      0x11,
      0x22,
      0x33,
      0x44,
      0x55,
      0x46,
      0x77,
      0x88,
      0x99,
      0xaa,
      0xbb,
      0xcc,
      0xdd,
      0xee,
      0xff,
      0xfe,
      0xdc,
      0xba,
      0x98,
      0x76,
      0x54,
      0x43,
      0x21,
      0x92,
      0x34,
      0x56,
      0x78,
      0x9a,
      0xbc,
      0xde,
      0xf0,
    );
    const formatted = new BinaryEntityId(bytes).toString();
    expectTypeOf(formatted).toEqualTypeOf<TypeSystem.EntityId>();
    expect(formatted).toBe(
      "00112233-4455-4677-8899-aabbccddeeff~fedcba98-7654-4321-9234-56789abcdef0",
    );
  });

  it("nil_and_max", () => {
    const bytes = new Uint8Array(32);
    bytes.fill(0xff, 16);
    expect(new BinaryEntityId(bytes).toString()).toBe(
      "00000000-0000-0000-0000-000000000000~ffffffff-ffff-ffff-ffff-ffffffffffff",
    );
  });

  it("bounded_subview", () => {
    const backing = new Uint8Array(80).fill(0xff);
    backing.fill(0, 37, 69);
    const identity = new BinaryEntityId(backing.subarray(37, 69));
    expect(identity.toString()).toBe(
      "00000000-0000-0000-0000-000000000000~00000000-0000-0000-0000-000000000000",
    );
    expect(identity.bytes.buffer).toBe(backing.buffer);
  });
});

describe("BinaryEntityIdColumn constructor", () => {
  it("accepts_multiple_of_32", () => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(64)));
    expect(column.length).toBe(2);
  });

  it("accepts_zero_length", () => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(0)));
    expect(column.length).toBe(0);
  });

  it.each([1, 16, 31, 33, 63])(
    "rejects_length_not_divisible_by_32_%i",
    (byteLength) => {
      const error = expectThrows(
        () => new BinaryEntityIdColumn(viewOf(new Uint8Array(byteLength))),
        BinaryEntityIdError,
      );
      expect(error.reason).toEqual({
        _tag: "column-length",
        byteLength,
      });
    },
  );
});

describe("BinaryEntityIdColumn.at", () => {
  it("borrows_identity_bytes_at_index", () => {
    const backing = new Uint8Array(64);
    backing.set(identityBytes(0), 0);
    backing.set(identityBytes(100), 32);
    const column = new BinaryEntityIdColumn(viewOf(backing));

    const first = expectOk(column.at(0));
    const second = expectOk(column.at(1));
    expect([...first.bytes]).toEqual([...identityBytes(0)]);
    expect([...second.bytes]).toEqual([...identityBytes(100)]);

    // Borrowed, not copied: a mutation to the backing buffer is visible.
    backing[0] = 0xfe;
    expect(first.bytes[0]).toBe(0xfe);
  });

  it.each([
    { name: "negative", index: -1 },
    { name: "fractional", index: 0.5 },
    { name: "nan", index: Number.NaN },
    { name: "infinite", index: Number.POSITIVE_INFINITY },
    { name: "at_length", index: 2 },
    { name: "past_length", index: 99 },
  ])("rejects_invalid_index_$name", ({ index }) => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(64)));
    const error = expectErr(column.at(index));
    expect(error).toBeInstanceOf(BinaryEntityIdError);
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index,
      length: 2,
    });
  });

  it("rejects_index_on_empty_column", () => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(0)));
    const error = expectErr(column.at(0));
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index: 0,
      length: 0,
    });
  });

  it("bounds_lookups_to_subview", () => {
    const backing = new ArrayBuffer(96);
    new Uint8Array(backing).set(identityBytes(1), 16);
    // A column carved from a larger buffer sees only its own 32 bytes.
    const column = new BinaryEntityIdColumn(new DataView(backing, 16, 32));

    expect(column.length).toBe(1);
    expect([...expectOk(column.at(0)).bytes]).toEqual([...identityBytes(1)]);
    const error = expectErr(column.at(1));
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index: 1,
      length: 1,
    });
  });
});

describe("BinaryEntityIdColumn.validateOrder", () => {
  it.each([0, 1])("accepts_%i_rows", (rows) => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(rows * 32)));
    expect(column.validateOrder()).toMatchObject({ _tag: "ok" });
  });

  it.each([0, 15, 16, 31])("compares_unsigned_byte_%i", (offset) => {
    const backing = new Uint8Array(64);
    backing[offset] = 0x7f;
    backing[32 + offset] = 0x80;
    const column = new BinaryEntityIdColumn(viewOf(backing));
    expect(column.validateOrder()).toMatchObject({ _tag: "ok" });
    backing[offset] = 0x81;
    expect(expectErr(column.validateOrder()).reason).toEqual({
      _tag: "unordered",
      index: 1,
    });
  });

  it("rejects_duplicate_rows", () => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(64)));
    expect(expectErr(column.validateOrder()).reason).toEqual({
      _tag: "unordered",
      index: 1,
    });
  });

  it("reports_the_first_unordered_row", () => {
    const backing = new Uint8Array(128);
    backing[32] = 2;
    backing[64] = 1;
    const column = new BinaryEntityIdColumn(viewOf(backing));
    expect(expectErr(column.validateOrder()).reason).toEqual({
      _tag: "unordered",
      index: 2,
    });
  });

  it("respects_unaligned_subview_boundaries_without_mutation", () => {
    const backing = new Uint8Array(100).fill(0xff);
    backing.fill(0, 3, 67);
    backing[66] = 1;
    const before = backing.slice();
    const column = new BinaryEntityIdColumn(
      new DataView(backing.buffer, 3, 64),
    );
    expect(column.validateOrder()).toMatchObject({ _tag: "ok" });
    expect(backing).toEqual(before);
  });
});

describe("BinaryEntityId.Visitor", () => {
  it("borrows_a_complete_identity", () => {
    const encoded = Uint8Array.of(0x58, 32, ...identityBytes());
    const identity = expectOk(
      new CborDecoder.CborDecoder(encoded).decode(Visitor),
    );
    expect(identity.bytes.buffer).toBe(encoded.buffer);
    expect(identity.bytes.byteOffset).toBe(2);
    expect(identity.bytes).toEqual(identityBytes());
  });

  it("rejects_wrong_byte_width", () => {
    const error = expectErr(
      new CborDecoder.CborDecoder(Uint8Array.of(0x41, 1)).decode(Visitor),
    );
    expect(error).toBeInstanceOf(BinaryEntityIdError);
    expect(error.reason).toEqual({ _tag: "identity-length", byteLength: 1 });
  });

  it("rejects_other_cbor_categories", () => {
    const error = expectErr(
      new CborDecoder.CborDecoder(Uint8Array.of(0)).decode(Visitor),
    );
    expect(error).toBeInstanceOf(CborDecoder.CborDecoderError);
    expect(error.reason).toMatchObject({ _tag: "unexpected-kind" });
  });
});

describe("BinaryEntityIdColumn iteration", () => {
  it("iterates_identities_in_column_order", () => {
    const backing = new Uint8Array(64);
    backing.set(identityBytes(0), 0);
    backing.set(identityBytes(50), 32);
    const column = new BinaryEntityIdColumn(viewOf(backing));

    const identities = [...column];
    expect(identities).toHaveLength(2);
    expect([...identities[0]!.bytes]).toEqual([...identityBytes(0)]);
    expect([...identities[1]!.bytes]).toEqual([...identityBytes(50)]);
  });

  it("iterates_zero_identities_empty_column", () => {
    const column = new BinaryEntityIdColumn(viewOf(new Uint8Array(0)));
    expect([...column]).toEqual([]);
  });
});
