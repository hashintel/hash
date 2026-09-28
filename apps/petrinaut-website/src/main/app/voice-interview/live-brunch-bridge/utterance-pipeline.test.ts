import { afterEach, expect, test, vi } from "vitest";

import { routeUtterance } from "./utterance-pipeline";

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
    routeUtterance(input, [{ name: "probe", mode: "on", skip: () => null }]),
  ).toBeNull();
});

test("the first stage that is on and skips decides; later stages never run", () => {
  const later = vi.fn(() => "empty" as const);
  expect(
    routeUtterance(input, [
      { name: "quiet", mode: "on", skip: () => null },
      { name: "decides", mode: "on", skip: () => "short-during-output" },
      { name: "later", mode: "on", skip: later },
    ]),
  ).toBe("short-during-output");
  expect(later).not.toHaveBeenCalled();
});

test("a shadow stage traces what it would skip without deciding", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(input, [
      { name: "trial", mode: "shadow", skip: () => "empty" },
      { name: "decides", mode: "on", skip: () => "short-during-output" },
    ]),
  ).toBe("short-during-output");
  const records = traceRecords(debug.mock.calls);
  expect(records).toMatchObject([
    { event: "filter.shadow", inputId: "one", stage: "trial", reason: "empty" },
  ]);
  expect(Object.keys(records[0] ?? {}).sort()).toEqual([
    "at",
    "event",
    "inputId",
    "reason",
    "stage",
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
});

test("a shadow stage that would not skip leaves no trace", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  expect(
    routeUtterance(input, [
      { name: "trial", mode: "shadow", skip: () => null },
    ]),
  ).toBeNull();
  expect(debug).not.toHaveBeenCalled();
});

test("a stage that is off never runs", () => {
  const off = vi.fn(() => "empty" as const);
  expect(
    routeUtterance(input, [{ name: "off", mode: "off", skip: off }]),
  ).toBeNull();
  expect(off).not.toHaveBeenCalled();
});

test.each([
  ["I'll send it", true, 3],
  ["Five.", undefined, 1],
  [" ?! ", false, 0],
])(
  "stages see %j with its word count, counting contractions as one word",
  (text, startedDuringOutput, words) => {
    const skip = vi.fn(() => null);
    routeUtterance({ id: "one", text, startedDuringOutput }, [
      { name: "probe", mode: "on", skip },
    ]);
    expect(skip).toHaveBeenCalledWith({
      inputId: "one",
      text,
      words,
      startedDuringOutput: startedDuringOutput ?? false,
    });
  },
);
