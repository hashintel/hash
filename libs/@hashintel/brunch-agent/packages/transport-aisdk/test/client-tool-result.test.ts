import { expect, test, vi } from "vitest";

import {
  CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH,
  clientToolResultSignal,
  type ClientToolResultParseIssue,
  parseClientToolResultPayload,
  parseClientToolResults,
} from "../src/client-tool-result";

const SENTINEL = "SENTINEL-body-content";

test("parses well-formed results without reporting", () => {
  const onIssue = vi.fn<(issue: ClientToolResultParseIssue) => void>();
  const results = parseClientToolResults(
    JSON.stringify([
      { toolCallId: "a", toolName: "readPetrinautDoc", output: 1 },
    ]),
    onIssue,
  );
  expect(results).toHaveLength(1);
  expect(onIssue).not.toHaveBeenCalled();
});

test("drops malformed bodies and members as before, reporting classification and counts only", () => {
  const onIssue = vi.fn<(issue: ClientToolResultParseIssue) => void>();

  expect(parseClientToolResults(`{${SENTINEL}`, onIssue)).toEqual([]);
  expect(
    parseClientToolResults(JSON.stringify({ body: SENTINEL }), onIssue),
  ).toEqual([]);
  expect(
    parseClientToolResults(
      JSON.stringify([
        { toolCallId: "a", toolName: "readPetrinautDoc", output: SENTINEL },
        { toolName: "missing-id", output: SENTINEL },
        SENTINEL,
      ]),
      onIssue,
    ),
  ).toHaveLength(1);

  expect(onIssue.mock.calls.map(([issue]) => issue)).toEqual([
    { kind: "invalid-json" },
    { kind: "not-array" },
    { kind: "dropped-members", dropped: 2, total: 3 },
  ]);
  expect(JSON.stringify(onIssue.mock.calls)).not.toContain(SENTINEL);
});

test("parses bounded context without changing canonical results", () => {
  const results = [
    { toolCallId: "a", toolName: "readPetrinautDoc", output: { revision: 1 } },
  ];
  const context = "Petrinaut diagnostics context only; no errors.";
  const delivery = clientToolResultSignal(results, context);

  expect(JSON.parse(delivery.body)).toEqual({ results, context });
  expect(parseClientToolResultPayload(delivery.body)).toEqual({
    results,
    context,
  });
  expect(parseClientToolResults(delivery.body)).toEqual(results);
});

test("refuses malformed or unbounded contextual envelopes", () => {
  const onIssue = vi.fn<(issue: ClientToolResultParseIssue) => void>();

  expect(
    parseClientToolResultPayload(
      JSON.stringify({ results: [], context: "" }),
      onIssue,
    ),
  ).toEqual({ results: [] });
  expect(
    parseClientToolResultPayload(
      JSON.stringify({
        results: [],
        context: "x".repeat(CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH + 1),
      }),
      onIssue,
    ),
  ).toEqual({ results: [] });
  expect(onIssue.mock.calls.map(([issue]) => issue)).toEqual([
    { kind: "invalid-context" },
    { kind: "invalid-context" },
  ]);
  expect(() => clientToolResultSignal([], "")).toThrow(
    "The client-tool result context is invalid or too long.",
  );
});

test("remains callable without a reporter", () => {
  expect(parseClientToolResults("not json")).toEqual([]);
});
