import { describe, expect, test } from "vitest";

import { readPetrinautDocToolName } from "@hashintel/petrinaut-core";

import { getChronologicalRenderItems } from "./get-message-render-items";

import type { PetrinautAiMessage } from "../../ai-message";

describe("chronological reading", () => {
  const inspect = (toolCallId: string, toolName = "inspect") =>
    ({
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "output-available",
      input: {},
      output: "ok",
    }) as const;

  test("keeps parts in streamed order, splitting tool runs at steps, text, reasoning and lookups", () => {
    const message: PetrinautAiMessage = {
      id: "turn",
      role: "assistant",
      parts: [
        { type: "text", text: "Checking the model." },
        inspect("inspect-1"),
        inspect("inspect-2"),
        { type: "step-start" },
        inspect("inspect-3"),
        {
          ...inspect("doc-1", readPetrinautDocToolName),
          input: { doc: "arcs" },
        },
        inspect("inspect-4"),
        { type: "reasoning", text: "Compare the capacities.", state: "done" },
        { type: "text", text: "Here is the comparison." },
      ],
    };

    const items = getChronologicalRenderItems(message);

    expect(
      items.map((item) =>
        item.type === "tools"
          ? item.tools.map((tool) => tool.id)
          : item.type === "experiment"
            ? item.key
            : item.part.text,
      ),
    ).toEqual([
      "Checking the model.",
      ["inspect-1", "inspect-2"],
      ["inspect-3"],
      ["doc-1"],
      ["inspect-4"],
      "Compare the capacities.",
      "Here is the comparison.",
    ]);
  });
});
