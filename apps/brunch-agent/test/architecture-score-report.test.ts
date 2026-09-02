import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { scoreReport } from "../../../libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/score-report.ts";

describe("architecture score report validation", () => {
  test("recomputes the weighted omniscient total", () => {
    const report = `
## Verdict
- Weighted total: 72.5 / 100

## Score vector
| Dimension | Score (0–4) | Weighted points | Evidence |
| --- | ---: | ---: | --- |
| A | 3 | 15 | x |
| B | 4 | 20 | x |
| C | 4 | 20 | x |
| D | 4 | 15 | x |
| E | 3 | 11.25 | x |
| F | 3 | 7.5 | x |

## Acquisition accounting
`;

    expect(scoreReport("omniscient", report)).toEqual({
      computed: 88.8,
      reported: 72.5,
      scores: [3, 4, 4, 4, 3, 3],
      valid: false,
    });
  });

  test("recomputes the cold arithmetic mean", () => {
    const report = `
## Verdict
- Overall cold utility: **3.2 / 4**

## Scorecard
| Subdimension | Score (0–4) | Evidence |
| --- | ---: | --- |
| A | 4.0 | x |
| B | 3.5 | x |
| C | 3.0 | x |
| D | 4.0 | x |
| E | 3.5 | x |
| F | 2.5 | x |

## Load-bearing assumptions
`;

    expect(scoreReport("cold", report)).toEqual({
      computed: 3.4,
      reported: 3.2,
      scores: [4, 3.5, 3, 4, 3.5, 2.5],
      valid: false,
    });
  });

  test("pins the v3 arithmetic errata to the retained raw reports", () => {
    const evidenceDirectory = join(
      import.meta.dirname,
      "../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-architecture-candidate-v3",
    );
    const artifactStem =
      "prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006";

    expect(
      scoreReport(
        "omniscient",
        readFileSync(
          join(evidenceDirectory, `${artifactStem}.omniscient.md`),
          "utf8",
        ),
      ),
    ).toMatchObject({ computed: 88.8, reported: 72.5, valid: false });
    expect(
      scoreReport(
        "cold",
        readFileSync(
          join(evidenceDirectory, `${artifactStem}.cold-attempt-2.md`),
          "utf8",
        ),
      ),
    ).toMatchObject({ computed: 3.4, reported: 3.2, valid: false });
  });
});
