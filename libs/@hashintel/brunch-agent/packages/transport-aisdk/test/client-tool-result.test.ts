import { expect, test, vi } from "vitest";

import {
  type ClientToolResultParseIssue,
  parseClientToolResults,
} from "../src";

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

test("remains callable without a reporter", () => {
  expect(parseClientToolResults("not json")).toEqual([]);
});
