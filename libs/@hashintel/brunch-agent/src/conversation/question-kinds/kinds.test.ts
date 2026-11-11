import { describe, expect, test } from "vitest";

import {
  mergeOffers,
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

  test("are one set of questions, in the order first offered", () => {
    expect(
      mergeOffers([
        { questions: [p0.narrative, p0.appetite] },
        { questions: [p0.confirmation] },
      ]),
    ).toEqual({ questions: [p0.narrative, p0.appetite, p0.confirmation] });
  });

  test("a question offered again keeps its first place and takes its latest content", () => {
    expect(
      mergeOffers([
        { questions: [p0.readingOfTheirWords, p0.values] },
        { questions: [p0.confirmation, reworded] },
      ]),
    ).toEqual({ questions: [reworded, p0.values, p0.confirmation] });
  });

  test("a closed question asked again as an open one no longer offers answers", () => {
    const merged = mergeOffers([
      { questions: [p0.confirmation] },
      { questions: [{ kind: "open", label: p0.confirmation.label }] },
    ]);
    expect(offersAnswers(merged)).toBe(false);
  });

  test("no offers are no questions", () => {
    expect(mergeOffers([])).toEqual({ questions: [] });
  });
});
