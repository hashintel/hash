import { expect, test, vi } from "vitest";

import { createAnthropicMessagesWithTools } from "./anthropic-client.js";
import { getAnthropicResponse } from "./get-anthropic-response.js";

import type { AnthropicMessagesCreateResponse } from "./anthropic-client.js";

vi.mock("./anthropic-client.js", () => ({
  createAnthropicMessagesWithTools: vi.fn(),
}));

test("sends `maxTokens` to Anthropic only as `max_tokens`", async () => {
  /* Stopping at the token limit returns before the response is parsed. */
  vi.mocked(createAnthropicMessagesWithTools).mockResolvedValue({
    stop_reason: "max_tokens",
    usage: { input_tokens: 1, output_tokens: 1 },
  } as AnthropicMessagesCreateResponse);

  await getAnthropicResponse(
    { model: "claude-sonnet-4-6", maxTokens: 2_000, messages: [] },
    { requestId: "request" },
  );

  const payload = vi.mocked(createAnthropicMessagesWithTools).mock.calls[0]?.[0]
    .payload;

  expect(payload?.max_tokens).toBe(2_000);
  expect(payload).not.toHaveProperty("maxTokens");
});
