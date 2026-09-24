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
  rates: "coin",
  conflicts: "sweep",
  marking: "real",
  control: "closed",
  dt: 0.5,
  slots: 8,
  layout: "single",
  syntax: "update",
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

const fork: PetriNetIr = {
  name: "fork",
  kind: "stochastic",
  places: { Pool: null, Left: null, Right: null },
  transitions: {
    TakeLeft: { inputs: { Pool: null }, outputs: { Left: null }, rate: 1 },
    TakeRight: { inputs: { Pool: null }, outputs: { Right: null }, rate: 2 },
  },
};

afterEach(cleanup);

const controlOf = (
  model: ReturnType<typeof targetHeaderControls>,
  id: string,
) => model.controls.find((control) => control.id === id);

describe("targetHeaderControls", () => {
  it("offers the layout under the modular shape or clock rates", () => {
    const monolithic = targetHeaderControls(defaults, stochastic).controls.find(
      (control) => control.id === "layout",
    );
    expect(monolithic).toMatchObject({
      value: "single",
      disabledReason: "Layout applies to the modular shape or Clock rates",
    });
    const clocked = controlOf(
      targetHeaderControls({ ...defaults, rates: "clock" }, stochastic),
      "layout",
    );
    expect(clocked).toMatchObject({ value: "single" });
    expect(clocked?.disabledReason).toBeUndefined();
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
      ["rates", "coin"],
      ["conflicts", "sweep"],
      ["layout", "single"],
      ["marking", "real"],
      ["control", "closed"],
      ["syntax", "update"],
    ]);
    expect(controlOf(model, "rates")?.disabledReason).toBeUndefined();
    expect(controlOf(model, "marking")?.disabledReason).toBeUndefined();
    expect(controlOf(model, "control")?.disabledReason).toMatch(
      /controllable/u,
    );
  });

  it("fixes the shape, marking, control and syntax under clock rates and keeps the layout", () => {
    const model = targetHeaderControls(
      { ...defaults, rates: "clock", layout: "per-module", syntax: "update" },
      {
        ...stochastic,
        transitions: {
          Arrive: { outputs: { Waiting: null }, rate: 2, controllable: true },
        },
      },
    );
    expect(controlOf(model, "rates")).toMatchObject({ value: "clock" });
    expect(controlOf(model, "rates")?.disabledReason).toBeUndefined();
    expect(controlOf(model, "rates")?.items.map((item) => item.text)).toEqual([
      "Coin",
      "Clock",
    ]);
    expect(controlOf(model, "shape")).toMatchObject({
      value: "modular",
      disabledReason: "Clocks compose one module per transition and place",
    });
    expect(controlOf(model, "layout")).toMatchObject({ value: "per-module" });
    expect(controlOf(model, "layout")?.disabledReason).toBeUndefined();
    expect(controlOf(model, "marking")).toMatchObject({
      value: "int",
      disabledReason: "Clocks count whole tokens in Nat",
    });
    expect(controlOf(model, "control")).toMatchObject({
      disabledReason: "Clocks take no external choice",
    });
    expect(controlOf(model, "syntax")).toMatchObject({
      value: "next",
      disabledReason: "Clocks use next and flow",
    });
  });

  it("offers the rates of a stochastic net without colours or dynamics alone", () => {
    expect(
      controlOf(
        targetHeaderControls({ ...defaults, rates: "clock" }, plain),
        "rates",
      ),
    ).toMatchObject({
      value: "coin",
      disabledReason: "A plain net has no rates",
    });
    expect(
      controlOf(
        targetHeaderControls(
          { ...defaults, rates: "clock" },
          { ...coloured, kind: "stochastic" },
        ),
        "rates",
      ),
    ).toMatchObject({
      value: "coin",
      disabledReason: "A coloured net or one with dynamics takes coins",
    });
  });

  it("offers the conflicts of a net where two transitions share an input place, under either rates", () => {
    const open = controlOf(
      targetHeaderControls({ ...defaults, conflicts: "nondet" }, fork),
      "conflicts",
    );
    expect(open).toMatchObject({ value: "nondet" });
    expect(open?.disabledReason).toBeUndefined();
    expect(open?.items.map((item) => item.text)).toEqual(["Sweep", "Nondet"]);
    expect(
      controlOf(
        targetHeaderControls({ ...defaults, rates: "clock" }, fork),
        "conflicts",
      )?.disabledReason,
    ).toBeUndefined();
    expect(
      controlOf(targetHeaderControls(defaults, stochastic), "conflicts"),
    ).toMatchObject({
      value: "sweep",
      disabledReason:
        "Conflicts applies to a net where two transitions share an input place",
    });
  });

  it("fixes a plain net's marking to Int and offers control when a transition is controllable", () => {
    const model = targetHeaderControls(
      { ...defaults, marking: "int", control: "open" },
      plain,
    );
    expect(controlOf(model, "marking")).toMatchObject({
      value: "int",
      disabledReason: "A plain net's marking is always Int",
    });
    expect(controlOf(model, "control")).toMatchObject({ value: "open" });
    expect(controlOf(model, "control")?.disabledReason).toBeUndefined();
  });

  it("fixes a coloured net's marking to Real and offers its slots", () => {
    const model = targetHeaderControls(defaults, coloured);
    expect(model.slots).toBe(8);
    expect(controlOf(model, "marking")).toMatchObject({
      value: "real",
      disabledReason: "A coloured net or one with dynamics holds Reals",
    });
  });

  it("disables everything but the shape and the syntax while the net has not compiled", () => {
    const model = targetHeaderControls(defaults, null);
    expect(
      model.controls.map((control) => control.disabledReason !== undefined),
    ).toEqual([false, true, true, true, true, true, false]);
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
    expect(group.textContent).toContain("Rates");
    expect(group.textContent).toContain("Conflicts");
    expect(group.textContent).toContain("Layout");
    expect(group.textContent).toContain("Marking");
    expect(group.textContent).toContain("Control");
    expect(group.textContent).toContain("Syntax");
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
