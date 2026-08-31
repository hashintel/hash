import { describe, expect, test } from "vitest";

import {
  GUIDANCE_KEYS,
  guidanceEntries,
  JOBS,
  MOVEMENTS,
  RUNBOOK_KEYS,
  runbookEntries,
} from "@hashintel/brunch-agent";

import { repertoire } from "../src/index";

/** Words that would mean the repertoire teaches a formalism or a domain. */
const FORMALISM_OR_DOMAIN =
  /\b(petri|transition|place|token|sdcpn|gherkin|scenario|feature|hospital|coating|truck|packaging)\b/iu;

describe("the shipped repertoire", () => {
  test("fills every guidance key, both movements, and every runbook key of every job", () => {
    const guidancePaths = new Set(
      guidanceEntries(repertoire.guidance).map((entry) => entry.path),
    );
    const expectedGuidance = GUIDANCE_KEYS.flatMap((key) =>
      key === "movements"
        ? MOVEMENTS.map((movement) => `movements.${movement}`)
        : [key],
    );
    expect([...guidancePaths].sort()).toEqual([...expectedGuidance].sort());

    const runbookPaths = new Set(
      runbookEntries(repertoire.runbooks).map((entry) => entry.path),
    );
    const expectedRunbooks = JOBS.flatMap((job) =>
      RUNBOOK_KEYS.map((key) => `${job}.${key}`),
    );
    expect([...runbookPaths].sort()).toEqual([...expectedRunbooks].sort());
  });

  test("every entry names its source and gives a failure mode its signature", () => {
    const entries = [
      ...guidanceEntries(repertoire.guidance),
      ...runbookEntries(repertoire.runbooks),
    ];
    expect(entries.length).toBeGreaterThan(20);
    expect(
      entries
        .filter(({ item }) => item.source === undefined)
        .map(({ path, item }) => `${path}: ${item.name}`),
    ).toEqual([]);
    expect(
      entries
        .filter(
          ({ path, item }) =>
            path === "failure_modes" && item.signature === undefined,
        )
        .map(({ item }) => item.name),
    ).toEqual([]);
  });

  test("teaches the harness's concepts, not a formalism or a domain", () => {
    const text = [
      ...guidanceEntries(repertoire.guidance),
      ...runbookEntries(repertoire.runbooks),
    ]
      .map(({ item }) => `${item.name} ${item.text} ${item.signature ?? ""}`)
      .join("\n");
    expect(text).not.toMatch(FORMALISM_OR_DOMAIN);
  });
});
