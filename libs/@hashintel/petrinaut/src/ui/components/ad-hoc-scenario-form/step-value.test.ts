import { describe, expect, it } from "vitest";

import { stepAdHocValue } from "./step-value";

describe("stepAdHocValue", () => {
  it("steps numeric literals preserving the decimal shape", () => {
    expect(stepAdHocValue("3", true, false, "number")).toBe("4");
    expect(stepAdHocValue("0.25", true, false, "number")).toBe("1.25");
    expect(stepAdHocValue("0.50", true, false, "number")).toBe("1.50");
    expect(stepAdHocValue("1.", true, false, "number")).toBe("2");
    expect(stepAdHocValue("-1.5", false, false, "number")).toBe("-2.5");
    expect(stepAdHocValue(" 7 ", false, true, "number")).toBe("-3");
  });

  it("starts from zero on empty numeric content", () => {
    expect(stepAdHocValue("", true, false, "number")).toBe("1");
    expect(stepAdHocValue("  ", false, false, "number")).toBe("-1");
    expect(stepAdHocValue("", false, true, "number")).toBe("-10");
  });

  it("sets booleans from empty or boolean content only", () => {
    expect(stepAdHocValue("", true, false, "boolean")).toBe("true");
    expect(stepAdHocValue("false", true, false, "boolean")).toBe("true");
    expect(stepAdHocValue("true", false, false, "boolean")).toBe("false");
    expect(stepAdHocValue("parameters.on", true, false, "boolean")).toBeNull();
  });

  it("leaves non-literal content alone", () => {
    expect(stepAdHocValue("x + 1", true, false, "number")).toBeNull();
    expect(stepAdHocValue("1e3", true, false, "number")).toBeNull();
    expect(stepAdHocValue('"a"', false, false, "number")).toBeNull();
  });
});
