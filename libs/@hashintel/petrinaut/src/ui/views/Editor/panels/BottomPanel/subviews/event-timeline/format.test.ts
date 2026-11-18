import { describe, expect, it } from "vitest";

import { formatTick, formatValue } from "./format";

describe("formatValue", () => {
  it("rounds ordinary values to three decimals", () => {
    expect(formatValue(3)).toBe("3");
    expect(formatValue(2.34567)).toBe("2.346");
    expect(formatValue(0)).toBe("0");
  });

  it("keeps tiny values legible in exponent form", () => {
    expect(formatValue(0.0000012345)).toBe("1.23e-6");
    expect(formatValue(-0.0004)).toBe("-4.00e-4");
  });
});

describe("formatTick", () => {
  it("follows the tick spacing's decimals", () => {
    expect(formatTick(0, 0.5)).toBe("0");
    expect(formatTick(2, 1)).toBe("2");
    expect(formatTick(0.30000000000000004, 0.1)).toBe("0.3");
    expect(formatTick(0.25, 0.05)).toBe("0.25");
  });

  it("switches to exponent form for fine spacings", () => {
    expect(formatTick(0.0000004, 0.0000002)).toBe("4.0e-7");
  });
});
