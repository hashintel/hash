import { expect, test } from "vitest";

import { getInteractiveTool } from "./registry";
import { definePetrinautAiInteractiveTool } from "./types";

const brunchAsk = definePetrinautAiInteractiveTool({
  toolName: "brunch_ask",
  shouldHandle: () => true,
  parseInput: (input: unknown) => input as { question: string },
  Widget: () => null,
});

test("resolves a host-supplied interactive tool", () => {
  expect(
    getInteractiveTool(
      "brunch_ask",
      { question: "What outcome should the process produce?" },
      [brunchAsk],
    ),
  ).toBe(brunchAsk);
});

test("does not let a host shadow a Petrinaut-owned tool", () => {
  const shadow = definePetrinautAiInteractiveTool({
    ...brunchAsk,
    toolName: "applyAutoLayout",
  });

  expect(
    getInteractiveTool("applyAutoLayout", { askUserFirst: true }, [shadow]),
  ).not.toBe(shadow);
});
