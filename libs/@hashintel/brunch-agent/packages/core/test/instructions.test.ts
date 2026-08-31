import { describe, expect, test } from "vitest";

import {
  HARNESS_PREAMBLE,
  renderGuidance,
  renderInstructions,
  renderRunbook,
} from "../src/instructions";
import {
  GUIDANCE_KEY_DESCRIPTIONS,
  GUIDANCE_KEYS,
  RUNBOOK_KEY_DESCRIPTIONS,
  RUNBOOK_KEYS,
} from "../src/keys";
import { readPluginDefinition } from "../src/plugin-definition";
import { readRepertoire, type Repertoire } from "../src/repertoire";
import { FIXTURE_PLUGIN_YAML, fixturePluginDefinition } from "./slot-fixtures";

const item = (name: string) =>
  `      - { name: ${name}, text: default ${name}., source: test }`;
const cell = (path: string) => `    ${path}:\n${item(`${path} default`)}`;

/** A minimal repertoire: one sourced default under every key. */
const REPERTOIRE_YAML = `repertoire:
  version: repertoire/2026-08-25.1
  purpose: test
guidance:
  lenses:
${item("lenses default")}
  techniques:
${item("techniques default")}
  movements:
    slice:
${item("slice default")}
    sweep:
${item("sweep default")}
  licenses:
${item("licenses default")}
  motifs:
${item("motifs default")}
  smells:
${item("smells default")}
  rabbit_holes:
${item("rabbit_holes default")}
  failure_modes:
      - { name: failure default, text: default failure., signature: a sign, source: test }
runbooks:
  construct:
${cell("kickoff")}
${cell("trajectory")}
${cell("close")}
  review-and-revise:
${cell("kickoff")}
${cell("trajectory")}
${cell("close")}
`;

const repertoire: Repertoire = readRepertoire(REPERTOIRE_YAML);
const definition = fixturePluginDefinition();

const indexOfAll = (text: string, needles: readonly string[]): number[] =>
  needles.map((needle) => text.indexOf(needle));

const ascending = (positions: readonly number[]): boolean =>
  positions.every(
    (position, index) =>
      position >= 0 && (index === 0 || position > positions[index - 1]!),
  );

