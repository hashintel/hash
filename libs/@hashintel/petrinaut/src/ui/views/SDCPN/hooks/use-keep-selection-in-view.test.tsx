// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EditorContext,
  type EditorContextValue,
} from "../../../../react/state/editor-context";
import { useKeepSelectionInView } from "./use-keep-selection-in-view";

import type { CanvasController } from "../canvas-renderer";
import type { CanvasScene } from "../canvas-scene";
import type { ReactNode } from "react";

const node = (id: string, x: number) => ({
  id,
  position: { x, y: 300 },
  width: 100,
  height: 60,
});

/** `near` shows on an untouched canvas, `far` is off its right edge. */
const scene = {
  nodes: [node("near", 400), node("far", 2000)],
  arcs: [],
} as unknown as CanvasScene;

const select = (...ids: string[]) =>
  new Map(ids.map((id) => [id, { type: "place", id }] as const));

const setup = (initialSelection: string[]) => {
  const setViewport = vi.fn<CanvasController["setViewport"]>();
  const controller = {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport,
  } as unknown as CanvasController;

  let selection = select(...initialSelection);
  const { rerender } = renderHook(
    ({ right }) =>
      useKeepSelectionInView({
        controller,
        scene,
        containerSize: { width: 1000, height: 600 },
        insets: { left: 200, right, bottom: 0 },
        minZoom: 0.1,
      }),
    {
      initialProps: { right: 0 },
      wrapper: ({ children }: { children: ReactNode }) => (
        <EditorContext value={{ selection } as EditorContextValue}>
          {children}
        </EditorContext>
      ),
    },
  );

  return {
    setViewport,
    changeSelection: (...ids: string[]) => {
      selection = select(...ids);
      rerender({ right: 0 });
    },
    openRightPanel: () => rerender({ right: 500 }),
  };
};

describe("useKeepSelectionInView", () => {
  it("leaves the selection the canvas opened with where it is", () => {
    const { setViewport } = setup(["far"]);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("brings a newly selected item into view", () => {
    const { setViewport, changeSelection } = setup([]);
    changeSelection("far");

    expect(setViewport).toHaveBeenCalledOnce();
    const [viewport, options] = setViewport.mock.calls[0]!;
    expect(viewport.x).toBeLessThan(0);
    expect(viewport.y).toBe(0);
    expect(options).toEqual({ animate: true });
  });

  it("never moves for a multiple selection", () => {
    const { setViewport, changeSelection } = setup([]);
    changeSelection("near", "far");
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("moves a selection in view clear of a panel that opens over it", () => {
    const { setViewport, openRightPanel } = setup(["near"]);
    openRightPanel();

    expect(setViewport).toHaveBeenCalledOnce();
    expect(setViewport.mock.calls[0]![0].x).toBeLessThan(0);
  });

  it("leaves a selection out of view alone when a panel opens", () => {
    const { setViewport, openRightPanel } = setup(["far"]);
    openRightPanel();
    expect(setViewport).not.toHaveBeenCalled();
  });
});
