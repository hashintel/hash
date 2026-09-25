import { expect, test } from "vitest";

import {
  prepareVoiceBrief,
  serializeVoiceBrief,
  validateVoiceWrapUp,
} from "./voice-mediation";

test("keeps absent modelling details open and uses only verbatim evidence", () => {
  const transcript =
    "We handle support tickets. Arrivals vary through the day.";
  const brief = prepareVoiceBrief(transcript, {
    kind: "modelling",
    goal: "support tickets",
    arrivals: "Arrivals vary through the day",
    handling: "5 minutes",
    queue: null,
  });
  expect(brief).toEqual({
    goal: "support tickets",
    arrivals: "Arrivals vary through the day",
    handling: "Still open",
    queue: "Still open",
    stillOpen: "handling, queue",
  });
  expect(serializeVoiceBrief(brief)).not.toContain("5 minutes");
  expect(serializeVoiceBrief(brief)).not.toContain(transcript);
});

test("preserves decision ranges and negation without inventing a run budget", () => {
  expect(
    prepareVoiceBrief("Compare 2–8 agents. Measure waiting time, not cost.", {
      kind: "decision",
      decide: "Compare 2–8 agents",
      measure: "waiting time, not cost",
      constraints: null,
      runs: null,
      ask: null,
    }),
  ).toEqual({
    decide: "Compare 2–8 agents",
    measure: "waiting time, not cost",
    constraints: "Still open",
    runs: "Still open",
    ask: "Still open",
  });
});

test("wrap-ups allow two sentences but reject a third and oversized speech", () => {
  expect(
    validateVoiceWrapUp(
      "Brunch drafted the comparison. Select Run to start it.",
    ),
  ).toBe("Brunch drafted the comparison. Select Run to start it.");
  expect(() => validateVoiceWrapUp("Drafted. Not run. Select Run.")).toThrow();
  expect(() => validateVoiceWrapUp("x".repeat(601))).toThrow();
  expect(() => validateVoiceWrapUp("")).toThrow();
});
