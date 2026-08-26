import { appendFile } from "node:fs/promises";

import type Anthropic from "@anthropic-ai/sdk";

export interface StubReply {
  text: string;
  truncated?: boolean;
}

const replies = JSON.parse(
  process.env["BASELINE_STUB_REPLIES"] ?? "[]",
) as StubReply[];
const requestsPath = process.env["BASELINE_STUB_REQUESTS_PATH"];
let requestCount = 0;

export default {
  messages: {
    create: async (request: Anthropic.MessageCreateParamsNonStreaming) => {
      if (requestsPath) {
        await appendFile(requestsPath, `${JSON.stringify(request)}\n`);
      }
      const reply = replies[requestCount++];
      if (!reply) throw new Error(`unexpected model call ${requestCount}`);
      return {
        id: `test-message-${requestCount}`,
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [{ type: "text", text: reply.text, citations: null }],
        stop_reason: reply.truncated ? "max_tokens" : "end_turn",
        stop_sequence: null,
        usage: {
          cache_creation: null,
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          inference_geo: null,
          server_tool_use: null,
          service_tier: null,
        },
      } satisfies Anthropic.Message;
    },
  },
};
