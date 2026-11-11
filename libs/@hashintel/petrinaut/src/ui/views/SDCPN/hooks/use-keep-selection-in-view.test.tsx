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

/**
 * `near` shows on an untouched canvas; `far` and `farther` are off its right
 * edge, and too far apart to fit in it together.
 */
const scene = {
  nodes: [node("near", 600), node("far", 2000), node("farther", 3400)],
  arcs: [
    { id: "near-far", sourceId: "near", targetId: "far" },
    { id: "far-farther", sourceId: "far", targetId: "farther" },
  ],
} as unknown as CanvasScene;

const select = (...ids: string[]) =>
  new Map(
    ids.map(
      (id) => [id, { type: id.includes("-") ? "arc" : "place", id }] as const,
    ),
  );

const origin = { x: 0, y: 0, zoom: 1 };

const setup = (initialSelection: string[]) => {
  let rest = origin;
  const setViewport = vi.fn<CanvasController["setViewport"]>((viewport) => {
    rest = viewport;
  });
  // A camera that never catches up: only where it is heading moves.
  const controller = {
    getViewport: () => origin,
    getRestViewport: () => rest,
    setViewport,
  } as unknown as CanvasController;

  let selection = select(...initialSelection);
  let frame = { width: 1200, right: 0 };
  const { rerender } = renderHook(
    () =>
      useKeepSelectionInView({
        controller,
        scene,
        containerSize: { width: frame.width, height: 600 },
        insets: { left: 200, right: frame.right, bottom: 0 },
        minZoom: 0.1,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EditorContext value={{ selection } as EditorContextValue}>
          {children}
        </EditorContext>
      ),
    },
  );

  return {
    setViewport,
    targets: () => setViewport.mock.calls.map(([viewport]) => viewport.x),
    changeSelection: (...ids: string[]) => {
      selection = select(...ids);
      rerender();
    },
    setRightPanel: (right: number) => {
      frame = { ...frame, right };
      rerender();
    },
    setCanvasWidth: (width: number) => {
      frame = { ...frame, width };
      rerender();
    },
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

  it("fits an arc whose ends are both out of view", () => {
    const { setViewport, changeSelection } = setup([]);
    changeSelection("far-farther");
    // 1500 scene pixels between the ends' outer edges, 900 uncovered.
    expect(setViewport.mock.calls[0]![0].zoom).toBeCloseTo(0.6);
  });

  it("leaves an arc too long to fit alone while one end shows", () => {
    const { setViewport, changeSelection } = setup([]);
    changeSelection("near-far");
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("turns back for an item the camera is heading away from", () => {
    const { targets, changeSelection } = setup([]);
    changeSelection("far");
    changeSelection("near");

    const [towardsFar, towardsNear] = targets();
    expect(towardsNear).toBeGreaterThan(towardsFar!);
  });

  it("moves a selection in view clear of a panel that opens over it", () => {
    const { targets, setRightPanel } = setup(["near"]);
    setRightPanel(500);
    expect(targets()).toEqual([-18]);
  });

  it("keeps following a panel that outruns the camera", () => {
    const { targets, setRightPanel } = setup(["near"]);
    setRightPanel(500);
    setRightPanel(700);
    setRightPanel(800);
    expect(targets()).toEqual([-18, -218, -318]);
  });

  it("moves a selection in view clear of a canvas that shrinks over it", () => {
    const { targets, setCanvasWidth } = setup(["near"]);
    setCanvasWidth(700);
    expect(targets()).toEqual([-18]);
  });

  it("leaves a selection out of view alone when a panel opens", () => {
    const { setViewport, setRightPanel } = setup(["far"]);
    setRightPanel(500);
    expect(setViewport).not.toHaveBeenCalled();
  });
});
