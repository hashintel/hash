import { describe, expect, test } from "vitest";

import {
  clientToolHistoryFrom,
  type ClientToolHistoryMessage,
} from "../src/client-tool-history";

describe("clientToolHistoryFrom", () => {
  test("projects an in-band Flue browser outcome with its host metadata", () => {
    const messages: readonly ClientToolHistoryMessage[] = [
      {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "getLatestNetDefinition",
            toolCallId: "issued-read",
            state: "output-available",
            input: {},
            output: {
              brunchBrowserResult: true,
              output: { definition: { places: [] } },
              metadata: { observation: "host" },
            },
          },
        ],
      },
    ];
    expect(clientToolHistoryFrom(messages)).toEqual({
      calls: [
        {
          input: {},
          toolCallId: "issued-read",
          toolName: "getLatestNetDefinition",
        },
      ],
      results: [
        {
          toolCallId: "issued-read",
          toolName: "getLatestNetDefinition",
          output: { definition: { places: [] } },
          metadata: { observation: "host" },
        },
      ],
    });
  });

  test("ignores non-object call inputs and non-browser outputs", () => {
    const messages: readonly ClientToolHistoryMessage[] = [
      {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addArc",
            toolCallId: "call-1",
            state: "output-available",
            input: "not-an-object",
            output: { applied: true },
          },
        ],
      },
    ];
    expect(clientToolHistoryFrom(messages)).toEqual({ calls: [], results: [] });
  });
});
