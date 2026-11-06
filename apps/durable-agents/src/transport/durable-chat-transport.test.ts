import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import {
  type Conversation,
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { afterEach, expect, test } from "vitest";

import { fauxAssistantMessage, fauxToolCall } from "../../test/scripted-model";
import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { createDurableChatServer } from "./durable-chat-server";
import { createDurableChatTransport } from "./durable-chat-transport";

const context = BACKGROUND_CONTEXT;
const toolCallId = "call-1";
const title = "Laundry line";
const browserOutput = { ok: true, title };
const answer = "I set the net's title to Laundry line, as you asked.";

const harnesses: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    harnesses.splice(0).map((harness) => harness.close(context)),
  );
});

/** A conversation whose model calls `setNetTitle`, then answers, streamed slowly enough to show partials. */
const openChat = async () => {
  const faux = fauxProvider({
    tokensPerSecond: 300,
    tokenSize: { min: 3, max: 5 },
  });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(browserToolName, { title }, { id: toolCallId }),
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage(answer),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry,
      settings: { progress: { partialIntervalMs: 5, outputIntervalMs: 5 } },
    },
    context,
  );
  harnesses.push(harness);
  const root = await harness.root(context, {
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
  });
  const app = createDurableChatServer(harness, context);
  const transport = createDurableChatTransport({
    baseUrl: "http://durable.test",
    fetch: async (input, init) => app.request(input, init),
    clientToolNames: new Set([browserToolName]),
  });
  return { harness, root, app, transport };
};

const userMessage: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Call the net Laundry line." }],
};

const send = (
  transport: ReturnType<typeof createDurableChatTransport>,
  root: Conversation,
) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId: String(root.id),
    messageId: undefined,
    messages: [userMessage],
    abortSignal: undefined,
  });

/** Read a chunk stream, keeping every chunk read. */
const recorder = (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  const until = async (predicate: (chunk: UIMessageChunk) => boolean) => {
    for (;;) {
      // Each read depends on the one before.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) return undefined;
      chunks.push(value);
      if (predicate(value)) return value;
    }
  };
  return { chunks, until, drain: () => until(() => false) };
};

/** What the panel's in-band browser call does after `onToolCall`, by direct host calls. */
const actAsBrowser = async (harness: Harness, root: Conversation) => {
  for (;;) {
    // The tool task issues the call after the assistant entry commits; Brunch's panel retries its 404 too.
    // eslint-disable-next-line no-await-in-loop
    const claim = await claimBrowserCall(harness, root.id, toolCallId, context);
    if (claim !== undefined) {
      return finishBrowserCall(
        harness,
        {
          conversationId: root.id,
          toolCallId,
          toolName: claim.toolName,
          capability: claim.capability,
          canonicalInput: claim.input,
          output: browserOutput,
        },
        context,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }
};

/** Consecutive text deltas folded, so the sequence does not depend on stream timing. */
const chunkTypes = (chunks: readonly UIMessageChunk[]) =>
  chunks
    .map(({ type }) => type)
    .filter(
      (type, index, types) =>
        type !== "text-delta" || types[index - 1] !== "text-delta",
    );

/**
 * `createFlueUiStream`'s chunks for the same logical turn: `message-started`
 * opens the message and a step; a client tool's `tool-input` is
 * `tool-input-available` without `providerExecuted`; `message-completed` ends
 * the step; the tool's `tool-output` is `tool-output-available` with
 * `providerExecuted: true`; the answer's `message-started` opens a step whose
 * `message-delta`s are one text part, ended with the step; `submission-settled`
 * `completed` is `finish` with `finishReason: "stop"`.
 */
const flueTurnChunkTypes = [
  "start",
  "start-step",
  "tool-input-available",
  "finish-step",
  "tool-output-available",
  "start-step",
  "text-start",
  "text-delta",
  "text-end",
  "finish-step",
  "finish",
];

const reduce = async (chunks: readonly UIMessageChunk[], from?: UIMessage) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({
    message: from,
    stream,
    terminateOnError: true,
  })) {
    message = next;
  }
  return message;
};

