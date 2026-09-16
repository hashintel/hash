/** Synthetic HTTP responses; OpenAI request serialization and SSE parsing remain native. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import type { AssistantMessage, Provider } from "@earendil-works/pi-ai";
import type { convertResponsesTools } from "@earendil-works/pi-ai/api/openai-responses-shared";

export type NativeOpenaiResponseFactory = (input: {
  readonly signal: AbortSignal | undefined;
}) => Response | Promise<Response>;

type NativeOpenaiToolStallAttempt = {
  readonly cancelled: Promise<void>;
  readonly toolCallId: string;
};

type NativeOpenaiToolStallEvent = {
  readonly kind: "cancelled" | "started";
  readonly toolCallId: string;
};

export const createNativeOpenaiToolStall = (
  toolName: string,
): {
  readonly attempts: () => readonly NativeOpenaiToolStallAttempt[];
  readonly cancelled: Promise<void>;
  readonly chronology: () => readonly NativeOpenaiToolStallEvent[];
  readonly reached: Promise<NativeOpenaiToolStallAttempt>;
  readonly response: NativeOpenaiResponseFactory;
} => {
  const attempts: NativeOpenaiToolStallAttempt[] = [];
  const chronology: NativeOpenaiToolStallEvent[] = [];
  const cancelled = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<NativeOpenaiToolStallAttempt>();

  return {
    attempts: () => attempts,
    cancelled: cancelled.promise,
    chronology: () => chronology,
    reached: reached.promise,
    response: ({ signal }) => {
      const attemptCancelled = Promise.withResolvers<void>();
      const suffix = randomUUID();
      const reasoningId = `rs_${suffix}`;
      const itemId = `fc_${suffix}`;
      const callId = `call_${suffix}`;
      const attempt = {
        cancelled: attemptCancelled.promise,
        toolCallId: `${callId}|${itemId}`,
      };
      attempts.push(attempt);
      chronology.push({ kind: "started", toolCallId: attempt.toolCallId });
      reached.resolve(attempt);
      let removeAbortListener = () => {};
      let stopped = false;
      const settleCancellation = () => {
        if (stopped) return;
        stopped = true;
        chronology.push({ kind: "cancelled", toolCallId: attempt.toolCallId });
        attemptCancelled.resolve();
        cancelled.resolve();
      };

      return new Response(
        new ReadableStream({
          cancel() {
            removeAbortListener();
            settleCancellation();
          },
          start(controller) {
            const send = (frame: { type: string; [key: string]: unknown }) =>
              controller.enqueue(
                new TextEncoder().encode(
                  `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
                ),
              );
            send({
              type: "response.output_item.added",
              output_index: 0,
              item: {
                type: "reasoning",
                id: reasoningId,
                status: "in_progress",
                summary: [],
              },
            });
            send({
              type: "response.reasoning_summary_text.delta",
              output_index: 0,
              item_id: reasoningId,
              delta: "Considering the ledger update.",
            });
            send({
              type: "response.output_item.done",
              output_index: 0,
              item: {
                type: "reasoning",
                id: reasoningId,
                status: "completed",
                summary: [
                  {
                    type: "summary_text",
                    text: "Considering the ledger update.",
                  },
                ],
              },
            });
            send({
              type: "response.output_item.added",
              output_index: 1,
              item: {
                type: "function_call",
                id: itemId,
                call_id: callId,
                name: toolName,
                arguments: "",
                status: "in_progress",
              },
            });
            send({
              type: "response.function_call_arguments.delta",
              output_index: 1,
              item_id: itemId,
              delta: "{",
            });

            const abort = () => {
              removeAbortListener();
              settleCancellation();
              controller.error(
                signal?.reason ??
                  new DOMException(
                    "Synthetic response cancelled.",
                    "AbortError",
                  ),
              );
            };
            if (signal?.aborted) {
              abort();
            } else if (signal !== undefined) {
              signal.addEventListener("abort", abort, { once: true });
              removeAbortListener = () =>
                signal.removeEventListener("abort", abort);
            }
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  };
};

const syntheticResponse = (
  message: AssistantMessage,
  beforeFinish: () => Promise<void>,
) => {
  const responseId = randomUUID();
  const frames: { type: string; [key: string]: unknown }[] = [];
  for (const [index, part] of message.content.entries()) {
    assert(part.type === "text" || part.type === "toolCall");
    const [callId, itemId] = part.type === "toolCall" ? part.id.split("|") : [];
    const item =
      part.type === "text"
        ? {
            type: "message",
            id: `msg_${responseId}_${index}`,
            role: "assistant",
            content: [],
          }
        : {
            type: "function_call",
            id: itemId,
            call_id: callId,
            name: part.name,
            arguments: "",
          };
    if (part.type === "toolCall") assert(callId && itemId);
    frames.push(
      { type: "response.output_item.added", output_index: index, item },
      part.type === "text"
        ? {
            type: "response.output_text.delta",
            output_index: index,
            content_index: 0,
            item_id: item.id,
            delta: part.text,
          }
        : {
            type: "response.function_call_arguments.delta",
            output_index: index,
            item_id: item.id,
            delta: JSON.stringify(part.arguments),
          },
      {
        type: "response.output_item.done",
        output_index: index,
        item: {
          ...item,
          status: "completed",
          ...(part.type === "text"
            ? {
                content: [
                  { type: "output_text", text: part.text, annotations: [] },
                ],
              }
            : { arguments: JSON.stringify(part.arguments) }),
        },
      },
    );
  }
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (frame: (typeof frames)[number]) =>
          controller.enqueue(
            new TextEncoder().encode(
              `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
            ),
          );
        try {
          for (const frame of frames) send(frame);
          await beforeFinish();
          send({
            type: "response.completed",
            response: {
              id: `resp_${responseId}`,
              status: "completed",
              output: [],
              usage: { input_tokens: 1, output_tokens: 4, total_tokens: 5 },
            },
          });
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

export const nativeOpenaiProvider = (
  responses: Provider,
  requests: Record<string, unknown>[],
  beforeFinish: () => Promise<void>,
  responseFactory?: NativeOpenaiResponseFactory,
): Provider => {
  const native: Provider = openaiProvider();
  const streamSimple: Provider["streamSimple"] = (model, context, options) => {
    assert(!options?.onPayload, "No payload replacement in this oracle");
    let payload: unknown;
    return native.streamSimple(model, context, {
      ...options,
      apiKey: "synthetic-not-a-credential",
      maxRetries: 0,
      onPayload(body) {
        payload = JSON.parse(JSON.stringify(body));
      },
      async fetch(request, init) {
        try {
          assert(typeof init?.body === "string");
          const serialized = JSON.parse(init.body) as Record<string, unknown>;
          assert.deepEqual(serialized, payload);
          assert.equal(serialized.model, "gpt-5.6-sol");
          assert.partialDeepStrictEqual(serialized.reasoning, {
            effort: "low",
          });
          const tools = serialized.tools as ReturnType<
            typeof convertResponsesTools
          >;
          assert.equal(tools.length, context.tools?.length);
          for (const tool of context.tools ?? []) {
            const sent = tools.find(
              (entry) => entry.type === "function" && entry.name === tool.name,
            );
            assert(
              sent?.type === "function",
              `Missing mounted tool ${tool.name}`,
            );
            assert.deepEqual(sent.parameters, tool.parameters);
            assert.equal(sent.description, tool.description);
            assert.equal(sent.strict, false, "This path uses non-strict tools");
          }
          requests.push(serialized);
          if (responseFactory !== undefined) {
            return responseFactory({
              signal:
                (request instanceof Request ? request.signal : init.signal) ??
                undefined,
            });
          }
          return syntheticResponse(
            await responses.streamSimple(model, context, options).result(),
            beforeFinish,
          );
        } catch (error) {
          // The SDK wraps fetch exceptions as connection failures; retain the failing assertion.
          process.stderr.write(
            `Synthetic OpenAI request failed: ${String(error)}\n`,
          );
          throw error;
        }
      },
    });
  };
  return {
    ...native,
    auth: responses.auth,
    streamSimple,
    stream() {
      throw new Error(
        "Unexpected stream entrypoint; no native network fallback",
      );
    },
  };
};
