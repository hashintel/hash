import { describe, expect, it } from "vitest";

import { validateBrunchSearch } from "./brunch-search";

describe("validateBrunchSearch", () => {
  it("keeps string parameters", () => {
    expect(
      validateBrunchSearch({
        runId: "run-1",
        sse: "https://brunch.example/events",
      }),
    ).toEqual({
      runId: "run-1",
      sse: "https://brunch.example/events",
    });
  });

  it("drops values the search parser pre-decoded away from strings", () => {
    // `?runId=1e3` reaches the schema as the number 1000, not the original
    // text, so coercing it back to a string would keep a corrupted id.
    expect(
      validateBrunchSearch({
        runId: 1000,
        sse: true,
      }),
    ).toEqual({
      runId: undefined,
      sse: undefined,
    });
  });

  it("falls back for malformed structured parameters", () => {
    expect(
      validateBrunchSearch({
        runId: ["run-1"],
        sse: { href: "https://brunch.example/events" },
      }),
    ).toEqual({
      runId: undefined,
      sse: undefined,
    });
  });

  it("carries the shared example location next to the stream keys", () => {
    expect(
      validateBrunchSearch({
        sse: "https://brunch.example/events",
        scenario: "scenario_baseline",
        subnet: "subnet_dispatch",
      }),
    ).toEqual({
      sse: "https://brunch.example/events",
      scenario: "scenario_baseline",
      subnet: "subnet_dispatch",
    });
  });
});
