import { describe, expect, test } from "vitest";

import { parseDateTime } from "./datetime.js";

describe("parseDateTime", () => {
  test("reads an offset as the UTC instant it names", () => {
    expect.hasAssertions();

    expect(parseDateTime("2026-10-16T16:00:00+02:00")).toBe(
      Date.UTC(2026, 9, 16, 14),
    );
    expect(parseDateTime("2026-10-16T08:30:00-05:30")).toBe(
      Date.UTC(2026, 9, 16, 14),
    );
  });

  test("reads fractional seconds and values without seconds", () => {
    expect.hasAssertions();

    expect(parseDateTime("2026-10-16T14:00:00.25Z")).toBe(
      Date.UTC(2026, 9, 16, 14, 0, 0, 250),
    );
    expect(parseDateTime("2026-10-16T14:00Z")).toBe(Date.UTC(2026, 9, 16, 14));
  });

  test.each([
    "",
    "next tuesday",
    "2026-10-16",
    "2026-10-16T14:00:00",
    "2026-10-16 14:00:00Z",
    "2026-02-30T14:00:00Z",
    "2026-13-01T14:00:00Z",
    "2026-10-16T24:00:00Z",
    "2026-10-16T14:60:00Z",
    "2026-10-16T14:00:00+24:00",
    "Fri, 16 Oct 2026 14:00:00 GMT",
  ])("rejects %j", (value) => {
    expect.hasAssertions();

    const result = parseDateTime(value);

    expect(result).toMatchObject({ status: "error" });
    expect(result).toHaveProperty("message");
  });
});
