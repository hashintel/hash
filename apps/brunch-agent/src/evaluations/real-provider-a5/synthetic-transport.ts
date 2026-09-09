import assert from "node:assert/strict";

import { endpoint, maxOutputTokens, modelId } from "./preflight.ts";

/** Explicit dry mode only. Real mode never imports this module. Native SDK parses
 * these synthetic bytes; the browser must produce its own actual read result. */
export const syntheticTransport = () => {
  let count = 0;
  return (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(
      input instanceof Request ? input.url : input.toString(),
      endpoint,
    );
    assert(init && typeof init.body === "string");
    const payload = JSON.parse(init.body) as {
      model: string;
      max_tokens: number;
    };
    assert.equal(payload.model, modelId);
    assert.equal(payload.max_tokens, maxOutputTokens);
    count++;
    const read = count === 3;
    const settle = count === 2;
    const call = read || settle;
    const frames = [
      {
        type: "message_start",
        message: {
          id: `msg_TEST_${count}`,
          type: "message",
          role: "assistant",
          model: modelId,
          content: [],
          usage: { input_tokens: 100, output_tokens: 1 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: call
          ? {
              type: "tool_use",
              id: read ? "TEST-real-browser-read" : "TEST-dry-revision",
              name: read ? "getLatestNetDefinition" : "update_workpiece",
              input: {},
            }
          : { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: call
          ? {
              type: "input_json_delta",
              partial_json: read
                ? "{}"
                : JSON.stringify({
                    markdown:
                      "# TEST synthetic dry workpiece\nNo elicited evidence or constructed arc. This only enables a real browser read.",
                  }),
            }
          : {
              type: "text_delta",
              text: "TEST synthetic transport dry control only. No construction or explanation claimed.",
            },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: call ? "tool_use" : "end_turn" },
        usage: { output_tokens: 20 },
      },
      { type: "message_stop" },
    ];
    return new Response(
      frames
        .map(
          (frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
        )
        .join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
};
