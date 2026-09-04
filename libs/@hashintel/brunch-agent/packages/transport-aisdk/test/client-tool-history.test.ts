import { describe, expect, test } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL, clientToolHistoryFrom } from "../src/index";

describe("clientToolHistoryFrom", () => {
  test("projects generic calls and correlated client result envelopes", () => {
    expect(
      clientToolHistoryFrom([
        {
          parts: [
            {
              type: "dynamic-tool",
              toolName: "addArc",
              toolCallId: "call-1",
              input: { placeId: "place-1" },
            },
          ],
        },
        {
          signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
          parts: [
            {
              type: "text",
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
      ]),
    ).toEqual({
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

  test("ignores malformed calls and result bodies", () => {
    expect(
      clientToolHistoryFrom([
        { parts: [{ type: "dynamic-tool", toolName: "addArc" }] },
        {
          signal: { type: CLIENT_TOOL_RESULT_SIGNAL },
          parts: [{ type: "text", text: "not-json" }],
        },
      ]),
    ).toEqual({ calls: [], results: [] });
  });
});
