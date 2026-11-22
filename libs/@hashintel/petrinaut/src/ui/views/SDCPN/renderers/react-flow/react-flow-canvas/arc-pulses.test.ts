/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ArcPulseView,
  createArcPulses,
  type PulsingArc,
} from "./arc-pulses";

import type { ViewportState } from "./firing-animation-visibility";

type AnimationStub = { cancel: () => void; onfinish: (() => void) | null };

/** The animations started, each with the width it starts at. */
let started: { element: Element; peak: number; animation: AnimationStub }[];
let now: number;

beforeEach(() => {
  started = [];
  now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  // jsdom has no Web Animations.
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value(this: Element, keyframes: { strokeWidth: string }[]) {
      const animation: AnimationStub = { cancel: vi.fn(), onfinish: null };
      started.push({
        element: this,
        peak: Number.parseFloat(keyframes[0]?.strokeWidth ?? ""),
        animation,
      });
      return animation;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const arc = (overrides: Partial<PulsingArc> = {}): PulsingArc => ({
  id: "arc",
  kind: "standard",
  weight: 1,
  color: "#123456",
  transitionId: "transition",
  geometry: { length: 220, box: { x: 0, y: 0, width: 200, height: 40 } },
  paths: { curve: "M0,0C50,0 150,40 200,40" },
  ...overrides,
});

const onScreen: ViewportState = {
  transform: [0, 0, 1],
  width: 800,
  height: 600,
};

/** A page with one holder per arc. */
const viewOf = (
  arcs: PulsingArc[],
  viewport: ViewportState = onScreen,
): ArcPulseView & { holders: Element[] } => {
  const holders = arcs.map(() => {
    const holder = document.createElementNS("http://www.w3.org/2000/svg", "g");
    document.body.append(holder);
    return holder;
  });
  return {
    arcs,
    holders,
    holderOf: (index) => holders[index] ?? null,
    viewport: () => viewport,
  };
};

const peakFor = (firings: number, weight = 1) =>
  Math.min(65, 2 + Math.log(1 + firings) * Math.min(6 * weight, 25));

describe("the pulse of a firing", () => {
  it("draws the whole curve of each arc of the transition, in the arc's colour, under its line", () => {
    const pulses = createArcPulses();
    const view = viewOf([
      arc({ id: "in" }),
      arc({ id: "other", transitionId: "another" }),
      arc({ id: "out", color: "#abcdef" }),
    ]);
    pulses.show(view);

    pulses.fire("transition", 1);

    expect(view.holders.map((holder) => holder.children.length)).toEqual([
      1, 0, 1,
    ]);
    const path = view.holders[2]?.firstElementChild;
    expect(path?.getAttribute("d")).toBe("M0,0C50,0 150,40 200,40");
    expect(path?.getAttribute("stroke")).toBe("#abcdef");
    expect(path?.getAttribute("fill")).toBe("none");
    // A pulse of any width leaves what is beside the arc pressable.
    expect(path?.getAttribute("pointer-events")).toBe("none");
  });

  it("starts as wide as the firings and the arc's weight make it, and never wider than 65", () => {
    const pulses = createArcPulses();
    pulses.show(
      viewOf([
        arc({ id: "light" }),
        arc({ id: "heavy", weight: 3 }),
        arc({ id: "heaviest", weight: 100 }),
      ]),
    );

    pulses.fire("transition", 4);

    expect(started.map((pulse) => pulse.peak)).toEqual([
      peakFor(4, 1),
      peakFor(4, 3),
      peakFor(4, 100),
    ]);
    pulses.fire("transition", 1_000);
    expect(started.at(-1)?.peak).toBe(65);
  });

  it("adds what is left of a pulse under way, on the same path", () => {
    const pulses = createArcPulses();
    const view = viewOf([arc()]);
    pulses.show(view);

    pulses.fire("transition", 2);
    now += 125;
    pulses.fire("transition", 1);

    // A quarter of the first pulse has passed: three quarters of its two
    // firings are left.
    expect(started[1]?.peak).toBeCloseTo(peakFor(1 + 2 * 0.75));
    expect(started[0]?.animation.cancel).toHaveBeenCalled();
    expect(view.holders[0]?.children.length).toBe(1);

    // A pulse that has run its length adds nothing.
    now += 500;
    pulses.fire("transition", 1);
    expect(started[2]?.peak).toBeCloseTo(peakFor(1));
  });

  it("is taken off the page when it ends", () => {
    const pulses = createArcPulses();
    const view = viewOf([arc()]);
    pulses.show(view);
    pulses.fire("transition", 1);

    started[0]?.animation.onfinish?.();

    expect(view.holders[0]?.children.length).toBe(0);
    // The next firing starts afresh.
    now += 10;
    pulses.fire("transition", 1);
    expect(started[1]?.peak).toBeCloseTo(peakFor(1));
  });

  it("skips an arc that is off screen, and every arc below the smallest zoom", () => {
    const pulses = createArcPulses();
    const far = arc({
      id: "far",
      geometry: {
        length: 220,
        box: { x: 5_000, y: 0, width: 200, height: 40 },
      },
    });
    const view = viewOf([arc(), far]);
    pulses.show(view);

    pulses.fire("transition", 1);
    expect(view.holders.map((holder) => holder.children.length)).toEqual([
      1, 0,
    ]);

    const small = viewOf([arc({ id: "small" })], {
      ...onScreen,
      transform: [0, 0, 0.2],
    });
    pulses.show(small);
    pulses.fire("transition", 1);
    expect(small.holders[0]?.children.length).toBe(0);
  });

  it("does nothing for a firing count of zero, or with no arcs on the page", () => {
    const pulses = createArcPulses();
    pulses.fire("transition", 1);
    pulses.show(viewOf([arc()]));
    pulses.fire("transition", 0);

    expect(started).toEqual([]);
  });
});

describe("where a pulse stops", () => {
  it("says what share of a standard arc lies before its head, for the pane to stop a faded pulse there", () => {
    const pulses = createArcPulses();
    const view = viewOf([arc()]);
    pulses.show(view);
    pulses.fire("transition", 1);
    const path = view.holders[0]?.querySelector<SVGPathElement>("path");

    expect(path?.getAttribute("class")).toBe("arc-pulse");
    expect(path?.getAttribute("pathLength")).toBe("1");
    const [drawn, gap] = (
      path?.style.getPropertyValue("--arc-faded-dash") ?? ""
    )
      .split(" ")
      .map(Number);
    // The head is 11 units of a curve 220 long.
    expect(drawn).toBeCloseTo(1 - 11 / 220);
    expect(gap).toBe(1);
  });

  it("keeps the dots of a read arc and the plain line of an inhibitor arc", () => {
    const pulses = createArcPulses();
    const view = viewOf([
      arc({ id: "read", kind: "read" }),
      arc({ id: "inhibitor", kind: "inhibitor" }),
    ]);
    pulses.show(view);
    pulses.fire("transition", 1);
    const [read, inhibitor] = view.holders.map(
      (holder) => holder.firstElementChild,
    );

    expect(read?.getAttribute("stroke-dasharray")).toBe("2 6");
    expect(read?.getAttribute("stroke-linecap")).toBe("round");
    expect(inhibitor?.getAttribute("stroke-dasharray")).toBeNull();
    // These fade with their group, by the group's opacity.
    for (const path of [read, inhibitor]) {
      expect(path?.getAttribute("class")).toBeNull();
      expect(path?.getAttribute("pathLength")).toBeNull();
    }
  });
});

describe("a pulse under way when the page changes", () => {
  it("follows its arc to where the arc is drawn now", () => {
    const pulses = createArcPulses();
    const before = viewOf([arc()]);
    pulses.show(before);
    pulses.fire("transition", 1);
    const path = before.holders[0]?.firstElementChild;

    const moved = arc({ paths: { curve: "M0,0C50,0 150,90 200,90" } });
    const after = viewOf([arc({ id: "new" }), moved]);
    pulses.show(after);

    expect(after.holders[1]?.firstElementChild).toBe(path);
    expect(path?.getAttribute("d")).toBe("M0,0C50,0 150,90 200,90");
    expect(started).toHaveLength(1);
    expect(started[0]?.animation.cancel).not.toHaveBeenCalled();
  });

  it("ends with an arc that is gone, or that has no place on the page", () => {
    const pulses = createArcPulses();
    const view = viewOf([arc({ id: "kept" }), arc({ id: "gone" })]);
    pulses.show(view);
    pulses.fire("transition", 1);

    pulses.show(viewOf([arc({ id: "kept" })]));
    expect(started[1]?.animation.cancel).toHaveBeenCalled();
    expect(started[0]?.animation.cancel).not.toHaveBeenCalled();

    pulses.show(null);
    expect(started[0]?.animation.cancel).toHaveBeenCalled();
    expect(document.querySelectorAll("path")).toHaveLength(0);
  });
});
