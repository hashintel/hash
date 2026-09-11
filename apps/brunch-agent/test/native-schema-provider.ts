/** Test-only Anthropic SDK responses. Native preparation/serialization and parsing remain real. */
import assert from "node:assert/strict";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

import type {
  AssistantMessage,
  Context,
  Provider,
} from "@earendil-works/pi-ai";

export type NativeRequestCapture = {
  method: "stream" | "streamSimple";
  payload: unknown;
  serialized: {
    tools: { name: string; input_schema: unknown; strict?: boolean }[];
    messages: unknown;
  };
};

const syntheticResponse = (message: AssistantMessage) => {
  const frames: { type: string; [key: string]: unknown }[] = [
    {
      type: "message_start",
      message: {
        id: "synthetic-native",
        type: "message",
        role: "assistant",
        model: message.model,
        content: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
  ];
  for (const [index, part] of message.content.entries()) {
    assert(
      part.type === "text" || part.type === "toolCall",
      "Only scripted text/tool responses are allowed",
    );
    frames.push(
      {
        type: "content_block_start",
        index,
        content_block:
          part.type === "text"
            ? { type: "text", text: "" }
            : { type: "tool_use", id: part.id, name: part.name, input: {} },
      },
      {
        type: "content_block_delta",
        index,
        delta:
          part.type === "text"
            ? { type: "text_delta", text: part.text }
            : {
                type: "input_json_delta",
                partial_json: JSON.stringify(part.arguments),
              },
      },
      { type: "content_block_stop", index },
    );
  }
  frames.push(
    {
      type: "message_delta",
      delta: {
        stop_reason: message.content.some((part) => part.type === "toolCall")
          ? "tool_use"
          : "end_turn",
      },
      usage: { output_tokens: 4 },
    },
    { type: "message_stop" },
  );
  return new Response(
    frames
      .map(
        (frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
};

/** Faux messages supply only in-memory SDK responses, never replacement request payloads. */
export const nativeSchemaProvider = (
  responses: Provider,
  captures: NativeRequestCapture[],
  contexts: Context[],
  entrypoint: "stream" | "streamSimple" = "streamSimple",
): Provider => {
  const native: Provider = anthropicProvider();
  const supply =
    (method: "stream" | "streamSimple"): Provider["streamSimple"] =>
    (model, context, options) => {
      contexts.push(context);
      let payload: unknown;
      assert(
        !options?.onPayload,
        "This oracle does not allow payload replacement",
      );
      return native[method](model, context, {
        ...options,
        apiKey: "synthetic-not-a-credential",
        maxRetries: 0,
        onPayload(body) {
          payload = structuredClone(body);
        },
        async fetch(_request, requestOptions) {
          assert(requestOptions && typeof requestOptions.body === "string");
          const serialized = JSON.parse(
            requestOptions.body,
          ) as NativeRequestCapture["serialized"];
          assert.deepEqual(serialized, payload);
          for (const tool of context.tools ?? []) {
            const sent = serialized.tools.find(
              (entry) => entry.name === tool.name,
            );
            assert(sent, `Missing tool ${tool.name}`);
            assert.deepEqual(sent.input_schema, tool.parameters);
            assert.equal(
              sent.strict,
              undefined,
              "Strict generation is not authorized",
            );
          }
          captures.push({ method, payload, serialized });
          return syntheticResponse(
            await responses.streamSimple(model, context, options).result(),
          );
        },
      });
    };
  return {
    ...native,
    auth: responses.auth,
    stream: supply("stream"),
    streamSimple: supply(entrypoint),
  };
};
