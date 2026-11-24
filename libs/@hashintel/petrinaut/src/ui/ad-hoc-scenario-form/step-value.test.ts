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

  it("ignores surrounding whitespace in every mode", () => {
    expect(stepAdHocValue("  true ", false, false, "boolean")).toBe("false");
    expect(stepAdHocValue(" 0.5 ", true, false, "ratio")).toBe("0.6");
    expect(stepAdHocValue(" 2.50 ", true, false, "number")).toBe("3.50");
  });

  it("answers a long run of spaces at once", () => {
    // The former `^\s*(true|false)?\s*$` took a minute on this input; the
    // test's own timeout is the bound.
    const long = `${" ".repeat(200_000)}x`;
    expect(stepAdHocValue(long, true, false, "boolean")).toBeNull();
    expect(stepAdHocValue(long, true, false, "ratio")).toBeNull();
    expect(stepAdHocValue(long, true, false, "number")).toBeNull();
    expect(stepAdHocValue(" ".repeat(200_000), true, false, "number")).toBe(
      "1",
    );
  });
});

describe("stepAdHocValue for ratios", () => {
  it("steps by a tenth, a hundredth with Shift, and keeps the decimal shape", () => {
    expect(stepAdHocValue("0.5", true, false, "ratio")).toBe("0.6");
    expect(stepAdHocValue("0.5", false, false, "ratio")).toBe("0.4");
    expect(stepAdHocValue("0.5", true, true, "ratio")).toBe("0.51");
    expect(stepAdHocValue("0.250", true, false, "ratio")).toBe("0.350");
    expect(stepAdHocValue("", true, false, "ratio")).toBe("0.1");
    expect(stepAdHocValue("1", true, false, "ratio")).toBe("1.0");
  });

  it("stays between 0 and 1", () => {
    expect(stepAdHocValue("0.95", true, false, "ratio")).toBe("1.00");
    expect(stepAdHocValue("0.05", false, false, "ratio")).toBe("0.00");
    expect(stepAdHocValue("0", false, true, "ratio")).toBe("0.00");
  });

  it("leaves non-literal content alone", () => {
    expect(stepAdHocValue("scenario.fill", true, false, "ratio")).toBeNull();
  });
});
