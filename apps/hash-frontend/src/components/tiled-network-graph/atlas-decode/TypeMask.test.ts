import { describe, expect, expectTypeOf, it } from "vitest";

import * as Result from "./Result";
import * as TypeMask from "./TypeMask";

const expectError = <T, E>(result: Result.Result<T, E>): E => {
  if (Result.isOk(result)) {
    throw new Error("expected a type mask error");
  }
  return result.error;
};

describe("TypeMaskColumn", () => {
  it("private_constructors", () => {
    expectTypeOf<typeof TypeMask.TypeMaskColumn>().not.toMatchTypeOf<
      new (bytes: Uint8Array, typeCount: number, stride: number) => unknown
    >();
    expectTypeOf<typeof TypeMask.TypeMask>().not.toMatchTypeOf<
      new (bytes: Uint8Array, typeCount: number) => unknown
    >();
  });

  it("typed_rows", () => {
    const column = TypeMask.TypeMaskColumn.make(
      Uint8Array.of(0x05, 0, 0x02),
      3,
    ).pipe(Result.unwrap);
    expectTypeOf(column.at(0)).toEqualTypeOf<
      Result.Result<
        TypeMask.TypeMask<ArrayBuffer>,
        TypeMask.TypeMaskColumnError
      >
    >();
    const rows = [...column];
    expectTypeOf(rows).toEqualTypeOf<TypeMask.TypeMask<ArrayBuffer>[]>();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toBeInstanceOf(TypeMask.TypeMask);
      expect(row.typeCount).toBe(3);
    }
    expect(rows.map((row) => [...row])).toEqual([[0, 2], [], [1]]);
    expect([...column].map((row) => [...row])).toEqual([[0, 2], [], [1]]);
  });

  it("empty_column_stride", () => {
    const column = TypeMask.TypeMaskColumn.make(new Uint8Array(), 9).pipe(
      Result.unwrap,
    );
    expect(column.length).toBe(0);
    expect(column.typeCount).toBe(9);
    expect(column.stride).toBe(2);
    expect([...column]).toEqual([]);
    expect(expectError(column.at(0)).reason).toEqual({
      _tag: "invalid-index",
      index: 0,
      length: 0,
    });
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "type_count_invalid_%s",
    (typeCount) => {
      const error = expectError(
        TypeMask.TypeMaskColumn.make(new Uint8Array(), typeCount),
      );
      expect(error).toBeInstanceOf(TypeMask.TypeMaskColumnError);
      expect(error.reason).toEqual({ _tag: "invalid-type-count", typeCount });
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1])(
    "row_index_invalid_%s",
    (index) => {
      const column = TypeMask.TypeMaskColumn.make(Uint8Array.of(1), 1).pipe(
        Result.unwrap,
      );
      const error = expectError(column.at(index));
      expect(error).toBeInstanceOf(TypeMask.TypeMaskColumnError);
      expect(error.reason).toEqual({ _tag: "invalid-index", index, length: 1 });
    },
  );

  it("storage_width", () => {
    const error = expectError(
      TypeMask.TypeMaskColumn.make(Uint8Array.of(1, 2, 3), 9),
    );
    expect(error).toBeInstanceOf(TypeMask.TypeMaskColumnError);
    expect(error.reason).toEqual({
      _tag: "invalid-length",
      byteLength: 3,
      stride: 2,
    });
  });

  it("borrowed_subview", () => {
    const bytes = Uint8Array.of(0xff, 0x01, 0xfe, 0x02, 0x01, 0xff);
    const column = TypeMask.TypeMaskColumn.decode(9)(bytes.subarray(1, 5)).pipe(
      Result.unwrap,
    );
    const indexed = column.at(0).pipe(Result.unwrap);
    const rows = [...column];
    expect(column).toHaveLength(2);
    expect([...indexed]).toEqual([0]);
    expect(rows.map((row) => [...row])).toEqual([[0], [1, 8]]);

    bytes[1] = 0x04;
    bytes[4] = 0x00;
    expect([...indexed]).toEqual([2]);
    expect(rows.map((row) => [...row])).toEqual([[2], [1]]);
  });

  it("shared_buffer", () => {
    const bytes = new Uint8Array(new SharedArrayBuffer(3), 1, 1);
    bytes[0] = 2;
    const column = TypeMask.TypeMaskColumn.make(bytes, 2).pipe(Result.unwrap);
    const mask = column.at(0).pipe(Result.unwrap);
    expectTypeOf(mask).toEqualTypeOf<TypeMask.TypeMask<SharedArrayBuffer>>();
    expect([...mask]).toEqual([1]);
    bytes[0] = 1;
    expect([...mask]).toEqual([0]);
  });
});

