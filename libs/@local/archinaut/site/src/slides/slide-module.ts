/**
 * From a slide's module to the slide the deck renders. Two module shapes are
 * accepted: a `default` export with `title`, `label`, `notes` and `steps` as
 * named exports (MDX writes this), or a single exported component with those
 * as static properties (internal-labs writes this). Named exports win.
 *
 * An MDX slide may also ask for a layout: `layout = "title"` sets its
 * `title` large, with an optional `subtitle` and `author`, above whatever
 * the slide's body holds. A TSX slide draws its own.
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

/** How the deck lays out an MDX slide: as prose, or as the talk's title. */
export type SlideLayout =
  | { kind: "content" }
  | { kind: "title"; subtitle: string | null; author: string | null };

export interface LoadedSlide {
  id: string;
  kind: SlideKind;
  title: string;
  /**
   * What the top-left corner names the slide: its `label`, else its title.
   * A title slide already shows its title large, so only a `label` names it.
   */
  label: string | null;
  layout: SlideLayout;
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

const optionalText = (
  module: Record<string, unknown>,
  key: string,
  where: string,
): string | null => {
  const value = module[key];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${where}: \`${key}\` must be a string`);
  }
  return value;
};

const layoutOf = (
  module: Record<string, unknown>,
  where: string,
): SlideLayout => {
  const subtitle = optionalText(module, "subtitle", where);
  const author = optionalText(module, "author", where);
  if (module.layout === "title") {
    return { kind: "title", subtitle, author };
  }
  if (module.layout !== undefined && module.layout !== "content") {
    throw new Error(
      `${where}: \`layout\` must be "title" or "content", not ${JSON.stringify(module.layout)}`,
    );
  }
  if (subtitle !== null || author !== null) {
    throw new Error(
      `${where}: only a title slide shows \`subtitle\` and \`author\`; add \`export const layout = "title"\``,
    );
  }
  return { kind: "content" };
};

export const resolveSlideModule = (
  source: Pick<SlideSource, "id" | "kind">,
  module: Record<string, unknown>,
): LoadedSlide => {
  const where = `slide "${source.id}"`;
  const Content = componentOf(module, where);
  const named = <T>(key: keyof SlideDefinition & string): T | undefined =>
    (module[key] ?? Content[key]) as T | undefined;
  const id = named<string>("id") ?? source.id;
  const title = named<string>("title") ?? titleFromId(id);
  const layout: SlideLayout =
    source.kind === "mdx" ? layoutOf(module, where) : { kind: "content" };
  const notes = toStepNotes(named<SlideNotes>("notes"));
  return {
    id,
    kind: source.kind,
    title,
    label: named<string>("label") ?? (layout.kind === "title" ? null : title),
    layout,
    notes,
    declaredSteps: stepCount(named("steps")),
    Content,
  };
};
