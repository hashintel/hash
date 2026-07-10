import { describe, expect, it } from "vitest";

import { formatMonth } from "./chart-format";

describe("formatMonth", () => {
  it("formats a YYYY-MM string as 'Mon YY'", () => {
    expect(formatMonth("2024-01")).toBe("Jan 24");
    expect(formatMonth("2025-12")).toBe("Dec 25");
    expect(formatMonth("2026-06")).toBe("Jun 26");
  });

  it("handles single-digit and double-digit months", () => {
    expect(formatMonth("2024-03")).toBe("Mar 24");
    expect(formatMonth("2024-11")).toBe("Nov 24");
  });
});
