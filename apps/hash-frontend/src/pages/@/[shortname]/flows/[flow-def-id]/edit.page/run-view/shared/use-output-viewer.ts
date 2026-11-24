import { useState } from "react";

import type { ListDisplay } from "./run-value-display";
import type { EntityId } from "@blockprotocol/type-system";

/** The side sheet's width: the DS Drawer's `md` size. */
export const outputSheetWidth = 640;

export type OutputContent =
  /** `typeKey` is the type tab picked, kept here so that going back to the list and Expand keep it. */
  | { kind: "list"; list: ListDisplay; typeKey?: string }
  /** The whole list's entities, so that ← → step through its files. */
  | { kind: "file"; entityIds: EntityId[]; index: number };

export type OutputView = OutputContent & {
  /** What the value is, e.g. its output's name. */
  title: string;
  /** Where it's from, e.g. its step's name. */
  source: string;
};

/** The values opened, the last on top, so that going back from a file opened from a list returns to the list. */
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
