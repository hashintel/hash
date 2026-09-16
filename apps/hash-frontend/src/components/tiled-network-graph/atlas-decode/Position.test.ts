import { describe, expect, expectTypeOf, it } from "vitest";

import * as Position from "./position";
import * as Result from "./result";

const unwrap = <T, E>(result: Result.Result<T, E>): T => {
  if (Result.isErr(result)) {
    throw new Error("expected a position column", { cause: result.error });
  }
  return result.value;
};

describe("PositionColumn", () => {
  it("private_constructor", () => {
    expectTypeOf<typeof Position.PositionColumn>().not.toMatchTypeOf<
      new (view: DataView) => unknown
    >();
  });

  it.each([0, 8, 16])("make_width_%i", (byteLength) => {
    const result = Position.PositionColumn.make(
      new DataView(new ArrayBuffer(byteLength)),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Position.PositionColumn<ArrayBuffer>,
        Position.PositionColumnError
      >
    >();
    expect(unwrap(result).length).toBe(byteLength / 8);
  });

  it.each([1, 4, 7, 9, 12])("make_partial_row_%i", (byteLength) => {
    const result = Position.PositionColumn.make(
      new DataView(new ArrayBuffer(byteLength)),
    );
    expect(result).toMatchObject({
      _tag: "err",
      error: { reason: { _tag: "invalid-length", byteLength } },
    });
  });

  it("decode_subview", () => {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);
    view.setFloat32(3, 1.25, true);
    view.setFloat32(7, -2.5, true);
    const column = unwrap(
      Position.PositionColumn.decode(new Uint8Array(buffer, 3, 8)),
    );
    expect(column.length).toBe(1);
    expect(unwrap(column.at(0))).toEqual([1.25, -2.5]);
    expect(column.at(1)).toMatchObject({
      _tag: "err",
      error: { reason: { _tag: "invalid-index", index: 1, length: 1 } },
    });
    view.setFloat32(3, 3.75, true);
    expect(unwrap(column.at(0))).toEqual([3.75, -2.5]);
  });

  it("decode_partial_subview", () => {
    expect(
      Position.PositionColumn.decode(new Uint8Array(new ArrayBuffer(32), 3, 7)),
    ).toMatchObject({
      _tag: "err",
      error: { reason: { _tag: "invalid-length", byteLength: 7 } },
    });
  });

  it("encoded_float_values", () => {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setFloat32(0, -0, true);
    view.setFloat32(4, Infinity, true);
    view.setFloat32(8, NaN, true);
    view.setFloat32(12, -Infinity, true);
    const column = unwrap(Position.PositionColumn.decode(bytes));
    expect([...column]).toEqual([
      [-0, Infinity],
      [NaN, -Infinity],
    ]);
    expect(Object.is(unwrap(column.at(0))[0], -0)).toBe(true);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "index_invalid_%s",
    (index) => {
      const column = unwrap(
        Position.PositionColumn.make(new DataView(new ArrayBuffer(8))),
      );
      expect(column.at(index)).toMatchObject({
        _tag: "err",
        error: { reason: { _tag: "invalid-index", index, length: 1 } },
      });
    },
  );

  it("empty_column", () => {
    const column = unwrap(Position.PositionColumn.decode(new Uint8Array()));
    expect([...column]).toEqual([]);
    expect(column.at(0)._tag).toBe("err");
  });
});
