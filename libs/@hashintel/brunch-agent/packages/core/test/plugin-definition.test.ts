import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { GUIDANCE_KEYS, RUNBOOK_KEYS } from "../src/keys";
import {
  guidanceEntries,
  mustKnowRowsFor,
  PluginDefinitionError,
  readPluginDefinition,
  runbookEntries,
  type PluginDefinition,
} from "../src/plugin-definition";
import { CONTEXT_ROOT, contextRootPresent } from "./architecture/workspace";
import { FIXTURE_PLUGIN_YAML, fixturePluginDefinition } from "./slot-fixtures";

describe("the synthetic fixture definition", () => {
  const definition = fixturePluginDefinition();

  test("reads the identity block and the kind catalog", () => {
    expect(definition.version).toBe("fixture/2026-08-25.1");
    expect(definition.identity).toEqual({
      id: "fixture",
      formalism: "fixture",
      jobs: ["construct"],
      purpose: "Interview someone about things and steps.",
    });
    expect(definition.kinds.map((row) => row.kind)).toEqual([
      "objective",
      "thing",
      "step",
    ]);
    expect(definition.ontology.notKinds.map((row) => row.name)).toEqual([
      "queue",
    ]);
  });

  test("reads demand rows with typed precision and the not-applicable flag", () => {
    expect(mustKnowRowsFor(definition, "objective")).toEqual([
      {
        kind: "objective",
        slot: "the question",
        precision: { kind: "word", word: "spelled out" },
        notApplicableAllowed: false,
        why: "anchor",
      },
      {
        kind: "objective",
        slot: "the nodes it depends on",
        precision: { kind: "at-least", count: 1 },
        notApplicableAllowed: false,
        why: "slice",
      },
    ]);
    expect(mustKnowRowsFor(definition, "thing")[1]?.notApplicableAllowed).toBe(
      true,
    );
  });

  test("reads a list of alternative demanded precision words", () => {
    const withAlternatives = readPluginDefinition(
      FIXTURE_PLUGIN_YAML.replace(
        "precision: spread",
        "precision: [spread, spelled out]",
      ),
    );
    expect(
      mustKnowRowsFor(withAlternatives, "step").find(
        (row) => row.slot === "how long it takes",
      )?.precision,
    ).toEqual({
      kind: "any-of",
      words: ["spread", "spelled out"],
    });
  });

  test("reads the anchor as a declaration, not a convention", () => {
    expect(definition.anchor).toEqual({
      kind: "objective",
      dependencySlot: "the nodes it depends on",
    });
    expect(definition.floor).toEqual([
      { kind: "objective", atLeast: 1 },
      { kind: "thing", atLeast: 2 },
      { kind: "step", atLeast: 1 },
    ]);
  });

  test("indexes patterns by the kinds their trigger names", () => {
    expect(definition.patterns.map((row) => [row.id, row.kinds])).toEqual([
      ["P01", ["step"]],
      ["P02", ["thing"]],
      ["P03", []],
    ]);
  });

  test("reads a pattern predicate on one of its kinds' demanded slots", () => {
    expect(definition.patterns.at(0)).toMatchObject({
      id: "P01",
      slot: "how long it takes",
    });
  });

  test("flattens guidance and runbook cells with their key paths", () => {
    expect(
      guidanceEntries(definition.guidance).map((entry) => entry.path),
    ).toEqual(["lenses", "movements.sweep", "failure_modes"]);
    expect(
      runbookEntries(definition.runbooks).map((entry) => entry.path),
    ).toEqual(["construct.kickoff"]);
  });
});

