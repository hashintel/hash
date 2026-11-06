/**
 * From a slide's module to the slide the deck renders. Two module shapes are
 * accepted: a `default` export with `title`, `label`, `notes` and `steps` as
 * named exports, or a single exported component with those as static
 * properties (internal-labs writes this). Named exports win.
 *
 * An MDX slide's named exports are written by the compile from its
 * frontmatter, which is checked there. They may also ask for a layout:
 * `layout: title` sets the `title` large, with an optional `subtitle` and
 * `author`, above whatever the slide's body holds. A TSX slide draws its own.
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
  | {
      kind: "content";
      /** Where the body sits under the heading: at the top, or centred in the space left. */
      align: "top" | "center";
    }
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

const textOf = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const topAligned: SlideLayout = { kind: "content", align: "top" };

const layoutOf = (module: Record<string, unknown>): SlideLayout =>
  module.layout === "title"
    ? {
        kind: "title",
        subtitle: textOf(module.subtitle),
        author: textOf(module.author),
      }
    : { kind: "content", align: module.align === "center" ? "center" : "top" };

export const resolveSlideModule = (
  source: Pick<SlideSource, "id" | "kind">,
  module: Record<string, unknown>,
): LoadedSlide => {
  const Content = componentOf(module, `slide "${source.id}"`);
  const named = <T>(key: keyof SlideDefinition & string): T | undefined =>
    (module[key] ?? Content[key]) as T | undefined;
  const id = named<string>("id") ?? source.id;
  const title = named<string>("title") ?? titleFromId(id);
  const layout: SlideLayout =
    source.kind === "mdx" ? layoutOf(module) : topAligned;
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
