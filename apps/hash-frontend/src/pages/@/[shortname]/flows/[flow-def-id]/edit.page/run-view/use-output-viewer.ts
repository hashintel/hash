import { useState } from "react";

import type { ListDisplay } from "./shared/run-value-display";
import type { EntityId } from "@blockprotocol/type-system";

/** How much of the run's right edge the output viewer's side sheet covers: the DS Drawer's `md` width. */
export const outputSheetWidth = 640;

/** What a value a run got or gave opens as. */
export type OutputContent =
  /** A list, whole, of text or of entities. */
  | { kind: "list"; list: ListDisplay }
  /** A file of a list of entities, which steps through the list's files. */
  | { kind: "file"; entityIds: EntityId[]; index: number };

/** A value open in the output viewer. */
export type OutputView = OutputContent & {
  /** What the value is, e.g. its output's name. */
  title: string;
  /** Where it's from, e.g. its step's name. */
  source: string;
};

/**
 * What the output viewer shows: the values opened, the last on top, so that going back from a file opened from a list
 * goes back to the list; and whether it's open wide, in the side sheet.
 */
export const useOutputViewer = () => {
  const [stack, setStack] = useState<OutputView[]>([]);
  const [wide, setWide] = useState(false);

  return {
    view: stack.at(-1) ?? null,
    depth: stack.length,
    wide: wide && stack.length > 0,
    open: (view: OutputView, options?: { wide: boolean }) => {
      setStack([view]);
      setWide(options?.wide ?? false);
    },
    push: (view: OutputView) => setStack((current) => [...current, view]),
    replace: (view: OutputView) =>
      setStack((current) => [...current.slice(0, -1), view]),
    back: () => setStack((current) => current.slice(0, -1)),
    close: () => {
      setStack([]);
      setWide(false);
    },
    expand: () => setWide(true),
    collapse: () => setWide(false),
  };
};

export type OutputViewerState = ReturnType<typeof useOutputViewer>;
