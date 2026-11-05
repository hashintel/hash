/**
 * What a deck author writes against. A slide is a component; its title,
 * notes and step count travel with it, either as static properties on the
 * component (how internal-labs slides are written) or as named exports
 * beside it (what an MDX slide's frontmatter compiles to).
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
  /** What the top-left corner names the slide, when not its title. */
  label?: string;
  notes?: SlideNotes;
  /** Steps declared up front; a slide calling `useSteps` declares them as it renders. */
  steps?: number;
};
