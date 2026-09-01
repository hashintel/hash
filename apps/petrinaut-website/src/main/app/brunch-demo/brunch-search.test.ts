import { describe, expect, it } from "vitest";

import { brunchSearchSchema } from "./brunch-search";

describe("brunchSearchSchema", () => {
  it("keeps string parameters", () => {
    expect(
      brunchSearchSchema.parse({
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
      brunchSearchSchema.parse({
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
      brunchSearchSchema.parse({
        runId: ["run-1"],
        sse: { href: "https://brunch.example/events" },
      }),
    ).toEqual({
      runId: undefined,
      sse: undefined,
    });
  });
});