describe("renderInstructions", () => {
  const text = renderInstructions(repertoire, definition);

  test("opens with what the harness enforces, then the contract, then guidance, then runbooks", () => {
    expect(
      ascending(
        indexOfAll(text, [
          "## What the harness enforces",
          HARNESS_PREAMBLE[0]!,
          "## Purpose",
          "## Kinds",
          "## Must know",
          "## Patterns",
          `## ${GUIDANCE_KEY_DESCRIPTIONS.lenses.title}`,
          `## ${GUIDANCE_KEY_DESCRIPTIONS.failure_modes.title}`,
          "## Job: construct",
          `### ${RUNBOOK_KEY_DESCRIPTIONS.close.title}`,
        ]),
      ),
    ).toBe(true);
  });

  test("renders every guidance key in catalogue order: definition, default, then the plugin cell", () => {
    const positions = indexOfAll(
      text,
      GUIDANCE_KEYS.map((key) => `## ${GUIDANCE_KEY_DESCRIPTIONS[key].title}`),
    );
    expect(ascending(positions)).toBe(true);
    expect(
      ascending(
        indexOfAll(text, [
          `## ${GUIDANCE_KEY_DESCRIPTIONS.lenses.title}`,
          GUIDANCE_KEY_DESCRIPTIONS.lenses.definition,
          "**lenses default**",
          "**fixture lens**",
        ]),
      ),
    ).toBe(true);
  });

  test("renders a blank plugin cell as the default alone, never as an empty heading", () => {
    // The fixture leaves `techniques` blank: the default is the whole key.
    const section = renderGuidance(repertoire, definition).find((part) =>
      part.startsWith(`## ${GUIDANCE_KEY_DESCRIPTIONS.techniques.title}`),
    )!;
    expect(section).toContain("**techniques default**");
    expect(section).not.toMatch(/\n\n$/u);
  });

  test("renders a repertoire item only when the plugin demands an applicable precision", () => {
    const conditionalRepertoire = readRepertoire(
      REPERTOIRE_YAML.replace(
        item("techniques default"),
        "      - { name: techniques default, text: default techniques default., source: test, for_precision: [range, spread] }",
      ).replace(
        item("kickoff default"),
        "      - { name: kickoff default, text: default kickoff default., source: test, for_precision: [range, spread] }",
      ),
    );
    const nonNumericDefinition = readPluginDefinition(
      FIXTURE_PLUGIN_YAML.replace(
        "precision: range",
        "precision: named",
      ).replace("precision: spread", "precision: spelled out"),
    );

    expect(
      renderGuidance(conditionalRepertoire, definition).join("\n"),
    ).toContain("**techniques default**");
    expect(
      renderGuidance(conditionalRepertoire, nonNumericDefinition).join("\n"),
    ).not.toContain("**techniques default**");
    expect(
      renderRunbook(conditionalRepertoire, definition, "construct"),
    ).toContain("**kickoff default**");
    expect(
      renderRunbook(conditionalRepertoire, nonNumericDefinition, "construct"),
    ).not.toContain("**kickoff default**");
  });

  test("splits movements into slice and sweep", () => {
    expect(
      ascending(
        indexOfAll(text, [
          "### Slice",
          "**slice default**",
          "### Sweep",
          "**sweep default**",
          "**fixture sweep**",
        ]),
      ),
    ).toBe(true);
  });

  test("renders a runbook only for the jobs the plugin declares", () => {
    expect(text).toContain("## Job: construct");
    expect(text).not.toContain("## Job: review and revise");
    const runbook = renderRunbook(repertoire, definition, "construct");
    expect(
      ascending(
        indexOfAll(
          runbook,
          RUNBOOK_KEYS.map(
            (key) => `### ${RUNBOOK_KEY_DESCRIPTIONS[key].title}`,
          ),
        ),
      ),
    ).toBe(true);
    expect(runbook).toContain("**kickoff default**");
    expect(runbook).toContain("**fixture kickoff**");
  });

  test("renders the contract from data: rows by kind, the floor, the declared anchor, the precision ladder", () => {
    expect(text).toContain("the nodes it depends on — at least 1");
    expect(text).toContain('how many — range; "not applicable" is accepted');
    expect(text).toContain("at least 1 `objective`, 2 `thing`, 1 `step`");
    expect(text).toContain("before anything `objective`-relative counts");
    expect(text).toContain("completion is relative to `objective` nodes");
    expect(text).toContain("`spelled out` —");
    expect(text).toContain("**P02** — _when_ more than one thing competes");
    expect(text).toContain("_Signature:_ it says so");
  });

  test("does not hardcode objective-relative completion when the anchor is another kind", () => {
    const featureAnchored = readPluginDefinition(
      FIXTURE_PLUGIN_YAML.replaceAll("objective", "feature"),
    );
    const rendered = renderInstructions(repertoire, featureAnchored);
    expect(rendered).toContain("before anything `feature`-relative counts");
    expect(rendered).toContain("completion is relative to `feature` nodes");
    expect(rendered).not.toContain("objective-relative");
  });

  test("renders alternative demanded precisions as any-of", () => {
    const withAlternatives = readPluginDefinition(
      FIXTURE_PLUGIN_YAML.replace(
        "precision: spread",
        "precision: [spread, spelled out]",
      ),
    );
    expect(renderInstructions(repertoire, withAlternatives)).toContain(
      "how long it takes — spread or spelled out",
    );
  });

  test("contains no template residue", () => {
    expect(text).not.toMatch(/\$\{|undefined|\[object Object\]/u);
  });
});
