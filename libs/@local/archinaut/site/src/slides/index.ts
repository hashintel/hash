/**
 * What a deck may import, as `@archinaut/slides`. Everything else in the
 * site is internal: a slide that reaches past this list breaks when the
 * site changes.
 */

export type { SlideDefinition, SlideNotes, StepNotes } from "./types";
export { Slide } from "./slide";
export { SlideFrame } from "./frame";
export { TitleSlide } from "./title-slide";
export { OnlyInline, Reveal, RevealInline } from "../steps/reveal";
export { Morph } from "../steps/morph";
export { Steps } from "../steps/steps";
export {
  useCompleteStep,
  useSlideStepper,
  useStep,
  useSteps,
} from "../steps/hooks";
export { LayerCard } from "./docs/layer-card";
