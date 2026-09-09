import { describe, expect, test } from "vitest";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  clientToolHistoryFrom,
  type ClientToolHistoryMessage,
} from "../src/index";

describe("clientToolHistoryFrom", () => {
  test("projects generic calls and correlated client result envelopes", () => {
    const messages: readonly ClientToolHistoryMessage[] = [
      {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addArc",
            toolCallId: "call-1",
            state: "input-available",
            input: { placeId: "place-1" },
          },
        ],
      },
      {
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        parts: [
          {
            type: "text",
            state: "done",
            text: JSON.stringify([
              {
                toolName: "addArc",
                toolCallId: "call-1",
                output: { applied: true },
              },
            ]),
          },
        ],
      },
    ];
    expect(clientToolHistoryFrom(messages)).toEqual({
      calls: [
        {
          input: { placeId: "place-1" },
          toolCallId: "call-1",
          toolName: "addArc",
        },
      ],
      results: [
        {
          output: { applied: true },
          toolCallId: "call-1",
          toolName: "addArc",
        },
      ],
    });
  });

  test("ignores non-object call inputs and malformed result bodies", () => {
    const messages: readonly ClientToolHistoryMessage[] = [
      {
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addArc",
            toolCallId: "call-1",
            state: "input-available",
            input: "not-an-object",
          },
        ],
      },
      {
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        parts: [{ type: "text", state: "done", text: "not-json" }],
      },
      {
        signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        parts: [
          {
            type: "text",
            state: "done",
            text: JSON.stringify([{ toolCallId: "call-1" }]),
          },
        ],
      },
    ];
    expect(clientToolHistoryFrom(messages)).toEqual({
      calls: [],
      results: [],
    });
  });
});
