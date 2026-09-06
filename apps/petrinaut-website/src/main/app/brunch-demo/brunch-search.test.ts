import { describe, expect, it } from "vitest";

import { validateBrunchSearch, withBrunchStreamKeys } from "./brunch-search";

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

  it("keeps the shared example location next to the stream keys", () => {
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

describe("withBrunchStreamKeys", () => {
  it("carries the stream keys over a navigation", () => {
    // Dropping them would leave getBrunchEndpoint without an endpoint, and
    // the live editor would be replaced by the status page mid-run.
    expect(
      withBrunchStreamKeys(
        { runId: "run-1", sse: "https://brunch.example/events" },
        { subnet: "subnet-1" },
      ),
    ).toEqual({
      runId: "run-1",
      sse: "https://brunch.example/events",
      subnet: "subnet-1",
    });
  });

  it("replaces the contract part rather than merging into it", () => {
    // The hook always produces a complete contract search, so a key it omits
    // is a key the new location does not have.
    expect(
      withBrunchStreamKeys(
        {
          runId: "run-1",
          sse: "https://brunch.example/events",
          scenario: "scenario-1",
          itemType: "place",
          itemId: "place-1",
        },
        { subnet: "subnet-1" },
      ),
    ).toEqual({
      runId: "run-1",
      sse: "https://brunch.example/events",
      subnet: "subnet-1",
    });
  });

  it("adds no stream keys when the current search has none", () => {
    expect(withBrunchStreamKeys({}, { scenario: "scenario-1" })).toEqual({
      runId: undefined,
      sse: undefined,
      scenario: "scenario-1",
    });
  });
});
