import { describe, expect, it } from "vitest";

import { mergeParameterValues } from "./parameter-values";

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
});
