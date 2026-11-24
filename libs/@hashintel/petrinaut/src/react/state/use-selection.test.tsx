/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it } from "vitest";

import { EditorContext } from "./editor-context";
import { useLastPanelTarget, usePanelTarget } from "./use-selection";

import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";
import type { PropsWithChildren } from "react";

afterEach(cleanup);

const selectionOf = (...items: SelectionItem[]): SelectionMap =>
  new Map(items.map((item) => [item.id, item]));

const place: SelectionItem = { type: "place", id: "place-1" };
const transition: SelectionItem = { type: "transition", id: "transition-1" };

/** Both targets under an editor context whose selection the test sets. */
const renderTargets = (initial: SelectionMap) => {
  const { result: defaults } = renderHook(() => use(EditorContext));
  const base = defaults.current;
  let selection = initial;
  const { result, rerender } = renderHook(
    () => ({ now: usePanelTarget(), last: useLastPanelTarget() }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <EditorContext value={{ ...base, selection }}>{children}</EditorContext>
      ),
    },
  );
  return {
    result,
    select: (next: SelectionMap) => {
      selection = next;
      rerender();
    },
  };
};

it("keeps the last selection's target once nothing is selected", () => {
  const { result, select } = renderTargets(selectionOf(place));
  expect(result.current.last).toEqual({ kind: "single", item: place });

  select(selectionOf());
  expect(result.current.now).toEqual({ kind: "none" });
  expect(result.current.last).toEqual({ kind: "single", item: place });

  select(selectionOf(transition));
  expect(result.current.last).toEqual({ kind: "single", item: transition });
});

it("has no target before anything was selected", () => {
  const { result } = renderTargets(selectionOf());
  expect(result.current.last).toEqual({ kind: "none" });
});
