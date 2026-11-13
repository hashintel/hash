/**
 * Shared scaffolding for the platform-contract probes: a faux model that
 * records every request it answers, a tool that holds its round open until
 * released, and readers of a conversation's entries and messages.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  type FauxResponseStep,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  type Conversation,
  defineTool,
  type EntryRecord,
  type JsonObject,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";

import type { Message } from "@earendil-works/pi-ai";

export { fauxAssistantMessage, fauxToolCall };

export const context = BACKGROUND_CONTEXT;

/** A model response that calls `toolName` once, with call ID `id`. */
export const call = (
  toolName: string,
  id: string,
  args: JsonObject = {},
): FauxResponseStep =>
  fauxAssistantMessage(fauxToolCall(toolName, args, { id }), {
    stopReason: "toolUse",
  });

/** A model response that calls each `[toolName, id, args]` in one round, in order. */
export const calls = (
  ...toolCalls: readonly (readonly [string, string, JsonObject?])[]
): FauxResponseStep =>
  fauxAssistantMessage(
    toolCalls.map(([toolName, id, args = {}]) =>
      fauxToolCall(toolName, args, { id }),
    ),
    { stopReason: "toolUse" },
  );

/**
 * A faux model answering with `responses`, one per request, that records the
 * messages of every request it answers, in order.
 */
export const recordingModel = (responses: readonly FauxResponseStep[]) => {
  const requests: Message[][] = [];
  const faux = fauxProvider();
  faux.setResponses(
    responses.map((step): FauxResponseFactory => (requestContext, ...rest) => {
      requests.push(structuredClone(requestContext.messages));
      return typeof step === "function" ? step(requestContext, ...rest) : step;
    }),
  );
  const models = createModels();
  models.setProvider(faux.provider);
  const model: ModelRef = {
    provider: faux.provider.id,
    modelId: faux.getModel().id,
  };
  return { models, model, requests };
};

/** A tool that holds its call open until `release()`; `started` resolves once it runs. */
export const holdTool = (name = "hold") => {
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const tool = defineTool({
    name,
    description: "Holds its call open until the probe releases it.",
    parameters: obj({}),
    execute: async () => {
      started();
      await gate;
      return { output: [{ type: "text", text: "held" }] };
    },
  });
  return { tool, release: () => release(), started: running };
};

/** Every entry of a conversation, oldest first. */
export const allEntries = async (
  conversation: Conversation,
): Promise<readonly EntryRecord[]> =>
  (await conversation.entries({ order: "ascending" }, 1000, undefined, context))
    .items;

/** A message's text, its text parts joined. */
export const textOf = (message: Message | undefined): string => {
  if (message === undefined) return "";
  if (message.role === "assistant")
    return message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
  if (typeof message.content === "string") return message.content;
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
};

/** A short label per message, for comparing request shapes: `user:<text>`, `call:<ids>`, `result:<id>:<text>`, `system`. */
export const shapeOf = (messages: readonly Message[]): string[] =>
  messages.map((message) => {
    if (message.role === "system")
      return `system:${Object.keys(message.sections ?? {}).join(",")}`;
    if (message.role === "user") return `user:${textOf(message)}`;
    if (message.role === "toolResult")
      return `result:${message.toolCallId}:${textOf(message)}`;
    const ids = message.content.flatMap((part) =>
      part.type === "toolCall" ? [part.id] : [],
    );
    return ids.length > 0
      ? `call:${ids.join(",")}`
      : `answer:${textOf(message)}`;
  });

/** The `pi.tool-result` entry of call `toolCallId`. */
export const resultEntry = (
  entries: readonly EntryRecord[],
  toolCallId: string,
): EntryRecord | undefined =>
  entries.find(
    (entry) =>
      entry.kind === "pi.tool-result" &&
      entry.model?.[0]?.role === "toolResult" &&
      entry.model[0].toolCallId === toolCallId,
  );

/** Entry kinds in order, a tool result labelled with its call ID. */
export const kindsOf = (entries: readonly EntryRecord[]): string[] =>
  entries.map((entry) => {
    const message = entry.model?.[0];
    if (entry.kind === "pi.tool-result" && message?.role === "toolResult")
      return `pi.tool-result(${message.toolCallId})`;
    if (entry.kind === "pi.assistant" && message?.role === "assistant") {
      const ids = message.content.flatMap((part) =>
        part.type === "toolCall" ? [part.id] : [],
      );
      return ids.length > 0 ? `pi.assistant(${ids.join(",")})` : "pi.assistant";
    }
    return entry.kind;
  });