const expectFlueTurn = async (chunks: readonly UIMessageChunk[]) => {
  expect(chunkTypes(chunks)).toEqual(flueTurnChunkTypes);
  const [start] = chunks;
  expect(start?.type === "start" ? start.messageId : undefined).toMatch(
    /^durable:\d+$/,
  );
  expect(Object.keys(start ?? {}).toSorted()).toEqual(["messageId", "type"]);
  expect(chunks.find(({ type }) => type === "tool-input-available")).toEqual({
    type: "tool-input-available",
    toolCallId,
    toolName: browserToolName,
    input: { title },
  });
  expect(chunks.find(({ type }) => type === "tool-output-available")).toEqual({
    type: "tool-output-available",
    toolCallId,
    output: browserOutput,
    providerExecuted: true,
  });
  const text = chunks.flatMap((chunk) =>
    chunk.type === "text-delta" ? [chunk.delta] : [],
  );
  expect(text.join("")).toBe(answer);
  expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });

  // The parts the panel reads, as the AI SDK's own reducer builds them.
  const message = await reduce(chunks);
  expect(message?.parts).toEqual([
    { type: "step-start" },
    {
      type: `tool-${browserToolName}`,
      toolCallId,
      state: "output-available",
      input: { title },
      output: browserOutput,
      providerExecuted: true,
    },
    { type: "step-start" },
    { type: "text", text: answer, state: "done" },
  ]);
  return text;
};

test("a browser-tool turn yields Flue's chunks and parts", async () => {
  const { harness, root, transport } = await openChat();
  const stream = recorder(await send(transport, root));

  // The panel's `onToolCall` fires on this chunk.
  await stream.until(({ type }) => type === "tool-input-available");
  expect(await actAsBrowser(harness, root)).toBe("settled");
  await stream.drain();

  const deltas = await expectFlueTurn(stream.chunks);
  // Streamed from `pi.live.generation`, not only the committed answer.
  expect(deltas.length).toBeGreaterThan(1);
});

test("a reconnect mid-call starts from the committed view and completes the turn", async () => {
  const { harness, root, transport } = await openChat();
  const first = recorder(await send(transport, root));
  await first.until(({ type }) => type === "tool-input-available");
  const heldAtReconnect = await reduce(first.chunks);

  const reattached = await transport.reconnectToStream({
    chatId: String(root.id),
  });
  expect(reattached).not.toBeNull();
  const second = recorder(reattached!);
  await second.until(({ type }) => type === "tool-input-available");
  // The committed view alone shows the pending call.
  expect(chunkTypes(second.chunks)).toEqual([
    "start",
    "start-step",
    "tool-input-available",
  ]);

  await actAsBrowser(harness, root);
  await Promise.all([first.drain(), second.drain()]);

  await expectFlueTurn(first.chunks);
  await expectFlueTurn(second.chunks);
  expect(second.chunks.find(({ type }) => type === "start")).toEqual(
    first.chunks.find(({ type }) => type === "start"),
  );

  // Idle: nothing to reattach to.
  expect(
    await transport.reconnectToStream({ chatId: String(root.id) }),
  ).toBeNull();

  // Observed: a client that keeps the partial assistant message it held and
  // continues it with the reattached stream, as the AI SDK continues a last
  // assistant message, gets every replayed part again, the tool part included.
  const continued = await reduce(second.chunks, heldAtReconnect);
  expect(continued?.parts.map(({ type }) => type)).toEqual([
    "step-start",
    `tool-${browserToolName}`,
    "step-start",
    `tool-${browserToolName}`,
    "step-start",
    "text",
  ]);
});

test("stop while a browser call is pending ends the stream with an abort", async () => {
  const { root, app, transport } = await openChat();
  const stream = recorder(await send(transport, root));
  await stream.until(({ type }) => type === "tool-input-available");

  const stopped = await app.request(
    `http://durable.test/conversations/${root.id}/abort`,
    {
      method: "POST",
    },
  );
  expect(stopped.status).toBe(204);
  await stream.drain();

  expect(chunkTypes(stream.chunks)).toEqual([
    "start",
    "start-step",
    "tool-input-available",
    "finish-step",
    "tool-output-error",
    "abort",
  ]);
  expect(stream.chunks.at(-1)).toEqual({
    type: "abort",
    reason: "The chat turn aborted.",
  });
  // The aborted call's result entry carries the model-facing diagnostics block, not a UI error text.
  expect(
    stream.chunks.find(({ type }) => type === "tool-output-error"),
  ).toEqual({
    type: "tool-output-error",
    toolCallId,
    errorText: "<harness>\n[error] Tool setNetTitle was aborted\n</harness>",
    providerExecuted: true,
  });
  const message = await reduce(stream.chunks);
  expect(
    message?.parts.find((part) => part.type === `tool-${browserToolName}`),
  ).toMatchObject({
    toolCallId,
    state: "output-error",
  });
});