describe("contract violations fail to load", () => {
  test.each([
    [
      "a key the harness does not own",
      FIXTURE_PLUGIN_YAML.replace("guidance:\n", "guidance:\n  hints: []\n"),
      /hints/u,
    ],
    [
      "a missing group",
      FIXTURE_PLUGIN_YAML.replace(/machinery:[\s\S]*$/u, ""),
      /machinery/u,
    ],
    [
      "a malformed version",
      FIXTURE_PLUGIN_YAML.replace("fixture/2026-08-25.1", "fixture-1"),
      /yyyy-mm-dd/u,
    ],
    [
      "a demand row for an unknown kind",
      FIXTURE_PLUGIN_YAML.replace(
        "{ kind: step, slot: who performs it",
        "{ kind: queue, slot: who performs it",
      ),
      /`queue`, which is not in `ontology.kinds`/u,
    ],
    [
      "an unknown precision word",
      FIXTURE_PLUGIN_YAML.replace("precision: spread", "precision: roughly"),
      /precision/u,
    ],
    [
      "a kind with no demand row",
      FIXTURE_PLUGIN_YAML.replace(/ {4}- \{ kind: step, slot[^\n]*\n/gu, ""),
      /no row for kind `step`/u,
    ],
    [
      "an anchor slot that is not a row",
      FIXTURE_PLUGIN_YAML.replace(
        "depends_on: the nodes it depends on",
        "depends_on: the things it needs",
      ),
      /not a `must_know` row/u,
    ],
    [
      "an anchor slot that is not a count",
      FIXTURE_PLUGIN_YAML.replace(
        "depends_on: the nodes it depends on",
        "depends_on: the question",
      ),
      /at least N/u,
    ],
    [
      "a pattern on an unknown kind",
      FIXTURE_PLUGIN_YAML.replace("on: [step]", "on: [queue]"),
      /pattern P01 names kind `queue`/u,
    ],
    [
      "a pattern predicate on a slot its kind does not demand",
      FIXTURE_PLUGIN_YAML.replace(
        "on: [step], slot: how long it takes",
        "on: [step], slot: queue capacity",
      ),
      /pattern P01 names slot `queue capacity`, which `step` does not demand/u,
    ],
    [
      "a wildcard pattern predicate on a slot no kind demands",
      FIXTURE_PLUGIN_YAML.replace(
        "id: P03, on: [], when:",
        "id: P03, on: [], slot: queue capacity, when:",
      ),
      /pattern P03 names slot `queue capacity`, which no kind demands/u,
    ],
    [
      "a runbook for an undeclared job",
      FIXTURE_PLUGIN_YAML.replace(
        "runbooks:\n",
        "runbooks:\n  review-and-revise: { kickoff: [], trajectory: [], close: [] }\n",
      ),
      /`plugin.jobs` does not declare it/u,
    ],
    [
      "a guidance item without a name",
      FIXTURE_PLUGIN_YAML.replace(
        "{ name: fixture lens, text: Notice things. }",
        "{ text: Notice things. }",
      ),
      /guidance.lenses.0.name/u,
    ],
    ["text that is not YAML", "plugin: [", /not valid YAML/u],
  ])("%s", (_label, yaml, message) => {
    expect(() => readPluginDefinition(yaml)).toThrow(PluginDefinitionError);
    expect(() => readPluginDefinition(yaml)).toThrow(message);
  });
});

const readShipped = (packageName: string): PluginDefinition =>
  readPluginDefinition(
    readFileSync(
      join(CONTEXT_ROOT, "packages", packageName, "plugin.yaml"),
      "utf8",
    ),
  );

/** Words that would mean the plugin knows a domain rather than a formalism. */
const DOMAIN_WORDS =
  /\b(hospital|patient|coating|vestera|truck|packaging|warehouse|factory|bakery|clinic)\b/iu;

describe.skipIf(!contextRootPresent)("the shipped plugin definitions", () => {
  test.each(["plugin-sdcpn", "plugin-gherkin"])(
    "%s validates, adds no key, and names no domain",
    (packageName) => {
      const definition = readShipped(packageName);
      expect(definition.identity.id).toBe(packageName.replace("plugin-", ""));
      expect(definition.kinds.length).toBeGreaterThan(0);
      expect(
        definition.mustKnow.some(
          (row) =>
            row.kind === definition.anchor.kind &&
            row.slot === definition.anchor.dependencySlot,
        ),
      ).toBe(true);
      const text = JSON.stringify(definition);
      expect(text).not.toMatch(DOMAIN_WORDS);
      for (const key of GUIDANCE_KEYS) {
        expect(definition.guidance).toHaveProperty(key);
      }
      for (const job of definition.identity.jobs) {
        const cells = definition.runbooks[job];
        expect(
          cells === undefined || RUNBOOK_KEYS.every((key) => key in cells),
        ).toBe(true);
      }
    },
  );

  test("the two plugins declare different anchors under the same schema", () => {
    const sdcpn = readShipped("plugin-sdcpn");
    const gherkin = readShipped("plugin-gherkin");
    expect(sdcpn.anchor.kind).not.toBe(gherkin.anchor.kind);
    expect(sdcpn.proposals.map((p) => p.type)).toEqual(["slot-asserted"]);
  });

  test("SDCPN accepts structural alternatives to numeric precision where the slot permits either", () => {
    const sdcpn = readShipped("plugin-sdcpn");
    expect(
      sdcpn.mustKnow
        .filter((row) =>
          [
            'what "better" means, and trade-off weights',
            "the arrival or availability pattern",
          ].includes(row.slot),
        )
        .map((row) => [row.slot, row.precision]),
    ).toEqual([
      [
        'what "better" means, and trade-off weights',
        { kind: "any-of", words: ["range", "spelled out"] },
      ],
      [
        "the arrival or availability pattern",
        { kind: "any-of", words: ["spread", "spelled out"] },
      ],
    ]);
  });

  test("ambiguous kind-indexed patterns declare the slot that keeps them live", () => {
    const sdcpn = readShipped("plugin-sdcpn");
    const gherkin = readShipped("plugin-gherkin");
    expect(
      sdcpn.patterns
        .filter((pattern) => ["P01", "P02"].includes(pattern.id))
        .map((pattern) => [pattern.id, pattern.slot]),
    ).toEqual([
      ["P01", "how often it occurs, if it is an event rather than a step"],
      ["P02", "what is lost when it changes the system's mode"],
    ]);
    expect(
      gherkin.patterns
        .filter((pattern) => ["P01", "P03"].includes(pattern.id))
        .map((pattern) => [pattern.id, pattern.slot]),
    ).toEqual([
      ["P01", "the examples that illustrate it"],
      ["P03", "the observable outcome"],
    ]);
  });
});
