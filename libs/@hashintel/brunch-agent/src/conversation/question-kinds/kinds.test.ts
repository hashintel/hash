import { describe, expect, test } from "vitest";

import {
  latestOffers,
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

  test("never offers on the user's purpose, or on open or narrative questions", () => {
    expect(neverOffer).toEqual([
      expect.stringContaining("the user's purpose"),
      expect.stringContaining("open or narrative"),
    ]);
  });
});

describe("several offers in one turn", () => {
  const reworded = {
    ...p0.readingOfTheirWords,
    label: "quarantined shipment ",
    options: ["Counted as open", "Out until released", "Counted as reserved"],
  } satisfies OfferedQuestion;

  test("a question offered again keeps only its latest offer", () => {
    expect(
      latestOffers([
        { questions: [p0.readingOfTheirWords, p0.values] },
        { questions: [reworded] },
      ]),
    ).toEqual([{ questions: [p0.values] }, { questions: [reworded] }]);
  });

  test("offers on different questions each stand", () => {
    const offers = [
      { questions: [p0.readingOfTheirWords] },
      { questions: [p0.confirmation] },
    ];
    expect(latestOffers(offers)).toEqual(offers);
  });

  test("withdraws an earlier offer left with nothing to answer", () => {
    expect(
      latestOffers([
        { questions: [p0.readingOfTheirWords, p0.narrative] },
        { questions: [reworded, p0.narrative] },
      ]),
    ).toEqual([undefined, { questions: [reworded, p0.narrative] }]);
  });
});
