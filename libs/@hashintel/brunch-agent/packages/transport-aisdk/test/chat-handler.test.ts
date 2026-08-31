/**
 * Wire contracts for the Flue ↔ AI SDK chat door: principal, initial turns,
 * and correlated client-tool resume.
 */

import { describe, expect, test } from "vitest";

import {
  createAiSdkChatHandler,
  type ChatResumeInput,
  type TransportInspectionEvent,
} from "../src/index";

import type { UIMessageChunk } from "ai";

const responseChunks = async (
  response: Response,
): Promise<readonly UIMessageChunk[]> =>
  (await response.text())
    .trim()
    .split("\n\n")
    .slice(0, -1)
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as UIMessageChunk);

const post = (body: unknown): Request =>
  new Request("http://brunch.test/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-brunch-principal": "principal-mission-1",
      "x-request-id": "request-mission-1",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const initialPost = {
  id: "conversation-mission-1",
  trigger: "submit-message",
  messages: [
    {
      id: "user-mission-1",
      role: "user",
      parts: [{ type: "text", text: "Is the server in the loop?" }],
    },
  ],
};

const clientToolResumePost = {
  id: "conversation-mission-1",
  trigger: "submit-message",
  messageId: "assistant-mission-1",
  messages: [
    {
      id: "user-mission-1",
      role: "user",
      parts: [{ type: "text", text: "How does simulation view work?" }],
    },
    {
      id: "assistant-mission-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-readPetrinautDoc",
          toolCallId: "tool-doc-1",
          state: "output-available",
          input: { doc: "simulate-view" },
          output: "# Simulate view\nRun the net.",
        },
      ],
    },
  ],
};

test("refuses a valid turn without the UI shell principal", async () => {
  let dispatched = false;
  const handler = createAiSdkChatHandler({
    async runTurn() {
      dispatched = true;
    },
  });

  const response = await handler(
    new Request("http://brunch.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(initialPost),
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_principal" });
  expect(dispatched).toBe(false);
});

test("streams application-written chunks for an initial user turn", async () => {
  const inspections: TransportInspectionEvent[] = [];
  const handler = createAiSdkChatHandler({
    inspect: (event) => inspections.push(event),
    async runTurn(input, write) {
      expect(input.userMessage.text).toBe("Is the server in the loop?");
      write({ type: "start", messageId: "assistant-mission-1" });
      write({ type: "text-start", id: "text-1" });
      write({ type: "text-delta", id: "text-1", delta: "pong" });
      write({ type: "text-end", id: "text-1" });
      write({ type: "finish", finishReason: "stop" });
    },
  });

  const response = await handler(post(initialPost));
  expect(response.status).toBe(200);
  const chunks = await responseChunks(response);
  expect(chunks.find((chunk) => chunk.type === "text-delta")).toMatchObject({
    delta: "pong",
  });
  expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  expect(inspections[0]).toMatchObject({ type: "request-start" });
  expect(inspections.at(-1)).toMatchObject({
    type: "request-finish",
    terminal: "completed",
  });
});

describe("client-tool resume", () => {
  test("resumes with correlated client-tool outputs", async () => {
    const resumed: ChatResumeInput[] = [];
    const handler = createAiSdkChatHandler({
      async runTurn() {
        throw new Error("the initial-turn path must not run for a follow-up");
      },
      async resumeTurn(input, write) {
        resumed.push(input);
        write({ type: "start", messageId: "assistant-next" });
        write({ type: "text-start", id: "text-2" });
        write({
          type: "text-delta",
          id: "text-2",
          delta: "Simulate view runs the net.",
        });
        write({ type: "text-end", id: "text-2" });
        write({ type: "finish", finishReason: "stop" });
      },
    });

    const response = await handler(post(clientToolResumePost));
    expect(response.status).toBe(200);
    expect(resumed).toEqual([
      {
        conversationId: "conversation-mission-1",
        assistantMessageId: "assistant-mission-1",
        idempotencyKey: "conversation-mission-1:tools:tool-doc-1",
        principalKey: "principal-mission-1",
        toolResults: [
          {
            toolCallId: "tool-doc-1",
            toolName: "readPetrinautDoc",
            output: "# Simulate view\nRun the net.",
          },
        ],
      },
    ]);
    const chunks = await responseChunks(response);
    expect(chunks[0]).toEqual({
      type: "start",
      messageId: "assistant-mission-1",
    });
  });

  test("refuses every follow-up when no resume seam is configured", async () => {
    const handler = createAiSdkChatHandler({ async runTurn() {} });
    const response = await handler(post(clientToolResumePost));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "tool_result_follow_up_not_supported",
    });
  });

  test("skips provider-executed tool parts when looking for a client resume", async () => {
    let resumed = false;
    const handler = createAiSdkChatHandler({
      async runTurn() {},
      async resumeTurn() {
        resumed = true;
      },
    });
    const response = await handler(
      post({
        ...clientToolResumePost,
        messages: [
          clientToolResumePost.messages[0],
          {
            id: "assistant-mission-1",
            role: "assistant",
            parts: [
              {
                type: "tool-ping",
                toolCallId: "tool-ping-1",
                state: "output-available",
                providerExecuted: true,
                input: {},
                output: { ok: true },
              },
            ],
          },
        ],
      }),
    );
    expect(response.status).toBe(422);
    expect(resumed).toBe(false);
  });
});

test("refuses history without the UI shell principal", async () => {
  const handler = createAiSdkChatHandler({ async runTurn() {} });
  const response = await handler(
    new Request("http://brunch.test/api/chat?id=conversation-mission-1", {
      method: "GET",
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_principal" });
});

test("loads Flue history on GET for the same principal and conversation id", async () => {
  const handler = createAiSdkChatHandler({
    async runTurn() {},
    async loadHistory(input) {
      expect(input).toEqual({
        conversationId: "conversation-mission-1",
        principalKey: "principal-mission-1",
      });
      return { messages: [{ id: "user-1", role: "user", parts: [] }] };
    },
  });

  const response = await handler(
    new Request("http://brunch.test/api/chat?id=conversation-mission-1", {
      method: "GET",
      headers: { "x-brunch-principal": "principal-mission-1" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    messages: [{ id: "user-1", role: "user", parts: [] }],
  });
});
