import { describe, expect, test } from "vitest";

import { definePetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import { getMessageRenderItems } from "./get-message-render-items";

import type { PetrinautAiMessage } from "../types";

describe("conversation turn structure", () => {
  test("groups work across steps before the answer and produced cards", () => {
    const message: PetrinautAiMessage = {
      id: "turn",
      role: "assistant",
      parts: [
        { type: "text", text: "Checking the model." },
        {
          type: "dynamic-tool",
          toolName: "inspect",
          toolCallId: "inspect-1",
          state: "output-available",
          input: {},
          output: "ok",
        },
        { type: "step-start" },
        { type: "reasoning", text: "Compare the capacities.", state: "done" },
        {
          type: "dynamic-tool",
          toolName: "inspect",
          toolCallId: "inspect-2",
          state: "output-error",
          input: {},
          errorText: "Unavailable",
        },
        { type: "text", text: "Here is the comparison." },
      ],
    };
    const turn = getMessageRenderItems(message);
    expect(turn.work.tools.map((tool) => tool.id)).toEqual([
      "inspect-1",
      "inspect-2",
    ]);
    expect(turn.work.reasoning).toHaveLength(1);
    expect(turn.answers.map((answer) => answer.part.text)).toEqual([
      "Checking the model.",
      "Here is the comparison.",
    ]);
    expect(turn.cards).toEqual([]);
  });

  test("keeps a card-placed tool out of the work fold while it streams and after it errors", () => {
    const draftTool = definePetrinautAiInteractiveTool({
      toolName: "draft",
      placement: "card",
      inputSchema: { parse: (input: unknown) => input },
      outputSchema: { parse: (output: unknown) => output },
      component: () => null,
    });
    const turn = getMessageRenderItems(
      {
        id: "turn",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "draft",
            toolCallId: "draft-streaming",
            state: "input-streaming",
            input: {},
          },
          {
            type: "dynamic-tool",
            toolName: "draft",
            toolCallId: "draft-failed",
            state: "output-error",
            input: {},
            errorText: "Preparation failed",
          },
        ],
      },
      [draftTool],
    );
    expect(turn.work.tools).toEqual([]);
    expect(turn.cards.map((card) => card.key)).toEqual([
      "draft-streaming",
      "draft-failed",
    ]);
  });

  test("accepts optional mediation data without rendering unknown data", () => {
    const turn = getMessageRenderItems({
      id: "voice",
      role: "assistant",
      parts: [
        {
          type: "data-brief",
          data: {
            state: "done",
            preparationFailed: true,
            fields: { goal: "Reduce the queue", stillOpen: "Arrival rate" },
          },
        },
        {
          type: "data-voiceAgentReply",
          data: { state: "done", text: "I’ll check that." },
        },
        {
          type: "data-voiceAgentWrapUp",
          data: { state: "streaming", text: "The draft is ready." },
        },
        { type: "data-unrelated", data: { text: "Do not render" } },
      ],
    });
    expect(turn.brief?.fields).toEqual({
      goal: "Reduce the queue",
      stillOpen: "Arrival rate",
    });
    expect(turn.brief?.state).toBe("done");
    expect(turn.brief?.preparationFailed).toBe(true);
    expect(turn.voiceAgentReply?.text).toBe("I’ll check that.");
    expect(turn.voiceAgentWrapUp?.state).toBe("streaming");
    expect(turn.answers).toEqual([]);
  });
});
