import { describe, expect, it } from "vitest";

import { noteFor, resolveSlideModule } from "./slide-module";

const Component = () => null;

describe("resolveSlideModule", () => {
  it("reads named exports beside a default component", () => {
    const slide = resolveSlideModule(
      { id: "overview", kind: "mdx" },
      { default: Component, title: "Overview", notes: "Say this", steps: 2 },
    );
    expect(slide).toMatchObject({
      id: "overview",
      title: "Overview",
      notes: { default: "Say this" },
      declaredSteps: 2,
      Content: Component,
    });
  });

  it("reads static properties off the only exported component", () => {
    const TitleSlide = Object.assign(() => null, {
      id: "title",
      title: "A sample deck",
      notes: { default: "Settle", byStep: { 2: "The claim" } },
    });
    const slide = resolveSlideModule(
      { id: "from-file", kind: "tsx" },
      { TitleSlide, CONSTANT: 3 },
    );
    expect(slide).toMatchObject({
      id: "title",
      title: "A sample deck",
      declaredSteps: null,
    });
  });

  it("refuses a module with two components and no default", () => {
    expect(() =>
      resolveSlideModule(
        { id: "x", kind: "tsx" },
        { One: Component, Two: Component },
      ),
    ).toThrow(/one slide component/u);
  });

  it("titles a slide from its id when nothing names it", () => {
    expect(
      resolveSlideModule(
        { id: "rate-to-coin", kind: "tsx" },
        { default: Component },
      ).title,
    ).toBe("Rate to coin");
  });
});

describe("notes", () => {
  it("falls back to the default note on a step without one", () => {
    expect(noteFor({ default: "base", byStep: { 1: "one" } }, 2)).toBe("base");
    expect(noteFor({ default: "base", byStep: { 1: "one" } }, 1)).toBe("one");
  });
});
