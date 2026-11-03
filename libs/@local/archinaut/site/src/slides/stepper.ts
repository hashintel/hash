/**
 * The hooks a slide steps with. `useSlideStepper(n)` declares the slide's
 * step count as it renders and returns the step, as in internal-labs;
 * `useStep()` only reads it, which is what `Reveal` and MDX slides use.
 */

import { use, useLayoutEffect } from "react";

import { SlideStepContext, type SlideStepContextValue } from "./step-context";

const useSlideContext = (hook: string): SlideStepContextValue => {
  const context = use(SlideStepContext);
  if (context === null) {
    throw new Error(`${hook} must be called inside a slide of a deck`);
  }
  return context;
};

export const useSlideStepper = (totalSteps: number): { step: number } => {
  const { slideId, step, mode, registerSteps } =
    useSlideContext("useSlideStepper");
  // Layout, not passive: going back lands on the last step before paint.
  useLayoutEffect(() => {
    if (mode === "live") {
      registerSteps(slideId, totalSteps);
    }
  }, [mode, registerSteps, slideId, totalSteps]);
  return { step: mode === "final" ? Math.max(totalSteps - 1, 0) : step };
};

export const useStep = (): number => useSlideContext("useStep").step;

/** Advances the slide when an animation of the current step finishes. */
export const useCompleteStep = (): (() => void) => {
  const { slideId, step, completeStep } = useSlideContext("useCompleteStep");
  return () => completeStep(slideId, step);
};
