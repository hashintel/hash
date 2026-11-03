/**
 * What a deck may import, as `@archinaut/slides`. Everything else in the
 * site is internal: a slide that reaches past this list breaks when the
 * site changes.
 */

export type { SlideDefinition, SlideNotes, StepNotes } from "./types";
export { Slide } from "./slide";
export { SlideFrame } from "./frame";
export { OnlyInline, Reveal, RevealInline } from "./reveal";
export { useSlideStepper, useStep, useCompleteStep } from "./stepper";
export { LayerCard } from "./docs/layer-card";
