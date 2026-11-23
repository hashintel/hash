import { describe, expect, it } from "vitest";

import { withLabelWrapPoints } from "./label-wrap-points";

const ZERO_WIDTH_SPACE = "\u200B";

const segments = (label: string): string[] =>
  withLabelWrapPoints(label).split(ZERO_WIDTH_SPACE);

describe("withLabelWrapPoints", () => {
  it.each([
    ["HelloWorld", ["Hello", "World"]],
    ["QAQueue", ["QA", "Queue"]],
    ["XMLHttpRequest", ["XML", "Http", "Request"]],
    ["IOError", ["IO", "Error"]],
    ["Space42", ["Space", "42"]],
    ["Hello", ["Hello"]],
    [
      "Unload the tanker (SteadyNitrogen)",
      ["Unload the tanker (Steady", "Nitrogen)"],
    ],
  ])("breaks %s between its words, acronyms and digit runs", (label, parts) => {
    expect(segments(label)).toEqual(parts);
  });

  it("leaves a label written as a sentence alone", () => {
    for (const label of [
      "A motorway load is offered",
      "Unload the tanker (SteadyNitrogen)",
      "idle tankers",
    ]) {
      expect(withLabelWrapPoints(label).replace(/\u200B/gu, "")).toBe(label);
    }
  });

  it("returns an empty string unchanged", () => {
    expect(withLabelWrapPoints("")).toBe("");
  });
});
