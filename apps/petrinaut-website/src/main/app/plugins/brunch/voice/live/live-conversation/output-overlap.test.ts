import { expect, test } from "vitest";

import { createOutputOverlap } from "./output-overlap";

const audibleBetween = (
  overlap: ReturnType<typeof createOutputOverlap>,
  from: number,
  to: number,
) => {
  for (let at = from; at <= to; at += 100) overlap.sample(at, true);
};

test("returns Live's words from three seconds before the speech until it stopped", () => {
  const overlap = createOutputOverlap();
  overlap.liveOutput(1_000, "Too early. ");
  overlap.liveOutput(2_500, "How many ");
  audibleBetween(overlap, 5_000, 6_000);
  overlap.speechStarted("one", 5_500);
  overlap.liveOutput(5_600, "staff?");
  overlap.speechStopped("one", 6_200);
  overlap.liveOutput(6_300, " Too late.");

  expect(overlap.finalize("one", 7_000)).toBe("How many staff?");
});

test("speech overlaps audible output, or the one-second tail after it", () => {
  const overlap = createOutputOverlap();
  audibleBetween(overlap, 1_000, 2_000);
  overlap.speechStarted("tail", 2_900);
  overlap.speechStopped("tail", 3_200);
  overlap.speechStarted("after", 3_100);
  overlap.speechStopped("after", 3_400);

  expect(overlap.finalize("tail", 4_000)).toBe("");
  expect(overlap.finalize("after", 4_000)).toBeUndefined();
});

test("speech that stopped before output began did not overlap it", () => {
  const overlap = createOutputOverlap();
  overlap.speechStarted("before", 1_000);
  overlap.speechStopped("before", 1_900);
  overlap.speechStarted("into", 1_500);
  overlap.speechStopped("into", 2_100);
  audibleBetween(overlap, 2_000, 3_000);

  expect(overlap.finalize("before", 4_000)).toBeUndefined();
  expect(overlap.finalize("into", 4_000)).toBe("");
});

test("speech without a reported stop runs until it is finalized", () => {
  const overlap = createOutputOverlap();
  overlap.speechStarted("one", 1_000);
  audibleBetween(overlap, 1_500, 1_800);

  expect(overlap.finalize("one", 2_000)).toBe("");
});

test("inaudible samples never open output, and each speech finalizes once", () => {
  const overlap = createOutputOverlap();
  overlap.sample(1_000, false);
  overlap.speechStarted("one", 1_000);
  overlap.speechStopped("one", 1_200);

  expect(overlap.finalize("one", 2_000)).toBeUndefined();
  audibleBetween(overlap, 2_000, 2_200);
  overlap.speechStarted("two", 2_100);
  expect(overlap.finalize("two", 2_300)).toBe("");
  expect(overlap.finalize("two", 2_400)).toBeUndefined();
  expect(overlap.finalize("unknown", 2_400)).toBeUndefined();
});

test("ignores event fields of the wrong type", () => {
  const overlap = createOutputOverlap();
  audibleBetween(overlap, 1_000, 1_200);
  overlap.speechStarted(7, 1_100);
  overlap.speechStopped(null, 1_150);
  overlap.liveOutput(1_100, { text: "Okay" });

  expect(overlap.finalize("7", 1_300)).toBeUndefined();
});

test("clear forgets output, Live's words and speech in progress", () => {
  const overlap = createOutputOverlap();
  audibleBetween(overlap, 1_000, 1_200);
  overlap.liveOutput(1_100, "Okay");
  overlap.speechStarted("one", 1_100);
  overlap.clear();
  overlap.speechStarted("two", 1_200);

  expect(overlap.finalize("one", 1_300)).toBeUndefined();
  expect(overlap.finalize("two", 1_300)).toBeUndefined();
});
