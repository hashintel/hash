/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  scrollFades,
  TargetHeader,
  targetHeaderControls,
} from "./target-header";

import type {
  PetriNetIr,
  ResolvedZerothTarget,
} from "@hashintel/petrinaut-core/reactive-modules";

const defaults: ResolvedZerothTarget = {
  shape: "monolithic",
  marking: "real",
  control: "closed",
  dt: 0.5,
  slots: 8,
  layout: "single",
};

const coloured: PetriNetIr = {
  name: "drones",
  kind: "plain",
  colours: { Drone: { battery: "real" } },
  places: { Hangar: { colour: "Drone" } },
  transitions: {},
};

const plain: PetriNetIr = {
  name: "cycle",
  kind: "plain",
  places: { A: null },
  transitions: { Go: { inputs: { A: null }, controllable: true } },
};

const stochastic: PetriNetIr = {
  name: "queue",
  kind: "stochastic",
  places: { Waiting: null },
  transitions: { Arrive: { outputs: { Waiting: null }, rate: 2 } },
};

afterEach(cleanup);

describe("targetHeaderControls", () => {
  it("offers the layout only under the modular shape", () => {
    const monolithic = targetHeaderControls(defaults, stochastic).controls.find(
      (control) => control.id === "layout",
    );
    expect(monolithic).toMatchObject({
      value: "single",
      disabledReason: "Layout applies to the modular shape",
    });
    const modular = targetHeaderControls(
      { ...defaults, shape: "modular", layout: "per-module" },
      stochastic,
    ).controls.find((control) => control.id === "layout");
    expect(modular).toMatchObject({ value: "per-module" });
    expect(modular?.disabledReason).toBeUndefined();
    expect(modular?.items.map((item) => item.text)).toEqual([
      "Single file",
      "File per module",
    ]);
  });

  it("offers the marking of a stochastic net, and no control without a controllable transition", () => {
    const model = targetHeaderControls(defaults, stochastic);
    expect(
      model.controls.map((control) => [control.id, control.value]),
    ).toEqual([
      ["shape", "monolithic"],
      ["layout", "single"],
      ["marking", "real"],
      ["control", "closed"],
    ]);
    expect(model.controls[2]?.disabledReason).toBeUndefined();
    expect(model.controls[3]?.disabledReason).toMatch(/controllable/u);
  });

  it("fixes a plain net's marking to Int and offers control when a transition is controllable", () => {
    const model = targetHeaderControls(
      { ...defaults, marking: "int", control: "open" },
      plain,
    );
    expect(model.controls[2]).toMatchObject({
      value: "int",
      disabledReason: "A plain net's marking is always Int",
    });
    expect(model.controls[3]).toMatchObject({ value: "open" });
    expect(model.controls[3]?.disabledReason).toBeUndefined();
  });

  it("fixes a coloured net's marking to Real and offers its slots", () => {
    const model = targetHeaderControls(defaults, coloured);
    expect(model.slots).toBe(8);
    expect(model.controls[2]).toMatchObject({
      value: "real",
      disabledReason: "A coloured net or one with dynamics holds Reals",
    });
  });

  it("disables everything but the shape while the net has not compiled", () => {
    const model = targetHeaderControls(defaults, null);
    expect(
      model.controls.map((control) => control.disabledReason !== undefined),
    ).toEqual([false, true, true, true]);
  });
});

describe("TargetHeader", () => {
  it("renders one labelled select per flag and the trailing content", () => {
    render(
      <TargetHeader target={defaults} document={stochastic} onChange={vi.fn()}>
        <button type="button">Files</button>
      </TargetHeader>,
    );
    const group = screen.getByRole("group", { name: "Compiler flags" });
    expect(group.textContent).toContain("Shape");
    expect(group.textContent).toContain("Layout");
    expect(group.textContent).toContain("Marking");
    expect(group.textContent).toContain("Control");
    expect(group.textContent).not.toContain("dt");
    expect(screen.getByLabelText("Shape flag")).toBeDefined();
    // The controls scroll as one line; the trailing content stays outside.
    const scroller = group.querySelector("[data-flags-scroller]");
    expect(scroller?.contains(screen.getByLabelText("Shape flag"))).toBe(true);
    expect(group.lastElementChild?.textContent).toBe("Files");
    expect(scroller?.contains(group.lastElementChild)).toBe(false);
  });

  it("fades the edge that hides more of the flags", () => {
    expect(
      scrollFades({ scrollLeft: 0, clientWidth: 300, scrollWidth: 600 }),
    ).toEqual({ left: false, right: true });
    expect(
      scrollFades({ scrollLeft: 300, clientWidth: 300, scrollWidth: 600 }),
    ).toEqual({ left: true, right: false });
    expect(
      scrollFades({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }),
    ).toEqual({ left: false, right: false });

    render(
      <TargetHeader
        target={defaults}
        document={stochastic}
        onChange={vi.fn()}
      />,
    );
    const group = screen.getByRole("group", { name: "Compiler flags" });
    const scroller = group.querySelector<HTMLDivElement>(
      "[data-flags-scroller]",
    )!;
    const shell = scroller.parentElement!;
    Object.defineProperty(scroller, "scrollWidth", { value: 600 });
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    expect(shell.dataset.fadeLeft).toBe("false");
    expect(shell.dataset.fadeRight).toBe("true");
    scroller.scrollLeft = 300;
    fireEvent.scroll(scroller);
    expect(shell.dataset.fadeLeft).toBe("true");
    expect(shell.dataset.fadeRight).toBe("false");
  });
});
