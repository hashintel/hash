/**
 * Where a deck is: which slide, which step, and what it has learned about
 * each slide's steps. Plain data and pure transitions; the deck component
 * holds the state and decides which moves animate.
 *
 * A slide's step count is either declared up front (MDX `steps`, a static
 * `steps`) or registered when the slide renders and calls
 * `useSteps(n)`. Going back to a slide whose count is not known yet
 * lands on step 0 with `landOnLastStep` set, and the registration moves it
 * to the last step before the browser paints.
 */

export interface DeckSlideRef {
  id: string;
  declaredSteps: number | null;
}

export interface DeckState {
  index: number;
  step: number;
  /** Slide id → step count, declared or registered. */
  stepCounts: Readonly<Record<string, number>>;
  landOnLastStep: boolean;
}

export type Direction = "forward" | "backward";

const clampIndex = (slides: readonly DeckSlideRef[], index: number): number =>
  Math.min(Math.max(index, 0), Math.max(slides.length - 1, 0));

const idAt = (slides: readonly DeckSlideRef[], index: number): string =>
  slides[index]?.id ?? "";

export const stepsOf = (state: DeckState, slideId: string): number =>
  state.stepCounts[slideId] ?? 1;

export const currentStepCount = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
): number => stepsOf(state, idAt(slides, state.index));

export const initialDeckState = (
  slides: readonly DeckSlideRef[],
  index = 0,
): DeckState => ({
  index: clampIndex(slides, index),
  step: 0,
  stepCounts: Object.fromEntries(
    slides.flatMap((slide) =>
      slide.declaredSteps === null ? [] : [[slide.id, slide.declaredSteps]],
    ),
  ),
  landOnLastStep: false,
});

/** The slide at `index`, at its first step, or its last when `atLastStep`. */
export const goToSlide = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
  index: number,
  atLastStep = false,
): DeckState => {
  const target = clampIndex(slides, index);
  const known = state.stepCounts[idAt(slides, target)];
  return {
    ...state,
    index: target,
    step: atLastStep && known !== undefined ? known - 1 : 0,
    landOnLastStep: atLastStep && known === undefined,
  };
};

export const nextState = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
): DeckState => {
  if (state.step < currentStepCount(state, slides) - 1) {
    return { ...state, step: state.step + 1 };
  }
  return state.index < slides.length - 1
    ? goToSlide(state, slides, state.index + 1)
    : state;
};

export const previousState = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
): DeckState => {
  if (state.step > 0) {
    return { ...state, step: state.step - 1 };
  }
  return state.index > 0
    ? goToSlide(state, slides, state.index - 1, true)
    : state;
};

/** A rendering slide reports its step count; only the current slide's report moves the step. */
export const registerSteps = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
  slideId: string,
  total: number,
): DeckState => {
  const count = Number.isFinite(total) ? Math.max(1, Math.floor(total)) : 1;
  const known = state.stepCounts[slideId] === count;
  const isCurrent = idAt(slides, state.index) === slideId;
  if (known && !(isCurrent && state.landOnLastStep)) {
    return state;
  }
  const learned = {
    ...state,
    stepCounts: { ...state.stepCounts, [slideId]: count },
  };
  if (!isCurrent) {
    return learned;
  }
  return {
    ...learned,
    step: state.landOnLastStep ? count - 1 : Math.min(state.step, count - 1),
    landOnLastStep: false,
  };
};

/** An animation finished its step; advance unless the deck has moved on since. */
export const completeStep = (
  state: DeckState,
  slides: readonly DeckSlideRef[],
  slideId: string,
  step: number,
): DeckState =>
  idAt(slides, state.index) === slideId &&
  state.step === step &&
  step < currentStepCount(state, slides) - 1
    ? { ...state, step: step + 1 }
    : state;

export type TransitionScope = "slide" | "step";

export interface DeckTransition {
  scope: TransitionScope;
  direction: Direction;
}

/**
 * How a move animates: a slide change always, a step change only when the
 * slide has parts that morph between steps.
 */
export const transitionOf = (
  from: DeckState,
  to: DeckState,
  slideMorphs: boolean,
): DeckTransition | null => {
  if (from.index !== to.index) {
    return {
      scope: "slide",
      direction: to.index > from.index ? "forward" : "backward",
    };
  }
  if (from.step !== to.step && slideMorphs) {
    return {
      scope: "step",
      direction: to.step > from.step ? "forward" : "backward",
    };
  }
  return null;
};

export const indexOfSlide = (
  slides: readonly DeckSlideRef[],
  id: string,
): number | null => {
  const index = slides.findIndex((slide) => slide.id === id);
  return index === -1 ? null : index;
};
