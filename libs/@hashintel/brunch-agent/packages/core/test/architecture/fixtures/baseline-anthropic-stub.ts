import { appendFile } from "node:fs/promises";

interface StubReply {
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
    create: async (request: unknown) => {
      if (requestsPath) {
        await appendFile(requestsPath, `${JSON.stringify(request)}\n`);
      }
      const reply = replies[requestCount++];
      if (!reply) throw new Error(`unexpected model call ${requestCount}`);
      return {
        model: "test-model",
        content: [{ type: "text" as const, text: reply.text }],
        stop_reason: reply.truncated ? "max_tokens" : "end_turn",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };
    },
  },
};
