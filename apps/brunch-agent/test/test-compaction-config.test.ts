import { describe, expect, test } from "vitest";

import { loadTestCompactionConfig } from "../src/agents/chat-agent/test-compaction-config.ts";

describe("local compaction configuration", () => {
  test.each([undefined, "development", "test", "production"])(
    "leaves defaults unchanged when unset in %s",
    (nodeEnv) => {
      expect(loadTestCompactionConfig({ NODE_ENV: nodeEnv })).toBeUndefined();
    },
  );

  test.each([undefined, "development", "test"])(
    "accepts a bounded integer in %s",
    (nodeEnv) => {
      expect(
        loadTestCompactionConfig({
          NODE_ENV: nodeEnv,
          BRUNCH_TEST_KEEP_RECENT_TOKENS: "256",
        }),
      ).toEqual({ keepRecentTokens: 256 });
    },
  );

  test("accepts zero and trims surrounding whitespace", () => {
    expect(
      loadTestCompactionConfig({ BRUNCH_TEST_KEEP_RECENT_TOKENS: " 0\n" }),
    ).toEqual({ keepRecentTokens: 0 });
  });

  test.each([
    "",
    " ",
    "-1",
    "+256",
    "1.5",
    "1e3",
    "NaN",
    "Infinity",
    "0x100",
    "9007199254740992",
  ])("rejects malformed or unsafe values: %j", (value) => {
    expect(() =>
      loadTestCompactionConfig({
        NODE_ENV: "test",
        BRUNCH_TEST_KEEP_RECENT_TOKENS: value,
      }),
    ).toThrow(/non-negative safe integer/u);
  });

  test.each(["production", "staging", ""])(
    "rejects the setting in non-local mode %j",
    (nodeEnv) => {
      expect(() =>
        loadTestCompactionConfig({
          NODE_ENV: nodeEnv,
          BRUNCH_TEST_KEEP_RECENT_TOKENS: "256",
        }),
      ).toThrow(/only allowed in local development or tests/u);
    },
  );
});
