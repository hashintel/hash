/**
 * What a slide sees of the deck: its id, its step, and how to tell the deck
 * about its steps. `final` is the print layout, where every slide shows its
 * last step and nothing registers.
 */

import { createContext } from "react";

export interface SlideStepContextValue {
  slideId: string;
  step: number;
  mode: "live" | "final";
  registerSteps: (slideId: string, total: number) => void;
  completeStep: (slideId: string, step: number) => void;
}

export const SlideStepContext = createContext<SlideStepContextValue | null>(
  null,
);
