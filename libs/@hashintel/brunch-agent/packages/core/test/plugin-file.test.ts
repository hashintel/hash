import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  parsePluginFile,
  PLUGIN_FILE_HEADINGS,
  PluginFileError,
  pluginFileInstructions,
  mustKnowRowsFor,
} from "../src/plugin-file";
import { CONTEXT_ROOT, contextRootPresent } from "./architecture/workspace";
import { FIXTURE_PLUGIN_MARKDOWN, fixturePluginFile } from "./slot-fixtures";

describe("the synthetic fixture file", () => {
  const file = fixturePluginFile();

  test("reads the version, the kind catalog, and every section", () => {
    expect(file.version).toBe("fixture/2026-08-25.1");
    expect(file.kinds.map((row) => row.kind)).toEqual([
      "objective",
      "thing",
      "step",
    ]);
    expect(Object.keys(file.sections)).toEqual([...PLUGIN_FILE_HEADINGS]);
    expect(file.sections.Purpose).toBe(
      "Interview someone about things and steps.",
    );
  });

  test("reads demand rows with typed precision and the not-applicable flag", () => {
    expect(mustKnowRowsFor(file, "objective")).toEqual([
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
    expect(mustKnowRowsFor(file, "thing")[1]?.notApplicableAllowed).toBe(true);
  });

  test("reads the static floor as counts from the prose beneath the table", () => {
    expect(file.floor).toEqual([
      { kind: "objective", atLeast: 1 },
      { kind: "thing", atLeast: 2 },
      { kind: "step", atLeast: 1 },
    ]);
  });

  test("indexes patterns by the kinds their trigger names", () => {
    expect(file.patterns.map((row) => [row.id, row.kinds])).toEqual([
      ["P01", ["step"]],
      ["P02", ["thing"]],
      ["P03", []],
    ]);
  });

  test("renders every section in contract order as instructions", () => {
    const instructions = pluginFileInstructions(file);
    const positions = PLUGIN_FILE_HEADINGS.map((heading) =>
      instructions.indexOf(`## ${heading}`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("contract violations fail to load", () => {
  const withoutLinesStarting = (prefix: string): string =>
    FIXTURE_PLUGIN_MARKDOWN.split("\n")
      .filter((line) => !line.startsWith(prefix))
      .join("\n");

  test.each([
    [
      "a missing heading",
      FIXTURE_PLUGIN_MARKDOWN.replace("## Moves\n", ""),
      /Contract headings/u,
    ],
    [
      "a reordered heading",
      FIXTURE_PLUGIN_MARKDOWN.replace("## Purpose", "## Kinds").replace(
        /## Kinds\n\n\| #/u,
        "## Purpose\n\n| #",
      ),
      /Contract headings/u,
    ],
    [
      "a renamed heading",
      FIXTURE_PLUGIN_MARKDOWN.replace("## Must know", "## Demands"),
      /Contract headings/u,
    ],
    [
      "a missing version",
      FIXTURE_PLUGIN_MARKDOWN.replace(/Version: `[^`]+`/u, ""),
      /immutable version/u,
    ],
    [
      "an unknown column",
      FIXTURE_PLUGIN_MARKDOWN.replace("| projects to |", "| becomes |"),
      /columns must be exactly/u,
    ],
    [
      "a demand row for an unknown kind",
      FIXTURE_PLUGIN_MARKDOWN.replace(
        "| `step`      | who performs it",
        "| `queue`     | who performs it",
      ),
      /not in `## Kinds`/u,
    ],
    [
      "an unknown precision word",
      FIXTURE_PLUGIN_MARKDOWN.replace(
        "| spread      | no ",
        "| roughly     | no ",
      ),
      /precision `roughly`/u,
    ],
    [
      "a kind with no demand row",
      withoutLinesStarting("| `step`"),
      /no row for kind `step`/u,
    ],
    [
      "a floor that names no kind",
      FIXTURE_PLUGIN_MARKDOWN.replace(
        /Static floor[^\n]*\n[^\n]*\n/u,
        "Static floor — none.\n",
      ),
      /Static floor names no kind/u,
    ],
    [
      "a not-applicable cell that is not yes or no",
      FIXTURE_PLUGIN_MARKDOWN.replace(
        "| spelled out | no                       | anchor",
        "| spelled out | maybe                    | anchor",
      ),
      /expected `yes` or `no`/u,
    ],
  ])("%s", (_label, markdown, message) => {
    expect(() => parsePluginFile(markdown)).toThrow(PluginFileError);
    expect(() => parsePluginFile(markdown)).toThrow(message);
  });
});

describe.skipIf(!contextRootPresent)("the SDCPN plugin file", () => {
  const file = parsePluginFile(
    readFileSync(join(CONTEXT_ROOT, "packages/plugin-sdcpn/plugin.md"), "utf8"),
  );

  test("loads under the contract with Layer B's ten kinds", () => {
    expect(file.version).toBe("sdcpn/2026-08-25.1");
    expect(file.kinds.map((row) => row.kind)).toEqual([
      "entity-type",
      "boundary-condition",
      "activity",
      "ordering/flow",
      "policy",
      "dynamics",
      "objective",
      "constraint",
      "data-binding",
      "validation-criterion",
    ]);
  });

  test("states the floor and one dependency row on the objective", () => {
    expect(file.floor).toEqual([
      { kind: "objective", atLeast: 1 },
      { kind: "entity-type", atLeast: 2 },
      { kind: "activity", atLeast: 1 },
      { kind: "ordering/flow", atLeast: 1 },
    ]);
    const anchors = file.mustKnow.filter(
      (row) => row.kind === "objective" && row.precision.kind === "at-least",
    );
    expect(anchors.map((row) => row.slot)).toEqual(["the nodes it depends on"]);
  });

  test("carries twenty-four demand rows and thirteen patterns, every pattern kind-indexed or generic", () => {
    expect(file.mustKnow).toHaveLength(24);
    expect(file.patterns.map((row) => row.id)).toEqual(
      Array.from(
        { length: 13 },
        (_, index) => `P${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(file.patterns.find((row) => row.id === "P01")?.kinds).toEqual([
      "activity",
    ]);
  });

  test("names no domain", () => {
    const text = pluginFileInstructions(file).toLowerCase();
    for (const domainWord of [
      "coating",
      "packaging",
      "truck",
      "fleet",
      "paint",
    ]) {
      expect(text).not.toContain(domainWord);
    }
  });
});
