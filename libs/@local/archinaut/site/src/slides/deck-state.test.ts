import { describe, expect, it } from "vitest";

import {
  completeStep,
  goToSlide,
  initialDeckState,
  nextState,
  previousState,
  registerSteps,
  slideChange,
  type DeckSlideRef,
} from "./deck-state";

const slides: DeckSlideRef[] = [
  { id: "title", declaredSteps: 2 },
  { id: "hooked", declaredSteps: null },
  { id: "end", declaredSteps: null },
];

describe("stepping", () => {
  it("advances through declared steps before moving slides", () => {
    const start = initialDeckState(slides);
    const one = nextState(start, slides);
    expect([one.index, one.step]).toEqual([0, 1]);
    const two = nextState(one, slides);
    expect([two.index, two.step]).toEqual([1, 0]);
  });

  it("clamps at both ends", () => {
    const start = initialDeckState(slides);
    expect(previousState(start, slides)).toBe(start);
    const end = goToSlide(start, slides, 2);
    expect(nextState(end, slides)).toBe(end);
  });

  it("lands on a declared slide's last step going back", () => {
    const onHooked = goToSlide(initialDeckState(slides), slides, 1);
    const back = previousState(onHooked, slides);
    expect([back.index, back.step, back.landOnLastStep]).toEqual([0, 1, false]);
  });
});

describe("registered steps", () => {
  it("lands on the last step once a slide reached backwards registers", () => {
    const onEnd = goToSlide(initialDeckState(slides), slides, 2);
    const back = previousState(onEnd, slides);
    expect([back.index, back.step, back.landOnLastStep]).toEqual([1, 0, true]);
    const registered = registerSteps(back, slides, "hooked", 4);
    expect([registered.step, registered.landOnLastStep]).toEqual([3, false]);
  });

  it("clamps the step to a smaller count and ignores other slides' reports", () => {
    const state = {
      ...goToSlide(initialDeckState(slides), slides, 1),
      step: 5,
    };
    expect(registerSteps(state, slides, "hooked", 3).step).toBe(2);
    expect(registerSteps(state, slides, "end", 3).step).toBe(5);
  });

  it("returns the same state when nothing new is learned", () => {
    const state = registerSteps(
      goToSlide(initialDeckState(slides), slides, 1),
      slides,
      "hooked",
      3,
    );
    expect(registerSteps(state, slides, "hooked", 3)).toBe(state);
  });
});

describe("completeStep", () => {
  it("advances only from the step that completed, on the slide that completed it", () => {
    const state = registerSteps(
      goToSlide(initialDeckState(slides), slides, 1),
      slides,
      "hooked",
      3,
    );
    expect(completeStep(state, slides, "hooked", 0).step).toBe(1);
    expect(completeStep(state, slides, "hooked", 1)).toBe(state);
    expect(completeStep(state, slides, "title", 0)).toBe(state);
  });
});

describe("slideChange", () => {
  it("names the direction of a slide change and ignores a step change", () => {
    const start = initialDeckState(slides);
    expect(slideChange(start, goToSlide(start, slides, 2))).toBe("forward");
    const end = goToSlide(start, slides, 2);
    expect(slideChange(end, previousState(end, slides))).toBe("backward");
    expect(slideChange(start, nextState(start, slides))).toBeNull();
  });
});
