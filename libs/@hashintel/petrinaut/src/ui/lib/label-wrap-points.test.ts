import { describe, expect, it } from "vitest";

import { withLabelWrapPoints } from "./label-wrap-points";

const ZERO_WIDTH_SPACE = "\u200B";

const segments = (label: string): string[] =>
  withLabelWrapPoints(label).split(ZERO_WIDTH_SPACE);

describe("withLabelWrapPoints", () => {
  it("breaks a PascalCase name between its words", () => {
    expect(segments("HelloWorld")).toEqual(["Hello", "World"]);
  });

  it("keeps an acronym together", () => {
    expect(segments("QAQueue")).toEqual(["QA", "Queue"]);
    expect(segments("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
    expect(segments("IOError")).toEqual(["IO", "Error"]);
  });

  it("breaks before a run of digits", () => {
    expect(segments("Space42")).toEqual(["Space", "42"]);
  });

  it("leaves a single word alone", () => {
    expect(segments("Hello")).toEqual(["Hello"]);
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

  it("still breaks the PascalCase parts of a sentence", () => {
    expect(segments("Unload the tanker (SteadyNitrogen)")).toEqual([
      "Unload the tanker (Steady",
      "Nitrogen)",
    ]);
  });

  it("returns an empty string unchanged", () => {
    expect(withLabelWrapPoints("")).toBe("");
  });
});
