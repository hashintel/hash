import { describe, expect, expectTypeOf, it } from "vitest";

import * as Record from "./Record";

describe("Record", () => {
  it("omit_undefined_drops_keys", () => {
    const stripped = Record.omitUndefined({
      id: 1,
      label: undefined,
      typeId: "t",
    });
    expect(stripped).toEqual({ id: 1, typeId: "t" });
    expect("label" in stripped).toBe(false);
  });

  it("omit_undefined_retains_falsy_and_null", () => {
    expect(
      Record.omitUndefined({ zero: 0, empty: "", off: false, nothing: null }),
    ).toEqual({ zero: 0, empty: "", off: false, nothing: null });
  });

  it("omit_undefined_copies", () => {
    const record = { id: 1 };
    const stripped = Record.omitUndefined(record);
    expect(stripped).toEqual(record);
    expect(stripped).not.toBe(record);
  });

  it("omit_undefined_type", () => {
    const record = {} as {
      readonly id: number;
      readonly label: string | undefined;
      typeId?: string;
      nothing: null;
    };
    expectTypeOf(Record.omitUndefined(record)).toEqualTypeOf<{
      readonly id: number;
      readonly label?: string;
      typeId?: string;
      nothing: null;
    }>();
  });

  it("omit_undefined_assignable_to_optional_interface", () => {
    interface Edge {
      readonly id: number;
      readonly label?: string;
    }
    const label = undefined as string | undefined;
    const edge: Edge = Record.omitUndefined({ id: 1, label });
    expect(edge).toEqual({ id: 1 });
  });
});
