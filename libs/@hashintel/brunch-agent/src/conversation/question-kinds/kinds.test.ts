import { describe, expect, test } from "vitest";

import {
  neverOffer,
  type OfferedQuestion,
  offersAnswers,
  optionsFor,
  questionKinds,
} from "./kinds";

/** Questions from the P0 contrast set, as the reply that asked them offers them. */
const p0 = {
  readingOfTheirWords: {
    kind: "choose",
    label: "Quarantined shipment",
    options: ["Stays counted as open", "Drops out until released"],
  },
  confirmation: { kind: "confirm", label: "Production demand" },
  values: {
    kind: "values",
    label: "Reorder points",
    fields: [
      { label: "Lower", unit: "units" },
      { label: "Higher", unit: "units" },
    ],
  },
  narrative: { kind: "open", label: "Recent Flowbind order" },
  purpose: { kind: "open", label: "Decision to compare" },
  appetite: {
    kind: "choose",
    label: "Time to spend",
    options: ["Quick", "Standard", "Thorough", "Deep"],
  },
} satisfies Record<string, OfferedQuestion>;

describe("each kind's affordance and own-words path", () => {
  test.each([
    [
      "a reading of the person's words",
      p0.readingOfTheirWords,
      ["Stays counted as open", "Drops out until released"],
      { path: "field", label: "Something else…" },
    ],
    [
      "a confirmation",
      p0.confirmation,
      ["Yes"],
      { path: "field", label: "Not quite…" },
    ],
    ["values", p0.values, [], { path: "unknown", label: "I don't know" }],
    ["a narrative", p0.narrative, [], { path: "composer" }],
  ] satisfies [string, OfferedQuestion, string[], object][])(
    "%s",
    (_name, question, options, ownWords) => {
      expect(optionsFor(question)).toEqual(options);
      expect(questionKinds[question.kind].ownWords).toMatchObject(ownWords);
    },
  );
});

describe("what an offer must offer", () => {
  test("a purpose or narrative question alone offers nothing", () => {
    expect(offersAnswers({ questions: [p0.purpose] })).toBe(false);
    expect(offersAnswers({ questions: [p0.narrative] })).toBe(false);
  });

  test("the opening battery offers its appetite question", () => {
    expect(
      offersAnswers({
        questions: [p0.narrative, p0.purpose, p0.narrative, p0.appetite],
      }),
    ).toBe(true);
  });

  test("never offers on purpose, decision, open or narrative questions", () => {
    expect(neverOffer).toEqual([
      expect.stringContaining("wants, decides or is trying to achieve"),
      expect.stringContaining("open or narrative"),
    ]);
  });
});
