import { afterEach, expect, test, vi } from "vitest";

import {
  doubtfulBelowLogprob,
  liveUtteranceStages,
  routeUtterance,
} from "./utterance-pipeline";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const traceRecords = (calls: readonly (readonly unknown[])[]) =>
  calls.map(
    ([line]) =>
      JSON.parse(String(line).replace("[Petrinaut Live trace] ", "")) as Record<
        string,
        unknown
      >,
  );

const input = { id: "one", text: "PRIVATE okay", startedDuringOutput: true };

test("sends when no stage skips", () => {
  expect(
    routeUtterance(input, [
      { reason: "empty", mode: "on", skips: () => false },
    ]),
  ).toBeNull();
});

test("the first stage that is on and skips decides; later stages never run", () => {
  const later = vi.fn(() => true);
  expect(
    routeUtterance(input, [
      { reason: "echo", mode: "on", skips: () => false },
      { reason: "short-during-output", mode: "on", skips: () => true },
      { reason: "empty", mode: "on", skips: later },
    ]),
  ).toBe("short-during-output");
  expect(later).not.toHaveBeenCalled();
});

test("a shadow stage traces what it would skip without deciding", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(input, [
      { reason: "empty", mode: "shadow", skips: () => true },
      { reason: "short-during-output", mode: "on", skips: () => true },
    ]),
  ).toBe("short-during-output");
  const records = traceRecords(debug.mock.calls);
  expect(records).toMatchObject([
    { event: "filter.shadow", inputId: "one", reason: "empty" },
  ]);
  expect(Object.keys(records[0] ?? {}).sort()).toEqual([
    "at",
    "event",
    "inputId",
    "reason",
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
});

test("a shadow stage that would not skip leaves no trace", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(input, [
      { reason: "empty", mode: "shadow", skips: () => false },
    ]),
  ).toBeNull();
  expect(debug).not.toHaveBeenCalled();
});

test("a stage that is off never runs", () => {
  const off = vi.fn(() => true);
  expect(
    routeUtterance(input, [{ reason: "empty", mode: "off", skips: off }]),
  ).toBeNull();
  expect(off).not.toHaveBeenCalled();
});

test("stages see Live's words when the speech overlapped its output", () => {
  const skips = vi.fn(() => false);
  routeUtterance(
    {
      id: "one",
      text: "Okay",
      startedDuringOutput: true,
      liveOutputText: "Okay?",
    },
    [{ reason: "empty", mode: "on", skips }],
  );
  expect(skips).toHaveBeenCalledWith({
    inputId: "one",
    text: "Okay",
    words: 1,
    startedDuringOutput: true,
    liveOutputText: "Okay?",
  });
});

test.each([
  ["I'll send it", true, 3],
  ["Five.", false, 1],
  [" ?! ", false, 0],
])(
  "stages see %j with its word count, counting contractions as one word",
  (text, startedDuringOutput, words) => {
    const skips = vi.fn(() => false);
    routeUtterance({ id: "one", text, startedDuringOutput }, [
      { reason: "empty", mode: "on", skips },
    ]);
    expect(skips).toHaveBeenCalledWith({
      inputId: "one",
      text,
      words,
      startedDuringOutput,
    });
  },
);

test("stages see the transcript's lowest token log probability", () => {
  const skips = vi.fn(() => false);
  routeUtterance(
    { id: "one", text: "Okay", startedDuringOutput: false, minLogprob: -2.5 },
    [{ reason: "empty", mode: "on", skips }],
  );
  expect(skips).toHaveBeenCalledWith({
    inputId: "one",
    text: "Okay",
    words: 1,
    startedDuringOutput: false,
    minLogprob: -2.5,
  });
});

const doubtfulShadows = (calls: readonly (readonly unknown[])[]) =>
  traceRecords(calls).filter(
    (record) =>
      record.event === "filter.shadow" &&
      record.reason === "doubtful-short-during-output",
  );

test.each([
  [
    `a least likely token below ${doubtfulBelowLogprob} is doubtful`,
    { minLogprob: -2 },
    true,
  ],
  [
    "a least likely token of -1.9004 is doubtful",
    { minLogprob: -1.9004 },
    true,
  ],
  ["a least likely token of -1.9 is not doubtful", { minLogprob: -1.9 }, false],
  [
    "a repeat of Live's words is doubtful",
    { minLogprob: -0.1, liveOutputText: "Okay, seven." },
    true,
  ],
  ["confident new words is not doubtful", { minLogprob: -1.1 }, false],
  ["no confidence is not doubtful", {}, false],
])("short speech during output with %s", (_case, extra, doubtful) => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(
      { id: "one", text: "Okay.", startedDuringOutput: true, ...extra },
      liveUtteranceStages,
    ),
  ).toBe("short-during-output");
  expect(doubtfulShadows(debug.mock.calls)).toHaveLength(doubtful ? 1 : 0);
});

test.each([
  [
    "four words during output",
    { text: "Seven reviewers, not four.", startedDuringOutput: true },
  ],
  [
    "short speech while Live was quiet",
    { text: "Okay.", startedDuringOutput: false },
  ],
])("%s is never doubtful short speech", (_case, utterance) => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(
      { id: "one", minLogprob: -3, ...utterance },
      liveUtteranceStages,
    ),
  ).toBeNull();
  expect(doubtfulShadows(debug.mock.calls)).toHaveLength(0);
});
