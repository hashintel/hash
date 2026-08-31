import { expect, test } from "vitest";

import { createBrunchPanelTransport } from "./brunch-panel-transport";

import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";
import type { UIMessageChunk } from "ai";

const sweepChunks: UIMessageChunk[] = [
  {
    type: "tool-input-available",
    toolCallId: "no-range",
    toolName: "brunch_sweep",
    input: {},
  },
  {
    type: "tool-output-available",
    toolCallId: "no-range",
    output: { status: "no-settled-range" },
  },
  {
    type: "tool-input-available",
    toolCallId: "refused",
    toolName: "brunch_sweep",
    input: {},
  },
  {
    type: "tool-output-available",
    toolCallId: "refused",
    output: {
      status: "refused",
      refusal: {
        code: "evidence-quote-not-found",
        message: "Use an exact quote.",
      },
    },
  },
  {
    type: "tool-input-available",
    toolCallId: "applied",
    toolName: "brunch_sweep",
    input: {},
  },
  {
    type: "tool-output-available",
    toolCallId: "applied",
    output: {
      status: "applied",
      appliedCaptureIds: ["capture-1"],
      captures: [
        {
          id: "capture-1",
          status: "active",
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: { type: "slot-asserted" } },
          evidence: [{ excerpt: "Line A runs next." }],
        },
        {
          id: "capture-old",
          status: "superseded",
          epistemicStatus: "inferred",
          confidence: "medium",
          content: { absence: "unknown" },
          basis: {
            type: "default-rule",
            description: "The earlier default.",
          },
          alternativeGroup: "line-a-owner",
        },
        {
          id: "capture-withdrawn",
          status: "retracted",
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: "Sam" },
          evidence: [{ excerpt: "Not Sam after all." }],
          supersedes: "capture-old",
        },
      ],
      completion: {
        complete: false,
        pluginVersion: "1.0.0",
        revision: "revision-1",
        failures: [
          {
            diagnostic: "unaddressed",
            nodeId: "activity:line-a",
            kind: "activity",
            slot: "owner",
            requirement: "named",
            actual: "not mentioned",
            message: "The owner is missing.",
            captureIds: ["capture-1"],
          },
        ],
        sliceNodeIds: ["activity:line-a"],
        outsideSlice: [
          {
            nodeId: "activity:Line-B",
            kind: "activity",
            open: [
              {
                diagnostic: "unaddressed",
                nodeId: "activity:Line-B",
                kind: "activity",
                slot: "Owner",
                requirement: "named",
                actual: "not mentioned",
                message: "The owner is missing.",
                captureIds: ["Capture-2"],
              },
            ],
          },
        ],
      },
    },
  },
];

const sourceTransport: PetrinautAiChatTransport = {
  reconnectToStream: async () => null,
  sendMessages: async () =>
    new ReadableStream({
      start(controller) {
        for (const chunk of sweepChunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
};

const readChunks = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

test("makes every Brunch sweep outcome readable in the panel", async () => {
  const transport = createBrunchPanelTransport(sourceTransport);
  const stream = await transport.sendMessages({} as never);
  const chunks = await readChunks(stream);
  const outputs = chunks.filter(
    (chunk) => chunk.type === "tool-output-available",
  );

  expect(outputs.map((outputChunk) => outputChunk.output)).toEqual([
    {
      status: "no-settled-range",
      title: "No settled range to sweep",
      detail: "The conversation has no settled user entries.",
    },
    {
      status: "refused",
      refusal: {
        code: "evidence-quote-not-found",
        message: "Use an exact quote.",
      },
      title: "Sweep refused",
      detail: "Use an exact quote.",
      items: ["Refusal: evidence-quote-not-found"],
    },
    {
      status: "applied",
      appliedCaptureIds: ["capture-1"],
      captures: [
        {
          id: "capture-1",
          status: "active",
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: { type: "slot-asserted" } },
          evidence: [{ excerpt: "Line A runs next." }],
        },
        {
          id: "capture-old",
          status: "superseded",
          epistemicStatus: "inferred",
          confidence: "medium",
          content: { absence: "unknown" },
          basis: {
            type: "default-rule",
            description: "The earlier default.",
          },
          alternativeGroup: "line-a-owner",
        },
        {
          id: "capture-withdrawn",
          status: "retracted",
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: "Sam" },
          evidence: [{ excerpt: "Not Sam after all." }],
          supersedes: "capture-old",
        },
      ],
      completion: {
        complete: false,
        pluginVersion: "1.0.0",
        revision: "revision-1",
        failures: [
          {
            diagnostic: "unaddressed",
            nodeId: "activity:line-a",
            kind: "activity",
            slot: "owner",
            requirement: "named",
            actual: "not mentioned",
            message: "The owner is missing.",
            captureIds: ["capture-1"],
          },
        ],
        sliceNodeIds: ["activity:line-a"],
        outsideSlice: [
          {
            nodeId: "activity:Line-B",
            kind: "activity",
            open: [
              {
                diagnostic: "unaddressed",
                nodeId: "activity:Line-B",
                kind: "activity",
                slot: "Owner",
                requirement: "named",
                actual: "not mentioned",
                message: "The owner is missing.",
                captureIds: ["Capture-2"],
              },
            ],
          },
        ],
      },
      title: "Sweep applied",
      detail: "1 new capture · 3 total · incomplete",
      items: [
        'Capture capture-1 (active; explicit; confidence high): {"type":"slot-asserted"} — “Line A runs next.”',
        "Capture capture-old (superseded; inferred; confidence medium): absence: unknown — default-rule: The earlier default.; alternative group line-a-owner",
        'Capture capture-withdrawn (retracted; explicit; confidence high): "Sam" — “Not Sam after all.”; supersedes capture-old',
        "Completion: incomplete · plugin 1.0.0 · revision revision-1",
        "Completion slice: activity:line-a",
        "Completion gap [unaddressed] at activity:line-a.owner: needs named; actual not mentioned. The owner is missing. Captures: capture-1",
        "Outside completion slice: activity:Line-B (activity); 1 open requirement",
        "Outside-slice Completion gap [unaddressed] at activity:Line-B.Owner: needs named; actual not mentioned. The owner is missing. Captures: Capture-2",
      ],
    },
  ]);
});
