import { describe, expect, test } from "vitest";

import { composeAnswers, pickedOption, pickOption } from "./answers";

import type { OfferedOption, OfferedQuestion } from "./kinds";

const staysOpen = {
  label: "Stays open",
  value: "It stays counted as an open order",
};
const dropsOut = {
  label: "Drops out",
  value: "It drops out until quality releases it",
};
const options: OfferedOption[] = [staysOpen, dropsOut];
const quarantine = {
  kind: "choose",
  label: "Quarantined shipment",
  text: "Quarantined shipment?",
  options,
} satisfies OfferedQuestion;
const demand = {
  kind: "confirm",
  label: "Production demand",
  text: "Production demand?",
} satisfies OfferedQuestion;
const recentOrder = {
  kind: "open",
  label: "Recent order",
  text: "Recent order?",
} satisfies OfferedQuestion;

describe("picking an option into an answer", () => {
  test("an empty answer becomes the option's text", () => {
    expect(pickOption("", options, staysOpen)).toBe(staysOpen.value);
    expect(pickOption("", [{ label: "Yes" }], { label: "Yes" })).toBe("Yes");
  });

  test("another pick takes the place of the first", () => {
    expect(pickOption(staysOpen.value, options, dropsOut)).toBe(dropsOut.value);
  });

  test("what the person typed stays, beneath the option", () => {
    const typed = "Only for imported lots.";
    const picked = pickOption(typed, options, staysOpen);
    expect(picked).toBe(`${staysOpen.value}\n${typed}`);
    expect(pickOption(picked, options, dropsOut)).toBe(
      `${dropsOut.value}\n${typed}`,
    );
  });

  test("an answer picks the option its first line states", () => {
    expect(pickedOption(staysOpen.value, options)).toBe(staysOpen);
    expect(pickedOption(`${dropsOut.value}\nMostly.`, options)).toBe(dropsOut);
    expect(pickedOption("Neither, really.", options)).toBeUndefined();
    expect(pickedOption("", options)).toBeUndefined();
  });
});

describe("the message the answers become", () => {
  test("nothing answered is nothing to send", () => {
    expect(composeAnswers({ questions: [quarantine] }, [])).toBeUndefined();
    expect(
      composeAnswers({ questions: [quarantine, demand] }, ["  ", undefined]),
    ).toBeUndefined();
  });

  test("one question's answer is sent as it stands", () => {
    expect(composeAnswers({ questions: [quarantine] }, [dropsOut.value])).toBe(
      dropsOut.value,
    );
  });

  test("several answers are numbered and named, so the text reads on its own", () => {
    expect(
      composeAnswers({ questions: [quarantine, demand, recentOrder] }, [
        staysOpen.value,
        "Yes",
        " The last one took nine days. ",
      ]),
    ).toBe(
      [
        "1. Quarantined shipment: It stays counted as an open order",
        "2. Production demand: Yes",
        "3. Recent order: The last one took nine days.",
      ].join("\n"),
    );
  });

  test("a question left unanswered is named, and the rest keep their numbers", () => {
    expect(
      composeAnswers({ questions: [quarantine, demand, recentOrder] }, [
        "",
        "Yes",
      ]),
    ).toBe(
      "2. Production demand: Yes\n\nNot answered yet: Quarantined shipment, Recent order.",
    );
  });
});
