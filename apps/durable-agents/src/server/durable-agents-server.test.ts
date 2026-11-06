import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, MemoryStorage } from "@earendil-works/pi-durable";
import {
  type ChatTransport,
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach, expect, test } from "vitest";

import { fauxAssistantMessage, fauxToolCall } from "../../test/scripted-model";
import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { createDurableAgentsServer } from "./durable-agents-server";

import type { OwnedStorage } from "./conversation-storage";

const context = BACKGROUND_CONTEXT;
const origin = "http://durable.test";
const chatId = "chat-1";
const toolCallId = "call-1";
const title = "Laundry line";
const browserOutput = { ok: true, title };
const answer = "I set the net's title to Laundry line, as you asked.";

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** Every conversation in memory: one process, which always owns what it opened. */
const memoryStorage = async (): Promise<OwnedStorage> =>
  Object.assign(new MemoryStorage(), { isOwner: async () => true });

/**
 * A server whose model calls `setNetTitle`, then answers, streamed slowly
 * enough to show partials, and AI SDK's own client, calling it in-process.
 */
const openChat = () => {
  const faux = fauxProvider({
    tokensPerSecond: 300,
    tokenSize: { min: 3, max: 5 },
  });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(browserToolName, { title }, { id: toolCallId }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(answer),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const server = createDurableAgentsServer({
    openStorage: memoryStorage,
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      return registry;
    },
    models,
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { progress: { partialIntervalMs: 5, outputIntervalMs: 5 } },
    clientToolNames: new Set([browserToolName]),
    context,
  });
  servers.push(server);
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${origin}/chat`,
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input : String(input),
        init,
      ),
  });
  return { server, transport, faux };
};

const userMessage: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Call the net Laundry line." }],
};

const send = (transport: ChatTransport<UIMessage>) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId,
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
const actAsBrowser = async (server: ReturnType<typeof openChat>["server"]) => {
  for (;;) {
    // The tool task issues the call after the assistant entry commits; Brunch's panel retries its 404 too.
    // eslint-disable-next-line no-await-in-loop
    const { harness, root } = await server.conversations.acquire(chatId);
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

/** The message AI SDK's own reducer builds from `chunks`, continuing `from` when given. */
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

const startMessageId = (chunks: readonly UIMessageChunk[]) => {
  const start = chunks.find(({ type }) => type === "start");
  return start?.type === "start" ? start.messageId : undefined;
};

const expectFlueTurn = async (chunks: readonly UIMessageChunk[]) => {
  expect(chunkTypes(chunks)).toEqual(flueTurnChunkTypes);
  expect(startMessageId(chunks)).toMatch(/^durable:\d+$/);
  expect(Object.keys(chunks[0] ?? {}).toSorted()).toEqual([
    "messageId",
    "type",
  ]);
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
  expect(message?.id).toBe(startMessageId(chunks));
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

test("the server speaks AI SDK's UI message stream protocol", async () => {
  const { server } = openChat();
  const response = await server.app.request(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages: [userMessage],
      trigger: "submit-message",
    }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  const reader = response.body!.getReader();
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toMatch(
    /^data: \{"type":"start","messageId":"durable:\d+"\}\n\n/,
  );
  await reader.cancel();

  const regenerate = await server.app.request(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages: [userMessage],
      trigger: "regenerate-message",
      messageId: "assistant-1",
    }),
  });
  expect(regenerate.status).toBe(400);
});

test("a browser-tool turn yields Flue's chunks and parts", async () => {
  const { server, transport } = openChat();
  const stream = recorder(await send(transport));

  // The panel's `onToolCall` fires on this chunk.
  await stream.until(({ type }) => type === "tool-input-available");
  expect(await actAsBrowser(server)).toBe("settled");
  await stream.drain();

  const deltas = await expectFlueTurn(stream.chunks);
  // Streamed from `pi.live.generation`, not only the committed answer.
  expect(deltas.length).toBeGreaterThan(1);
});

test("a reconnect mid-call starts from the committed view and completes the turn", async () => {
  const { server, transport } = openChat();
  const first = recorder(await send(transport));
  await first.until(({ type }) => type === "tool-input-available");
  const heldAtReconnect = await reduce(first.chunks);

  const reattached = await transport.reconnectToStream({ chatId });
  expect(reattached).not.toBeNull();
  const second = recorder(reattached!);
  await second.until(({ type }) => type === "tool-input-available");
  // The committed view alone shows the pending call.
  expect(chunkTypes(second.chunks)).toEqual([
    "start",
    "start-step",
    "tool-input-available",
  ]);

  await actAsBrowser(server);
  await Promise.all([first.drain(), second.drain()]);

  // Same message, same parts, none twice.
  await expectFlueTurn(first.chunks);
  await expectFlueTurn(second.chunks);
  expect(startMessageId(second.chunks)).toBe(startMessageId(first.chunks));

  // Idle: nothing to reattach to.
  expect(await transport.reconnectToStream({ chatId })).toBeNull();

  // The reconnect replays the running answer from its start, so a client
  // resumes from history that ends at the running input. One that keeps the
  // partial assistant message it held, which the AI SDK continues, gets every
  // replayed part again.
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
  const { server, transport } = openChat();
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");

  const stopped = await server.app.request(`${origin}/chat/${chatId}/abort`, {
    method: "POST",
  });
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
  // The error text is the entry's diagnostics, not the model-facing block.
  expect(
    stream.chunks.find(({ type }) => type === "tool-output-error"),
  ).toEqual({
    type: "tool-output-error",
    toolCallId,
    errorText: "Tool setNetTitle was aborted",
    providerExecuted: true,
  });
  const message = await reduce(stream.chunks);
  expect(
    message?.parts.find((part) => part.type === `tool-${browserToolName}`),
  ).toMatchObject({ toolCallId, state: "output-error" });
});

test("re-sending a user message follows its first run instead of starting another", async () => {
  const { server, transport, faux } = openChat();
  const first = recorder(await send(transport));
  await first.until(({ type }) => type === "tool-input-available");
  // A retry of the same request while the first is running.
  const again = recorder(await send(transport));

  await actAsBrowser(server);
  await Promise.all([first.drain(), again.drain()]);
  await expectFlueTurn(first.chunks);
  await expectFlueTurn(again.chunks);
  expect(startMessageId(again.chunks)).toBe(startMessageId(first.chunks));

  // And once it has answered: the same answer again, no new run.
  const late = recorder(await send(transport));
  await late.drain();
  await expectFlueTurn(late.chunks);
  expect(startMessageId(late.chunks)).toBe(startMessageId(first.chunks));

  expect(faux.state.callCount).toBe(2);
  const { root } = await server.conversations.acquire(chatId);
  const entries = await root.entries(
    { order: "ascending" },
    100,
    undefined,
    context,
  );
  expect(
    entries.items.filter((entry) => entry.model?.[0]?.role === "user"),
  ).toHaveLength(1);
});
