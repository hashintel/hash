import { describe, expect, test } from "vitest";

import { getInteractiveTool } from "./registry";

const toolCall = (toolName: string, input: unknown) => ({
  toolName,
  toolCallId: `${toolName}-call`,
  input,
});

describe("interactive tool registry", () => {
  test("preserves the built-in applyAutoLayout branching behavior", () => {
    expect(
      getInteractiveTool(toolCall("applyAutoLayout", { askUserFirst: true })),
    ).toBeDefined();
    expect(
      getInteractiveTool(toolCall("applyAutoLayout", { askUserFirst: false })),
    ).toBeUndefined();
  });
});