describe("TypeMask", () => {
  it("membership", () => {
    const column = TypeMask.TypeMaskColumn.make(Uint8Array.of(0x05), 3).pipe(
      Result.unwrap,
    );
    const mask = column.at(0).pipe(Result.unwrap);
    expectTypeOf(mask.has(0)).toEqualTypeOf<
      Result.Result<boolean, TypeMask.TypeMaskError>
    >();
    expect(mask.has(0).pipe(Result.unwrap)).toBe(true);
    expect(mask.has(1).pipe(Result.unwrap)).toBe(false);
    expect(mask.has(2).pipe(Result.unwrap)).toBe(true);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1, 7])(
    "type_index_invalid_%s",
    (type) => {
      const column = TypeMask.TypeMaskColumn.make(Uint8Array.of(0xff), 1).pipe(
        Result.unwrap,
      );
      const mask = column.at(0).pipe(Result.unwrap);
      const error = expectError(mask.has(type));
      expect(error).toBeInstanceOf(TypeMask.TypeMaskError);
      expect(error.reason).toEqual({
        _tag: "invalid-type",
        type,
        typeCount: 1,
      });
    },
  );

  it("type_index_above_signed_32_bit", () => {
    const type = 2 ** 31;
    const bytes = new Uint8Array(Math.floor(type / 8) + 1);
    bytes[bytes.length - 1] = 1;
    const column = TypeMask.TypeMaskColumn.make(bytes, type + 1).pipe(
      Result.unwrap,
    );
    const mask = column.at(0).pipe(Result.unwrap);
    expect(mask.has(type).pipe(Result.unwrap)).toBe(true);
    expect(mask.has(type - 1).pipe(Result.unwrap)).toBe(false);
  });

  it("stride_and_padding", () => {
    const column = TypeMask.TypeMaskColumn.make(
      Uint8Array.of(0x01, 0x02, 0x00, 0x01),
      9,
    ).pipe(Result.unwrap);
    expect(column.stride).toBe(2);
    expect([...column].map((mask) => [...mask])).toEqual([[0], [8]]);
    expect(column.at(1).pipe(Result.unwrap).has(8).pipe(Result.unwrap)).toBe(
      true,
    );
  });

  it.each([1, 7, 8, 9, 15, 16, 17])("iter_type_count_%i", (typeCount) => {
    const column = TypeMask.TypeMaskColumn.make(
      new Uint8Array(Math.ceil(typeCount / 8)).fill(0xff),
      typeCount,
    ).pipe(Result.unwrap);
    const mask = column.at(0).pipe(Result.unwrap);
    const expected = Array.from({ length: typeCount }, (_, index) => index);
    expect([...mask]).toEqual(expected);
    expect([...mask]).toEqual(expected);
  });

  it("iter_empty", () => {
    const column = TypeMask.TypeMaskColumn.make(Uint8Array.of(0, 0xfe), 9).pipe(
      Result.unwrap,
    );
    const mask = column.at(0).pipe(Result.unwrap);
    expect([...mask]).toEqual([]);
    expect([...mask]).toEqual([]);
  });

  it("iter_independent", () => {
    const column = TypeMask.TypeMaskColumn.make(
      Uint8Array.of(0x05, 0x01),
      9,
    ).pipe(Result.unwrap);
    const mask = column.at(0).pipe(Result.unwrap);
    const first = mask[Symbol.iterator]();
    const second = mask[Symbol.iterator]();
    expect(first.next()).toEqual({ done: false, value: 0 });
    expect(first.next()).toEqual({ done: false, value: 2 });
    expect(second.next()).toEqual({ done: false, value: 0 });
    expect([...first]).toEqual([8]);
    expect([...second]).toEqual([2, 8]);
    expect([...mask]).toEqual([0, 2, 8]);
  });
});
