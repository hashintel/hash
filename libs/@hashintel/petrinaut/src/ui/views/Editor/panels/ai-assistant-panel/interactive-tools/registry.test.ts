import { expect, test } from "vitest";

import { getInteractiveTool } from "./registry";
import { definePetrinautAiInteractiveTool } from "./types";

const brunchAsk = definePetrinautAiInteractiveTool({
  toolName: "brunch_ask",
  shouldHandle: () => true,
  parseInput: String,
  parseOutput: String,
  Widget: () => null,
});

test("resolves a host-supplied interactive tool", () => {
  expect(
    getInteractiveTool(
      "brunch_ask",
      "What outcome should the process produce?",
      [brunchAsk],
    ),
  ).toEqual({ kind: "host", tool: brunchAsk });
});

test("does not let a host shadow a Petrinaut-owned tool", () => {
  const shadow = definePetrinautAiInteractiveTool({
    toolName: "applyAutoLayout",
    shouldHandle: () => true,
    parseInput: String,
    parseOutput: String,
    Widget: () => null,
  });

  expect(
    getInteractiveTool("applyAutoLayout", { askUserFirst: true }, [shadow]),
  ).not.toBe(shadow);
});
