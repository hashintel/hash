import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const probeObjective = readFileSync(
  new URL(
    "../../../libs/@hashintel/brunch-agent/evaluations/protocols/mission-4-proof-of-life-v2/persona-probe-objective.md",
    import.meta.url,
  ),
  "utf8",
);

describe("Mission 4 persona probe objective", () => {
  test("matches the complete owner-selected mechanical objective", () => {
    expect(createHash("sha256").update(probeObjective).digest("hex")).toBe(
      "27396ce3e6e5ed36aa21adbb00d93129af179535c3fb34accca459733dddaa13",
    );
  });

  test("uses a mechanical stop owned by the visible turn count", () => {
    expect(probeObjective).toContain(
      "Make exactly three visible user submissions, counting the opening as the first",
    );
    expect(probeObjective).toContain(
      "The turn count alone owns the normal stop.",
    );
  });

  test("does not ask the isolated persona to apply evaluator categories", () => {
    expect(probeObjective).not.toMatch(
      /\b(?:Orientation|Substantive|Battery|pass|fail)\b/iu,
    );
  });
});
