/**
 * From a slide's module to the slide the deck renders. Two module shapes are
 * accepted: a `default` export with `title`, `notes` and `steps` as named
 * exports (MDX writes this), or a single exported component with those as
 * static properties (internal-labs writes this). Named exports win.
 */

import type { SlideDefinition, SlideNotes, StepNotes } from "./types";
import type { ComponentType } from "react";

/** How a slide was written: an MDX slide gets the deck's frame around it, a TSX slide draws its own. */
export type SlideKind = "mdx" | "tsx";

export interface SlideSource {
  /** From the file name, `3-memory.tsx` → `memory`. */
  id: string;
  kind: SlideKind;
  load: () => Promise<Record<string, unknown>>;
}

export interface LoadedSlide {
  id: string;
  kind: SlideKind;
  title: string;
  notes: StepNotes;
  /** Null when the slide registers its steps with `useSlideStepper` as it renders. */
  declaredSteps: number | null;
  Content: ComponentType;
}

const isComponent = (value: unknown): value is SlideDefinition =>
  typeof value === "function";

const componentOf = (
  module: Record<string, unknown>,
  where: string,
): SlideDefinition => {
  if (isComponent(module.default)) {
    return module.default;
  }
  const components = Object.values(module).filter(isComponent);
  const [only] = components;
  if (components.length !== 1 || only === undefined) {
    throw new Error(
      `${where} must export one slide component, as \`default\` or as its only exported function; it exports ${components.length}`,
    );
  }
  return only;
};

export const toStepNotes = (notes: SlideNotes | undefined): StepNotes =>
  typeof notes === "string" ? { default: notes } : (notes ?? {});

export const noteFor = (notes: StepNotes, step: number): string =>
  notes.byStep?.[step] ?? notes.default ?? "";

const titleFromId = (id: string): string =>
  id.replace(/[-_]+/gu, " ").replace(/^./u, (first) => first.toUpperCase());

const stepCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : null;

export const resolveSlideModule = (
  source: Pick<SlideSource, "id" | "kind">,
  module: Record<string, unknown>,
): LoadedSlide => {
  const Content = componentOf(module, `slide "${source.id}"`);
  const named = <T>(key: keyof SlideDefinition & string): T | undefined =>
    (module[key] ?? Content[key]) as T | undefined;
  const id = named<string>("id") ?? source.id;
  const notes = toStepNotes(named<SlideNotes>("notes"));
  return {
    id,
    kind: source.kind,
    title: named<string>("title") ?? titleFromId(id),
    notes,
    declaredSteps: stepCount(named("steps")),
    Content,
  };
};
