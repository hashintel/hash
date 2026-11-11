/**
 * The hooks a stepped component reads its step with. `useSteps(n)`
 * declares the component's step count as it renders and returns the step;
 * `useStep()` only reads it, which is what `Reveal` and the other built-in
 * parts use. Outside anything that steps, a component shows its last step,
 * so a stepped part on a page without a `Steps` block reads as complete.
 */

import { use, useLayoutEffect } from "react";

import { StepContext } from "./context";

/** The step a component sees when nothing steps it: past every step it names. */
const beyondEveryStep = Number.POSITIVE_INFINITY;

export const useSteps = (totalSteps: number): { step: number } => {
  const context = use(StepContext);
  const live = context !== null && context.mode === "live";
  const scope = context?.scope;
  const registerSteps = context?.registerSteps;
  // Layout, not passive: going back lands on the last step before paint.
  useLayoutEffect(() => {
    if (live && scope !== undefined && registerSteps !== undefined) {
      registerSteps(scope, totalSteps);
    }
  }, [live, registerSteps, scope, totalSteps]);
  return {
    step: live ? (context?.step ?? 0) : Math.max(totalSteps - 1, 0),
  };
};

/** `useSteps` under the name internal-labs slides call it by. */
export const useSlideStepper = useSteps;

export const useStep = (): number => use(StepContext)?.step ?? beyondEveryStep;

/** Moves on to the next step when an animation of the current one finishes. */
export const useCompleteStep = (): (() => void) => {
  const context = use(StepContext);
  return () => context?.completeStep(context.scope, context.step);
};
