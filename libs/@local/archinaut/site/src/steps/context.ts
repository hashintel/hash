/**
 * What a stepped component sees of whatever steps it: a slide in a deck,
 * which the presenter steps, or a `Steps` block on a docs page, which plays
 * itself. `scope` names that slide or block. `final` is a still layout,
 * such as print, where every part shows its last step and nothing
 * registers.
 */

import { createContext } from "react";

export interface StepContextValue {
  scope: string;
  step: number;
  mode: "live" | "final";
  registerSteps: (scope: string, total: number) => void;
  completeStep: (scope: string, step: number) => void;
}

export const StepContext = createContext<StepContextValue | null>(null);
