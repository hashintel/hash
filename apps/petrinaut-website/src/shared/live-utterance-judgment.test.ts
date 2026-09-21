import { expect, test } from "vitest";

import { isUtteranceJudgment } from "./live-utterance-judgment";

test.each([
  null,
  { contribution: "unknown", confidence: 0.9 },
  { contribution: "control", confidence: -0.01 },
  { contribution: "control", confidence: 1.01 },
  { contribution: "control", confidence: Number.NaN },
  { contribution: "control", confidence: "0.9" },
])("rejects unusable judgment %j", (value) => {
  expect(isUtteranceJudgment(value)).toBe(false);
});

test.each([0, 0.8, 1])("accepts confidence %s", (confidence) => {
  expect(isUtteranceJudgment({ contribution: "control", confidence })).toBe(
    true,
  );
});
