import { describe, expect, test } from "vitest";

import { composeAnswers, coversTurn } from "./answers";

import type { OfferedQuestion, OfferedQuestions } from "./kinds";

const quarantine: OfferedQuestion = {
  kind: "choose",
  label: "Quarantined shipment",
  options: ["Stays counted as open", "Drops out until released"],
};
const demand: OfferedQuestion = { kind: "confirm", label: "Production demand" };
const reorderPoints: OfferedQuestion = {
  kind: "values",
  label: "Reorder points",
  fields: [
    { label: "Lower", unit: "units" },
    { label: "Higher", unit: "units" },
  ],
};
/** Case 10 of the P0 set: two related closed questions. */
const batch: OfferedQuestions = {
  questions: [
    {
      kind: "choose",
      label: "Batch start",
      options: ["Starts when both are available", "Must be rescheduled"],
    },
    { kind: "confirm", label: "Delay clock" },
  ],
};
/** Case 9 of the P0 set: the opening battery, with a card only for appetite. */
const opening: OfferedQuestions = {
  questions: [
    { kind: "open", label: "Summer peak case" },
    { kind: "open", label: "Model boundary" },
    { kind: "open", label: "What else judges it" },
    {
      kind: "choose",
      label: "Time to spend",
      options: ["Quick", "Standard", "Thorough", "Deep"],
    },
  ],
};

describe("one question's answer reads on its own as the person's message", () => {
  test.each([
    [
      quarantine,
      { type: "option", option: "Drops out until released" },
      "Drops out until released",
    ],
    [
      quarantine,
      { type: "own-words", text: "  It depends on the supplier.  " },
      "It depends on the supplier.",
    ],
    [demand, { type: "option", option: "Yes" }, "Yes"],
    [
      demand,
      { type: "own-words", text: " Excluding Site 2000. " },
      "Not quite — Excluding Site 2000.",
    ],
    [
      reorderPoints,
      { type: "values", values: ["1200", " 1800 "] },
      "Lower: 1200 units; Higher: 1800 units",
    ],
    [
      reorderPoints,
      { type: "values", values: ["", "1800"] },
      "Higher: 1800 units",
    ],
    [reorderPoints, { type: "unknown" }, "I don't know."],
  ] satisfies [
    OfferedQuestion,
    Parameters<typeof composeAnswers>[1][number],
    string,
  ][])("%o, %o", (question, answer, text) => {
    expect(composeAnswers({ questions: [question] }, [answer])).toBe(text);
  });

  test.each([
    ["blank own words", quarantine, { type: "own-words", text: "  " }],
    ["no values", reorderPoints, { type: "values", values: ["", " "] }],
    ["no answer", quarantine, undefined],
  ] satisfies [
    string,
    OfferedQuestion,
    Parameters<typeof composeAnswers>[1][number],
  ][])("%s is not an answer", (_name, question, answer) => {
    expect(composeAnswers({ questions: [question] }, [answer])).toBeUndefined();
  });
});

describe("several questions", () => {
  test("a card covers the turn only when no question is open", () => {
    expect(coversTurn(batch)).toBe(true);
    expect(coversTurn({ questions: [quarantine] })).toBe(true);
    expect(coversTurn(opening)).toBe(false);
  });

  test("answers a covered turn one line per question", () => {
    expect(
      composeAnswers(batch, [
        { type: "option", option: "Must be rescheduled" },
        { type: "own-words", text: "From the rescheduled start." },
      ]),
    ).toBe(
      "1. Batch start: Must be rescheduled\n2. Delay clock: Not quite — From the rescheduled start.",
    );
  });

  test("names the unanswered questions at the end", () => {
    expect(
      composeAnswers(batch, [undefined, { type: "option", option: "Yes" }]),
    ).toBe("2. Delay clock: Yes\n\nNot answered yet: Batch start.");
  });

  test("drafts a line for every question when the turn isn't covered", () => {
    expect(
      composeAnswers(opening, [
        undefined,
        undefined,
        undefined,
        { type: "option", option: "Quick" },
      ]),
    ).toBe(
      "1. Summer peak case:\n2. Model boundary:\n3. What else judges it:\n4. Time to spend: Quick",
    );
  });

  test("answers nothing until something is answered", () => {
    expect(composeAnswers(batch, [])).toBeUndefined();
    expect(composeAnswers(opening, [])).toBeUndefined();
  });
});
