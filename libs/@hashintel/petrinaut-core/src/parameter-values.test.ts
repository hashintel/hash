import { describe, expect, it } from "vitest";

import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "./parameter-values";

describe("deriveDefaultParameterValues", () => {
  it("stores names colliding with Object.prototype members as own properties", () => {
    const values = deriveDefaultParameterValues([
      {
        id: "param1",
        name: "Constructor",
        variableName: "constructor",
        type: "real",
        defaultValue: "3",
      },
    ]);
    expect(Object.hasOwn(values, "constructor")).toBe(true);
    expect(values.constructor).toBe(3);
  });

  it("returns a record without a prototype", () => {
    expect(Object.getPrototypeOf(deriveDefaultParameterValues([]))).toBe(null);
    expect(deriveDefaultParameterValues([])["toString"]).toBeUndefined();
  });
});

describe("mergeParameterValues", () => {
  it("preserves boolean parameter overrides as booleans", () => {
    expect(
      mergeParameterValues(
        { enabled: "true", disabled: "false" },
        { enabled: false, disabled: true },
      ),
    ).toEqual({ enabled: true, disabled: false });
  });

  it("rejects incompatible boolean and numeric overrides", () => {
    expect(() =>
      mergeParameterValues({ enabled: "1" }, { enabled: false }),
    ).toThrow('Boolean parameter "enabled" must be "true" or "false"');
    expect(() =>
      mergeParameterValues({ rate: "invalid" }, { rate: 1 }),
    ).toThrow('Parameter "rate" must be a finite number');
  });

  it("merges store keys colliding with Object.prototype members as own properties", () => {
    const merged = mergeParameterValues({ constructor: "5" }, {}, [
      {
        id: "param1",
        name: "Constructor",
        variableName: "constructor",
        type: "real",
        defaultValue: "1",
      },
    ]);
    expect(Object.hasOwn(merged, "constructor")).toBe(true);
    expect(merged.constructor).toBe(5);
    expect(Object.getPrototypeOf(merged)).toBe(null);
  });

  it("does not read defaults through the prototype chain", () => {
    // "toString" has no declared type and no default: the inferred type
    // must fall back to "real", not derive from Object.prototype.toString.
    const merged = mergeParameterValues({ toString: "2" }, {});
    expect(merged["toString"]).toBe(2);
  });
});
