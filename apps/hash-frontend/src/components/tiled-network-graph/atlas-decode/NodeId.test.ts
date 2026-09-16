import { describe, expect, it } from "vitest";

import { u32le } from "./fixtures";
import { NodeIdColumn, NodeIdColumnError } from "./NodeId";
import * as Result from "./Result";

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

describe("NodeIdColumn.make", () => {
  it("accepts_multiple_of_four", () => {
    const column = expectOk(
      NodeIdColumn.make(viewOf(Uint8Array.from(u32le([1, 2])))),
    );
    expect(column.length).toBe(2);
  });

  it("accepts_zero_length", () => {
    const column = expectOk(NodeIdColumn.make(viewOf(Uint8Array.of())));
    expect(column.length).toBe(0);
  });

  it.each([1, 2, 3, 5, 7])(
    "rejects_length_not_divisible_by_four_%i",
    (byteLength) => {
      const error = expectErr(
        NodeIdColumn.make(viewOf(new Uint8Array(byteLength))),
      );
      expect(error).toBeInstanceOf(NodeIdColumnError);
      expect(error.reason).toEqual({
        _tag: "invalid-length",
        byteLength,
      });
    },
  );
});

describe("NodeIdColumn.decode versus .make", () => {
  it("decode_matches_make_from_an_equivalent_view", () => {
    const bytes = Uint8Array.from(u32le([9, 99]));
    const decoded = expectOk(NodeIdColumn.decode(bytes));
    const made = expectOk(NodeIdColumn.make(viewOf(bytes)));
    expect([...decoded]).toEqual([...made]);
  });

  it("decode_rejects_the_same_invalid_length_as_make", () => {
    const bytes = new Uint8Array(3);
    const decodedError = expectErr(NodeIdColumn.decode(bytes));
    const madeError = expectErr(NodeIdColumn.make(viewOf(bytes)));
    expect(decodedError.reason).toEqual(madeError.reason);
  });

  it("decode_bounds_lookups_to_a_byte_subarray", () => {
    const backing = new Uint8Array(16);
    backing.set(u32le([0x01020304, 0x05060708]), 4);
    // A column decoded from a subarray only ever sees its own 8 bytes.
    const column = expectOk(NodeIdColumn.decode(backing.subarray(4, 12)));

    expect(column.length).toBe(2);
    expect(expectOk(column.at(0))).toBe(0x01020304);
    expect(expectOk(column.at(1))).toBe(0x05060708);
  });
});

describe("NodeIdColumn.at", () => {
  it("reads_little_endian_id_at_index", () => {
    const column = expectOk(
      NodeIdColumn.make(
        viewOf(Uint8Array.from(u32le([0x11223344, 0xaabbccdd]))),
      ),
    );
    expect(expectOk(column.at(0))).toBe(0x11223344);
    expect(expectOk(column.at(1))).toBe(0xaabbccdd);
  });

  it("reads_high_bit_ids_as_positive", () => {
    const column = expectOk(
      NodeIdColumn.make(
        viewOf(Uint8Array.from(u32le([0xffffffff, 0x80000000]))),
      ),
    );
    expect(expectOk(column.at(0))).toBe(4_294_967_295);
    expect(expectOk(column.at(1))).toBe(2_147_483_648);
  });

  it.each([
    { name: "negative", index: -1 },
    { name: "fractional", index: 0.5 },
    { name: "nan", index: Number.NaN },
    { name: "infinite", index: Number.POSITIVE_INFINITY },
    { name: "at_length", index: 2 },
    { name: "past_length", index: 99 },
  ])("rejects_invalid_index_$name", ({ index }) => {
    const column = expectOk(
      NodeIdColumn.make(viewOf(Uint8Array.from(u32le([1, 2])))),
    );
    const error = expectErr(column.at(index));
    expect(error).toBeInstanceOf(NodeIdColumnError);
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index,
      length: 2,
    });
  });

  it("rejects_index_on_empty_column", () => {
    const column = expectOk(NodeIdColumn.make(viewOf(Uint8Array.of())));
    const error = expectErr(column.at(0));
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index: 0,
      length: 0,
    });
  });

  it("bounds_lookups_to_subview", () => {
    const backing = new ArrayBuffer(16);
    new Uint8Array(backing).set(u32le([0x01020304, 0x05060708]), 4);
    // A column carved from a larger buffer only ever sees its own 8 bytes.
    const column = expectOk(NodeIdColumn.make(new DataView(backing, 4, 8)));

    expect(column.length).toBe(2);
    expect(expectOk(column.at(0))).toBe(0x01020304);
    expect(expectOk(column.at(1))).toBe(0x05060708);
    const error = expectErr(column.at(2));
    expect(error.reason).toEqual({
      _tag: "invalid-index",
      index: 2,
      length: 2,
    });
  });
});

describe("NodeIdColumn iteration", () => {
  it("iterates_ids_in_column_order", () => {
    const column = expectOk(
      NodeIdColumn.make(viewOf(Uint8Array.from(u32le([10, 20, 30])))),
    );
    expect([...column]).toEqual([10, 20, 30]);
  });

  it("iterates_zero_ids_empty_column", () => {
    const column = expectOk(NodeIdColumn.make(viewOf(Uint8Array.of())));
    expect([...column]).toEqual([]);
  });

  it("iterates_from_subview", () => {
    const backing = new ArrayBuffer(20);
    new Uint8Array(backing).set(u32le([1, 2, 3]), 8);
    const column = expectOk(NodeIdColumn.make(new DataView(backing, 8, 12)));
    expect([...column]).toEqual([1, 2, 3]);
  });
});
