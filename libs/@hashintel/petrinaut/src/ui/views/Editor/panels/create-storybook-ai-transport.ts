import type { ChatTransport, UIMessageChunk } from "ai";

import type { PetrinautAiMessage } from "./ai-assistant-panel";

const placeInput = {
  id: "place__ai_buffer",
  name: "AI Buffer",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  showAsInitialState: true,
  x: 180,
  y: 140,
};

const transitionInput = {
  id: "transition__ai_dispatch",
  name: "AI Dispatch",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "export const Lambda = () => true;",
  transitionKernelCode: "export const TransitionKernel = () => ({});",
  x: 420,
  y: 140,
};

const chunksForInitialRequest = (): UIMessageChunk[] => [
  { type: "reasoning-start", id: "reasoning-1" },
  {
    type: "reasoning-delta",
    id: "reasoning-1",
    delta:
      "Identify the requested process elements, then add a place and transition with stable IDs.",
  },
  { type: "reasoning-end", id: "reasoning-1" },
  {
    type: "tool-input-available",
    toolCallId: "tool-add-place",
    toolName: "addPlace",
    input: placeInput,
  },
  {
    type: "tool-input-available",
    toolCallId: "tool-add-transition",
    toolName: "addTransition",
    input: transitionInput,
  },
];

const chunksForFollowUpRequest = (): UIMessageChunk[] => [
  { type: "text-start", id: "text-1" },
  {
    type: "text-delta",
    id: "text-1",
    delta:
      "I added an AI Buffer place and an AI Dispatch transition. You can select the change summaries to inspect the new items.",
  },
  { type: "text-end", id: "text-1" },
];

const streamChunks = (
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const hasToolOutput = (messages: PetrinautAiMessage[]): boolean =>
  messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type.startsWith("tool-") &&
        "state" in part &&
        part.state === "output-available",
    ),
  );

export const createStorybookAiTransport =
  (): ChatTransport<PetrinautAiMessage> => ({
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: ({ messages }) =>
      Promise.resolve(
        streamChunks(
          hasToolOutput(messages)
            ? chunksForFollowUpRequest()
            : chunksForInitialRequest(),
        ),
      ),
  });
