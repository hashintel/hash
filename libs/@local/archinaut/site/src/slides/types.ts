/**
 * What a deck author writes against. A slide is a component; its title,
 * notes and step count travel with it, either as static properties on the
 * component (how internal-labs slides are written) or as named exports
 * beside it (how an MDX slide is written).
 */

import type { ComponentType } from "react";

export interface StepNotes {
  default?: string;
  byStep?: Partial<Record<number, string>>;
}

export type SlideNotes = string | StepNotes;

/** A slide component carrying its metadata as static properties. */
export type SlideDefinition = ComponentType & {
  /** The URL hash; the file name supplies one when absent. */
  id?: string;
  title?: string;
  notes?: SlideNotes;
  /** Steps declared up front; a slide calling `useSlideStepper` declares them as it renders. */
  steps?: number;
};
