import "../../shared/testing-utilities/mock-get-flow-context.js";

import { expect, test } from "vitest";

import { createAnthropicMessagesWithTools } from "./get-llm-response/anthropic-client.js";

test.skip(
  "Test rate limit with amazon bedrock",
  async () => {
    let count = 0;
    const smallOpusRequest = () => {
      // eslint-disable-next-line no-console
      console.log(`Sending request number ${count}`);

      count++;

      return createAnthropicMessagesWithTools({
        payload: {
          model: "claude-opus-4-6",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Say hello!",
                },
              ],
            },
          ],
          max_tokens: 100,
        },
        provider: "amazon-bedrock",
      });
    };

    try {
      await Promise.all(Array.from({ length: 60 }, smallOpusRequest));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ error }, null, 2));

      expect(error).toBeDefined();
    }
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
