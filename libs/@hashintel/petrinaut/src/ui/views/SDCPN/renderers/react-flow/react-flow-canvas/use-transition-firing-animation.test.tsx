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

/** A node on a pane, for the box of a transition to be inside of. */
const nodeOnPane = ({ focusActive }: { focusActive: boolean }) => {
  const pane = document.createElement("div");
  pane.toggleAttribute("data-focus-active", focusActive);
  const node = pane.appendChild(document.createElement("div"));
  node.className = "react-flow__node";
  return node;
};

const mount = (initial: Input, node = document.createElement("div")) => {
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
  const box = { current: node.appendChild(element()) };
  // The icon box of a compact card, which a faded card does not draw.
  const inlayFlashes = vi.fn();
  const inlay = box.current.appendChild(document.createElement("div"));
  inlay.className = "node-inlay";
  inlay.animate = inlayFlashes;
  const bolt = { current: node.appendChild(element()) };
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
  return { pulses, flashes, inlayFlashes, rerender };
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

  it("flashes at full strength while its node is not faded", () => {
    const { flashes } = mount(
      { firingDelta: 1 },
      nodeOnPane({ focusActive: false }),
    );

    expect(flashes.mock.calls[0]?.[0]).toEqual([
      {
        background: "rgba(255, 224, 132, 0.7)",
        boxShadow:
          "var(--node-outline-ring, 0 0 #0000), 0 0 6px 1px rgba(255, 132, 0, 0.59)",
        offset: 0,
      },
    ]);
  });

  it("flashes as faded as its node, with the ring of a faded node", () => {
    const { flashes } = mount(
      { firingDelta: 1 },
      nodeOnPane({ focusActive: true }),
    );

    expect(flashes.mock.calls[0]?.[0]).toEqual([
      {
        background:
          "color-mix(in srgb, rgba(255, 224, 132, 0.7) 40%, transparent)",
        boxShadow:
          "var(--node-faded-outline-ring, 0 0 #0000), 0 0 6px 1px color-mix(in srgb, rgba(255, 132, 0, 0.59) 40%, transparent)",
        offset: 0,
      },
    ]);
    expect(flashes.mock.calls[1]?.[0]).toEqual([
      { opacity: 0.4, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.5)" },
    ]);
  });

  it("draws the icon box of a faded card for the length of the flash, as a cover", () => {
    const { inlayFlashes } = mount(
      { firingDelta: 1 },
      nodeOnPane({ focusActive: true }),
    );

    expect(inlayFlashes.mock.calls).toEqual([
      [
        [
          {
            backgroundColor:
              "color-mix(in srgb, var(--node-fill) 40%, var(--colors-neutral-s25))",
            offset: 0,
          },
        ],
        { duration: 300, easing: "ease-out" },
      ],
    ]);
  });

  it("leaves the icon box alone while its node is not faded", () => {
    const { inlayFlashes } = mount(
      { firingDelta: 1 },
      nodeOnPane({ focusActive: false }),
    );

    expect(inlayFlashes).not.toHaveBeenCalled();
  });

  it("pulses its arcs though its box is not on the page", () => {
    const { pulses, flashes } = mount({ firingDelta: 1, drawn: false });

    expect(pulses.fire.mock.calls).toEqual([["transition", 1]]);
    expect(flashes).not.toHaveBeenCalled();
  });
});
