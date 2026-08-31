import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  GUIDANCE_KEYS,
  JOBS,
  MOVEMENTS,
  RUNBOOK_KEYS,
} from "../src/plugin/keys";
import {
  guidanceEntries,
  readPluginDefinition,
  runbookEntries,
} from "../src/plugin/plugin-definition";
import { repertoire } from "../src/prompts";

/** Words that would mean the repertoire teaches a formalism or a domain. */
const FORMALISM_OR_DOMAIN =
  /\b(petri|transition|place|token|sdcpn|gherkin|scenario|feature|hospital|coating|truck|packaging)\b/iu;

const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.toLowerCase().replace(/\s+/gu, " ").trim())
    .filter((sentence) => sentence.length >= 40);

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

  test("conditions quantity and observed-practice methods on compatible precision demands", () => {
    const entries = [
      ...guidanceEntries(repertoire.guidance),
      ...runbookEntries(repertoire.runbooks),
    ];
    expect(
      entries
        .filter(({ item }) => item.forPrecision !== undefined)
        .map(({ item }) => [item.name, item.forPrecision]),
    ).toEqual([
      ["Policy versus practice", ["range", "spread"]],
      ["Mean or tail", ["number", "range", "spread"]],
      ["Quantiles, never three points", ["spread"]],
      ["The clairvoyant test", ["number", "range", "spread"]],
      ["Premortem", ["range", "spread"]],
      ["One incident is not a rate", ["range", "spread"]],
      ["One property across one stratum", ["number", "range", "spread"]],
      ["Quantify better when relevant", ["number", "range", "spread"]],
    ]);
  });

  test("fills the selection, permission, warning, scope, and stopping guidance decided by the ADR", () => {
    const entries = [
      ...guidanceEntries(repertoire.guidance),
      ...runbookEntries(repertoire.runbooks),
    ];
    const namesAt = (path: string) =>
      entries
        .filter((entry) => entry.path === path)
        .map((entry) => entry.item.name);

    expect(namesAt("licenses")).toEqual(
      expect.arrayContaining([
        "Press without trapping",
        "Decline a sweep",
        "Propose structure for correction",
      ]),
    );
    expect(namesAt("smells")).toEqual(
      expect.arrayContaining([
        "Schema-shaped questioning",
        "Correction recorded twice",
      ]),
    );
    expect(namesAt("rabbit_holes")).toEqual(
      expect.arrayContaining([
        "Clearinghouse as coverage",
        "Whole-model restatement as progress",
        "Document treated as practice",
      ]),
    );
    expect(namesAt("construct.kickoff")).toEqual(
      expect.arrayContaining([
        "Define the boundary and horizon",
        "Name factors and the accuracy bar",
      ]),
    );
    expect(namesAt("construct.trajectory")).toContain("Select by posture");
    expect(namesAt("construct.close")).toEqual(
      expect.arrayContaining([
        "Name the stopping outcome",
        "Separate assumptions from simplifications",
      ]),
    );
  });

  test("plugin cells add to the repertoire without repeating its sentences", () => {
    const repertoireSentences = new Set(
      [
        ...guidanceEntries(repertoire.guidance),
        ...runbookEntries(repertoire.runbooks),
      ].flatMap(({ item }) => sentences(item.text)),
    );
    const repeated = ["plugin-sdcpn", "plugin-gherkin"].flatMap(
      (packageName) => {
        const definition = readPluginDefinition(
          readFileSync(
            new URL(`../../${packageName}/plugin.yaml`, import.meta.url),
            "utf8",
          ),
        );
        return [
          ...guidanceEntries(definition.guidance),
          ...runbookEntries(definition.runbooks),
        ].flatMap(({ path, item }) =>
          sentences(item.text)
            .filter((sentence) => repertoireSentences.has(sentence))
            .map(
              (sentence) => `${packageName}:${path}:${item.name}:${sentence}`,
            ),
        );
      },
    );

    expect(repeated).toEqual([]);
  });
});
