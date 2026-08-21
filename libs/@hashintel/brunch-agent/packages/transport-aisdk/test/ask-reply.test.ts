/**
 * FE-1449 wire contracts: the ask suspension leaves the server as an awaiting
 * client tool, and the return POST resumes the conversation only when it
 * carries the pending ask's correlated human submission.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createAiSdkChatHandler,
  type AskReplyHandler,
  type HarnessAskReplyInput,
  type HarnessReplyEvent,
  type TransportInspectionEvent,
} from "../src/index";

type StreamChunk = Record<string, unknown> & { readonly type: string };

const FIXTURES = join(import.meta.dirname, "fixtures");

const responseChunks = async (
  response: Response,
): Promise<readonly StreamChunk[]> =>
  (await response.text())
    .trim()
    .split("\n\n")
    .slice(0, -1)
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as StreamChunk);

const post = (body: unknown): Request =>
  new Request("http://brunch.test/api/petrinaut/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "request-fe1449",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** The suspended ask turn as the harness emits it: call, minted affordance, settle. */
const askSuspensionEvents: readonly HarnessReplyEvent[] = [
  { type: "response-start", messageId: "assistant-fe1449-1" },
  { type: "turn-start", turnId: "turn-fe1449-1" },
  {
    type: "tool-input",
    toolCallId: "tool-ask-fe1449",
    toolName: "brunch_ask",
    input: { question: "What outcome should this process reliably produce?" },
    execution: "server",
  },
  {
    type: "tool-output",
    toolCallId: "tool-ask-fe1449",
    output: {
      id: "affordance_tool-ask-fe1449",
      form: "free-text",
      markdown: "What outcome should this process reliably produce?",
      payload: {
        question: "What outcome should this process reliably produce?",
      },
    },
    execution: "server",
  },
  { type: "turn-finish", turnId: "turn-fe1449-1" },
  { type: "response-finish", terminalState: "completed", finishReason: "stop" },
];

const askReturnPost = {
  id: "conversation-fe1449",
  trigger: "submit-message",
  messageId: "assistant-fe1449-1",
  messages: [
    {
      id: "user-fe1449-1",
      role: "user",
      parts: [{ type: "text", text: "Help me model checkout." }],
    },
    {
      id: "assistant-fe1449-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "dynamic-tool",
          toolName: "brunch_ask",
          toolCallId: "tool-ask-fe1449",
          state: "output-available",
          input: {
            question: "What outcome should this process reliably produce?",
          },
          output: { answer: "A confirmed order with payment settled." },
        },
      ],
    },
  ],
};

const admitAll: AskReplyHandler["admit"] = async () => ({ ok: true });

const resumedTurn: AskReplyHandler["run"] = async (_input, emit) => {
  emit({ type: "response-start", messageId: "assistant-fe1449-2" });
  emit({ type: "turn-start", turnId: "turn-fe1449-2" });
  emit({ type: "part-start", kind: "text", partId: "text-fe1449-2" });
  emit({
    type: "part-delta",
    kind: "text",
    partId: "text-fe1449-2",
    delta: "Payment settled — who initiates the checkout?",
  });
  emit({ type: "part-end", kind: "text", partId: "text-fe1449-2" });
  emit({ type: "turn-finish", turnId: "turn-fe1449-2" });
  emit({
    type: "response-finish",
    terminalState: "completed",
    finishReason: "stop",
  });
};

