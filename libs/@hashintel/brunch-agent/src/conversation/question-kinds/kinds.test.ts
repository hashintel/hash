import { describe, expect, test } from "vitest";

import {
  mergeOffers,
  type OfferedQuestion,
  optionsFor,
  optionText,
  spokenQuestion,
} from "./kinds";

/** Questions from the P0 contrast set, as the reply that asked them offers them. */
const p0 = {
  readingOfTheirWords: {
    kind: "choose",
    label: "Quarantined shipment",
    text: "Quarantined shipment?",
    options: [
      { label: "Stays open", value: "It stays counted as an open order" },
      { label: "Drops out", value: "It drops out until quality releases it" },
    ],
  },
  confirmation: {
    kind: "confirm",
    label: "Production demand",
    text: "Production demand?",
  },
  values: {
    kind: "values",
    label: "Reorder points",
    text: "Reorder points?",
    fields: [
      { label: "Lower", unit: "units" },
      { label: "Higher", unit: "units" },
    ],
  },
  narrative: {
    kind: "open",
    label: "Recent Flowbind order",
    text: "Recent Flowbind order?",
  },
  purpose: {
    kind: "open",
    label: "Decision to compare",
    text: "Decision to compare?",
  },
  appetite: {
    kind: "choose",
    label: "Time to spend",
    text: "Time to spend?",
    options: ["Quick", "Standard", "Thorough", "Deep"].map((label) => ({
      label,
    })),
  },
} satisfies Record<string, OfferedQuestion>;

describe("the answers each kind offers as buttons", () => {
  test.each([
    [
      "a reading of the person's words",
      p0.readingOfTheirWords,
      ["Stays open", "Drops out"],
    ],
    ["a confirmation", p0.confirmation, ["Yes"]],
    ["values", p0.values, []],
    ["a narrative", p0.narrative, []],
  ] satisfies [string, OfferedQuestion, string[]][])(
    "%s",
    (_name, question, labels) => {
      expect(optionsFor(question).map(({ label }) => label)).toEqual(labels);
    },
  );

  test("a click answers with the option's value, or its label when that is the answer", () => {
    expect(p0.readingOfTheirWords.options.map(optionText)).toEqual([
      "It stays counted as an open order",
      "It drops out until quality releases it",
    ]);
    expect(optionsFor(p0.confirmation).map(optionText)).toEqual(["Yes"]);
  });
});

describe("a question said aloud", () => {
  test("a choice names each alternative in full after the question", () => {
    expect(spokenQuestion(p0.readingOfTheirWords)).toBe(
      "Quarantined shipment? It stays counted as an open order; It drops out until quality releases it.",
    );
  });

  test("any other question is its wording", () => {
    expect(spokenQuestion(p0.narrative)).toBe(p0.narrative.text);
    expect(spokenQuestion(p0.confirmation)).toBe(p0.confirmation.text);
  });
});

describe("several offers in one turn", () => {
  const reworded = {
    ...p0.readingOfTheirWords,
    label: "quarantined shipment ",
    options: [
      { label: "Counted as open" },
      { label: "Out until released" },
      { label: "Counted as reserved" },
    ],
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

  test("no offers are no questions", () => {
    expect(mergeOffers([])).toEqual({ questions: [] });
  });
});
