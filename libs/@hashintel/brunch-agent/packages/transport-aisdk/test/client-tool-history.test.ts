import { describe, expect, test } from "vitest";

import { brunchSignals } from "@hashintel/brunch-agent/constants";

import {
  clientToolHistoryFrom,
  type ClientToolHistoryMessage,
} from "../src/index";

describe("clientToolHistoryFrom", () => {
  test("projects an in-band Flue browser outcome without synthesizing a client-result signal", () => {
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
        signal: { tagName: brunchSignals.clientToolResult },
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
        signal: { tagName: brunchSignals.clientToolResult },
        parts: [{ type: "text", state: "done", text: "not-json" }],
      },
      {
        signal: { tagName: brunchSignals.clientToolResult },
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