describe("FE-1449 ask suspension on the wire", () => {
  test("translates the ask as an awaiting client tool and withholds the affordance output", async () => {
    const inspections: TransportInspectionEvent[] = [];
    const handler = createAiSdkChatHandler({
      inspect: (event) => inspections.push(event),
      async runTurn(_input, emit) {
        for (const event of askSuspensionEvents) emit(event);
      },
    });

    const response = await handler(
      post({
        id: "conversation-fe1449",
        trigger: "submit-message",
        messages: [
          {
            id: "user-fe1449-1",
            role: "user",
            parts: [{ type: "text", text: "Help me model checkout." }],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    const chunks = await responseChunks(response);
    expect(
      chunks.find((chunk) => chunk.type === "tool-input-available"),
    ).toEqual({
      type: "tool-input-available",
      toolCallId: "tool-ask-fe1449",
      toolName: "brunch_ask",
      input: { question: "What outcome should this process reliably produce?" },
    });
    expect(chunks.some((chunk) => chunk.type === "tool-output-available")).toBe(
      false,
    );
    expect(chunks.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "stop",
    });
    expect(inspections).toContainEqual({
      type: "ask-await",
      requestId: "request-fe1449",
      toolCallId: "tool-ask-fe1449",
    });
  });
});

describe("FE-1449 ask return POST", () => {
  test("resumes the conversation with the correlated submission only", async () => {
    const admitted: HarnessAskReplyInput[] = [];
    const inspections: TransportInspectionEvent[] = [];
    const handler = createAiSdkChatHandler({
      inspect: (event) => inspections.push(event),
      async runTurn() {
        throw new Error("the initial-turn path must not run for a follow-up");
      },
      askReply: {
        async admit(input) {
          admitted.push(input);
          return { ok: true };
        },
        run: resumedTurn,
      },
    });

    const response = await handler(post(askReturnPost));

    expect(response.status).toBe(200);
    expect(admitted).toEqual([
      {
        conversationId: "conversation-fe1449",
        idempotencyKey: "conversation-fe1449:ask:tool-ask-fe1449",
        ask: {
          toolCallId: "tool-ask-fe1449",
          answer: "A confirmed order with payment settled.",
        },
      },
    ]);
    const chunks = await responseChunks(response);
    expect(chunks.find((chunk) => chunk.type === "text-delta")).toMatchObject({
      delta: "Payment settled — who initiates the checkout?",
    });
    expect(chunks.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "stop",
    });
    expect(inspections[0]).toEqual({
      type: "ask-reply-admitted",
      requestId: "request-fe1449",
      conversationId: "conversation-fe1449",
      toolCallId: "tool-ask-fe1449",
    });
    expect(inspections.at(-1)).toMatchObject({
      type: "request-finish",
      terminalState: "completed",
    });
  });

  test("refuses stale, duplicate, and forged submissions before any dispatch", async () => {
    for (const [reason, error] of [
      ["no-pending-ask", "ask_not_pending"],
      ["different-ask-pending", "ask_mismatch"],
    ] as const) {
      let resumed = false;
      const inspections: TransportInspectionEvent[] = [];
      const handler = createAiSdkChatHandler({
        inspect: (event) => inspections.push(event),
        async runTurn() {},
        askReply: {
          async admit() {
            return { ok: false, reason };
          },
          async run() {
            resumed = true;
          },
        },
      });

      const response = await handler(post(askReturnPost));

      expect({
        reason,
        status: response.status,
        body: await response.json(),
      }).toEqual({
        reason,
        status: 409,
        body: { error },
      });
      expect(resumed).toBe(false);
      expect(inspections).toEqual([
        {
          type: "ask-reply-refused",
          requestId: "request-fe1449",
          conversationId: "conversation-fe1449",
          toolCallId: "tool-ask-fe1449",
          reason,
        },
      ]);
    }
  });

  test("keeps refusing machine-only follow-ups: mutation outputs and diagnostics stay non-user", async () => {
    let resumed = false;
    const handler = createAiSdkChatHandler({
      async runTurn() {},
      askReply: {
        admit: admitAll,
        async run() {
          resumed = true;
        },
      },
    });

    const response = await handler(
      post(
        readFileSync(join(FIXTURES, "panel-tool-results.post.json"), "utf8"),
      ),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "tool_result_follow_up_not_supported",
    });
    expect(resumed).toBe(false);
  });

  test("refuses a malformed or ambiguous ask submission as invalid", async () => {
    const askPart = askReturnPost.messages[1]!.parts[1]!;
    const withParts = (parts: readonly unknown[]): unknown => ({
      ...askReturnPost,
      messages: [
        askReturnPost.messages[0],
        {
          ...askReturnPost.messages[1],
          parts: [{ type: "step-start" }, ...parts],
        },
      ],
    });

    for (const body of [
      withParts([{ ...askPart, output: { answer: "" } }]),
      withParts([{ ...askPart, output: "not-an-object" }]),
      withParts([{ ...askPart, toolCallId: "" }]),
      withParts([askPart, { ...askPart, toolCallId: "tool-ask-second" }]),
    ]) {
      let resumed = false;
      const handler = createAiSdkChatHandler({
        async runTurn() {},
        askReply: {
          admit: admitAll,
          async run() {
            resumed = true;
          },
        },
      });

      const response = await handler(post(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_ask_submission",
      });
      expect(resumed).toBe(false);
    }
  });

  test("refuses every follow-up when no ask-reply seam is configured", async () => {
    const handler = createAiSdkChatHandler({ async runTurn() {} });

    const response = await handler(post(askReturnPost));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "tool_result_follow_up_not_supported",
    });
  });
});
