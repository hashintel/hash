import { describe, expect, test } from "vitest";

import { readPetrinautDocToolName } from "@hashintel/petrinaut-core";

import { definePetrinautAiInteractiveTool } from "../../ai-interactive-tool";
import { getMessageRenderItems } from "./get-message-render-items";

import type { PetrinautAiMessage } from "../types";

describe("ordered work", () => {
  const inspect = (toolCallId: string, toolName = "inspect") =>
    ({
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "output-available",
      input: {},
      output: "ok",
    }) as const;

  test("keeps tool order across steps and lookups while excluding hidden tools", () => {
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
        inspect("hidden-1", "secret"),
        { type: "reasoning", text: "Compare the capacities.", state: "done" },
        { type: "text", text: "Here is the comparison." },
      ],
    };

    const items = getMessageRenderItems(
      message,
      [],
      undefined,
      new Set(["secret"]),
    );

    expect(items.work.tools.map((tool) => tool.id)).toEqual([
      "inspect-1",
      "inspect-2",
      "inspect-3",
      "doc-1",
      "inspect-4",
    ]);
    expect(items.work.reasoning.map((item) => item.part.text)).toEqual([
      "Compare the capacities.",
    ]);
    expect(items.answers.map((item) => item.part.text)).toEqual([
      "Checking the model.",
      "Here is the comparison.",
    ]);
  });
});

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
      inputParser: { parse: (input: unknown) => input },
      outputParser: { parse: (output: unknown) => output },
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

  // The browser transport projects server tools as `tool-<name>` parts; only
  // dynamic client tools arrive as `dynamic-tool`.
  test.each([
    ["a server tool part", { type: "tool-offer_answers" }],
    [
      "a dynamic tool part",
      { type: "dynamic-tool", toolName: "offer_answers" },
    ],
  ] as const)(
    "turns offered answers in %s into one card, outside the work fold",
    (_shape, identity) => {
      const offer = {
        questions: [
          {
            kind: "choose",
            label: "Quarantined shipment",
            options: ["Stays counted as open", "Drops out until released"],
          },
        ],
      };
      const offerPart = (toolCallId: string, input: unknown) =>
        ({
          ...identity,
          toolCallId,
          state: "output-available",
          input,
          output: { offered: 1 },
        }) as unknown as PetrinautAiMessage["parts"][number];
      const turn = getMessageRenderItems({
        id: "turn",
        role: "assistant",
        parts: [
          { type: "text", text: "Does it stay counted as open?" },
          offerPart("offer-1", offer),
          offerPart("offer-malformed", { questions: [{ kind: "open" }] }),
          {
            type: "dynamic-tool",
            toolName: "ledger_commit",
            toolCallId: "commit-1",
            state: "output-available",
            input: { entries: [], endTurn: true },
            output: { status: "recorded" },
          },
        ],
      });
      expect(turn.cards).toEqual([{ type: "answers", key: "offer-1", offer }]);
      expect(turn.work.tools.map((tool) => tool.id)).toEqual(["commit-1"]);
      expect(turn.answers.map((answer) => answer.part.text)).toEqual([
        "Does it stay counted as open?",
      ]);
    },
  );

  test("shows a question offered twice in one turn only on its latest card", () => {
    const offerPart = (toolCallId: string, questions: unknown[]) =>
      ({
        type: "tool-offer_answers",
        toolCallId,
        state: "output-available",
        input: { questions },
        output: { offered: questions.length },
      }) as unknown as PetrinautAiMessage["parts"][number];
    const quarantine = {
      kind: "choose",
      label: "Quarantined shipment",
      options: ["Stays counted as open", "Drops out until released"],
    };
    const demand = { kind: "confirm", label: "Production demand" };
    const turn = getMessageRenderItems({
      id: "turn",
      role: "assistant",
      parts: [
        offerPart("offer-1", [quarantine, demand]),
        offerPart("offer-2", [
          { ...quarantine, options: ["Counted as open", "Out until released"] },
        ]),
      ],
    });
    expect(
      turn.cards.map((card) =>
        card.type === "answers"
          ? [card.key, card.offer.questions.map(({ label }) => label)]
          : card.key,
      ),
    ).toEqual([
      ["offer-1", ["Production demand"]],
      ["offer-2", ["Quarantined shipment"]],
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
