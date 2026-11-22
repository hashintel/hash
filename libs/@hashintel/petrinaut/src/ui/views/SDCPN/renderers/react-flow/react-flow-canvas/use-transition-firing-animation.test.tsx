/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ArcPulses, ArcPulsesContext } from "./arc-pulses";
import { useTransitionFiringAnimation } from "./use-transition-firing-animation";

afterEach(cleanup);

type Input = {
  firingDelta: number | null;
  position?: { x: number; y: number };
  /** Whether the transition's box and bolt are on the page. */
  drawn?: boolean;
};

const mount = (initial: Input) => {
  const pulses = {
    fire: vi.fn<ArcPulses["fire"]>(),
    show: vi.fn<ArcPulses["show"]>(),
  };
  const flashes = vi.fn();
  const element = () => {
    const div = document.createElement("div");
    // jsdom has no Web Animations.
    div.animate = flashes;
    return div;
  };
  const box = { current: element() };
  const bolt = { current: element() };
  const none = { current: null };

  const { rerender } = renderHook(
    ({ firingDelta, position = { x: 100, y: 100 }, drawn = true }: Input) => {
      // The pane as React Flow measures it: 800 by 600, at zoom 1.
      const store = useStoreApi();
      store.setState({ width: 800, height: 600 });
      useTransitionFiringAnimation(
        "transition",
        drawn ? box : none,
        drawn ? bolt : none,
        firingDelta,
        position,
      );
    },
    {
      initialProps: initial,
      wrapper: ({ children }) => (
        <ReactFlowProvider>
          <ArcPulsesContext value={pulses}>{children}</ArcPulsesContext>
        </ReactFlowProvider>
      ),
    },
  );
  return { pulses, flashes, rerender };
};

describe("a transition that fired", () => {
  it("pulses its arcs once, with the number of firings, and flashes its box and bolt", () => {
    const { pulses, flashes } = mount({ firingDelta: 3 });

    expect(pulses.fire.mock.calls).toEqual([["transition", 3]]);
    expect(flashes).toHaveBeenCalledTimes(2);
  });

  it("pulses again when the number of firings in a frame changes, and not for another render", () => {
    const { pulses, rerender } = mount({ firingDelta: 1 });

    rerender({ firingDelta: 1, position: { x: 140, y: 100 } });
    expect(pulses.fire).toHaveBeenCalledTimes(1);

    rerender({ firingDelta: 2 });
    expect(pulses.fire.mock.calls).toEqual([
      ["transition", 1],
      ["transition", 2],
    ]);
  });

  it.each([null, 0])("does nothing for a firing count of %s", (firingDelta) => {
    const { pulses, flashes } = mount({ firingDelta });

    expect(pulses.fire).not.toHaveBeenCalled();
    expect(flashes).not.toHaveBeenCalled();
  });

  it("pulses its arcs though its own box is off the pane: an arc decides for itself", () => {
    const { pulses, flashes } = mount({
      firingDelta: 1,
      position: { x: 5_000, y: 5_000 },
    });

    expect(pulses.fire.mock.calls).toEqual([["transition", 1]]);
    expect(flashes).not.toHaveBeenCalled();
  });

  it("pulses its arcs though its box is not on the page", () => {
    const { pulses, flashes } = mount({ firingDelta: 1, drawn: false });

    expect(pulses.fire.mock.calls).toEqual([["transition", 1]]);
    expect(flashes).not.toHaveBeenCalled();
  });
});
