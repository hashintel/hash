import { describe, expect, it } from "vitest";

import { renderPetriNetIr } from "./petri-net-ir";
import { compilePetriNetIr } from "./petri-net-ir-to-reactive-module";
import {
  provenanceAt,
  tracePetriNetIr,
  traceReactiveModulePython,
} from "./provenance";
import { birthDeathIr } from "./shared/birth-death.fixtures";
import { forkClockedIr, forkIr } from "./shared/fork.fixtures";

import type { PetriNetIr } from "./petri-net-ir";

const queue: PetriNetIr = {
  name: "queue",
  kind: "stochastic",
  places: { Waiting: null, Served: { capacity: 5 } },
  marking: { Waiting: 2 },
  transitions: {
    Arrive: { outputs: { Waiting: null }, rate: 2 },
    Serve: {
      inputs: { Waiting: { weight: 2 } },
      outputs: { Served: null },
      rate: 1.5,
      controllable: true,
    },
  },
  zeroth: { shape: "modular", dt: 0.5 },
};

const lineOf = (text: string, needle: string): number => {
  const index = text.split("\n").findIndex((line) => line.includes(needle));
  if (index === -1) {
    throw new Error(`no line contains ${needle}`);
  }
  return index + 1;
};

describe("tracePetriNetIr", () => {
  const text = renderPetriNetIr(queue);
  const trace = tracePetriNetIr(queue, text);

  it("describes a transition, its fields and its arcs from the innermost range", () => {
    expect(provenanceAt(trace, lineOf(text, "  Serve:"))).toEqual({
      what: "Transition Serve",
      why: "takes from Waiting; adds to Served; fires at rate 1.5, tested over dt each step; controllable.",
      ir: "transitions.Serve",
      source: { kind: "transition", name: "Serve" },
    });
    expect(provenanceAt(trace, lineOf(text, "    rate: 1.5"))).toMatchObject({
      what: "Serve's firing rate",
      ir: "transitions.Serve.rate",
    });
    expect(
      provenanceAt(trace, lineOf(text, "        weight: 2")),
    ).toMatchObject({
      what: "Arc from Waiting into Serve: 2 tokens",
      ir: "transitions.Serve.inputs.Waiting",
      source: { kind: "place", name: "Waiting" },
    });
  });

  it("describes places, the marking, the kind and the flags", () => {
    expect(provenanceAt(trace, lineOf(text, "  Served:"))).toMatchObject({
      what: "Place Served",
      why: "starts empty; holds at most 5.",
      source: { kind: "place", name: "Served" },
    });
    expect(provenanceAt(trace, lineOf(text, "  Waiting: 2"))).toMatchObject({
      what: "Initial tokens of Waiting",
      ir: "marking.Waiting",
    });
    expect(provenanceAt(trace, lineOf(text, "kind: stochastic"))).toMatchObject(
      {
        what: "A stochastic net",
      },
    );
    expect(provenanceAt(trace, lineOf(text, "  shape: modular"))).toMatchObject(
      {
        ir: "zeroth.shape",
      },
    );
    expect(provenanceAt(trace, lineOf(text, "places:"))?.what).toBe(
      "The places, in the order the net lists them",
    );
  });
});

describe("tracePetriNetIr quoting", () => {
  it("reads a key the dumper quotes", () => {
    const toggle: PetriNetIr = {
      name: "toggle",
      kind: "stochastic",
      places: { On: null, Off: null },
      marking: { On: 1 },
      transitions: {
        Flip: { inputs: { On: null }, outputs: { Off: null }, rate: 1 },
      },
    };
    const text = renderPetriNetIr(toggle);
    expect(text).toContain("  'On':");
    const trace = tracePetriNetIr(toggle, text);
    expect(provenanceAt(trace, lineOf(text, "  'On':"))).toMatchObject({
      what: "Place On",
      ir: "places.On",
      source: { kind: "place", name: "On" },
    });
  });

  it("reads the lines of a block scalar as text, not as keys", () => {
    const text = renderPetriNetIr(queue).replace(
      "    rate: 1.5\n",
      "    rate: 1.5\n    kernel: |\n      Air: 1\n      Waiting: 2\n",
    );
    const trace = tracePetriNetIr(queue, text);
    const kernel = provenanceAt(trace, lineOf(text, "    kernel: |"));
    expect(provenanceAt(trace, lineOf(text, "      Air: 1"))).toEqual(kernel);
    expect(provenanceAt(trace, lineOf(text, "      Waiting: 2"))).toEqual(
      kernel,
    );
  });
});

describe("traceReactiveModulePython", () => {
  const outcome = compilePetriNetIr(queue);
  if (!outcome.ok) {
    throw new Error("expected the queue to compile");
  }
  const text = outcome.python;
  const trace = traceReactiveModulePython(outcome.graph, queue, text);

  it("describes variables, modules, methods, statements and the system", () => {
    expect(
      provenanceAt(trace, lineOf(text, "fire_Serve = Var(")),
    ).toMatchObject({
      what: "Serve fires this step",
      source: { kind: "transition", name: "Serve" },
    });
    expect(provenanceAt(trace, lineOf(text, "u_Arrive = Var("))).toEqual({
      what: "Uniform draw for Arrive, each step",
      why: "An input the harness writes; the transition fires when the draw is at least e^(-rate·dt).",
      source: { kind: "transition", name: "Arrive" },
    });
    expect(provenanceAt(trace, lineOf(text, "Waiting = Var("))).toMatchObject({
      what: "The tokens in Waiting",
      ir: "places.Waiting",
      source: { kind: "place", name: "Waiting" },
    });
    expect(
      provenanceAt(trace, lineOf(text, "class Place_Waiting(Module):")),
    ).toMatchObject({
      what: "The module of place Waiting",
      source: { kind: "place", name: "Waiting" },
    });
    const dedent = provenanceAt(
      trace,
      lineOf(text, "    def update(self, Waiting"),
    );
    expect(dedent?.what).toBe(
      "One Petrinaut step: the statements, then the next values",
    );
    const statement = lineOf(text, "        Waiting = ite(");
    expect(provenanceAt(trace, statement)).toMatchObject({
      what: "Sets the tokens in Waiting",
      source: { kind: "place", name: "Waiting" },
    });
    expect(provenanceAt(trace, lineOf(text, "net = compose("))).toMatchObject({
      what: "The system",
      source: { kind: "net", name: "queue" },
    });
    expect(
      provenanceAt(trace, lineOf(text, "place_Waiting = Place_Waiting(")),
    ).toMatchObject({
      what: "An instance of Place_Waiting in the LRA theory",
    });
  });

  it("drops a lone read's comma", () => {
    expect(
      provenanceAt(trace, lineOf(text, "place_Served = Place_Served("))?.why,
    ).toBe("Drives Served and reads fire_Serve.");
  });

  it("reads the monolithic net as the system and keeps a name's case", () => {
    const single = compilePetriNetIr({
      ...queue,
      zeroth: { shape: "monolithic", dt: 0.5 },
    });
    if (!single.ok) {
      throw new Error("expected the monolithic queue to compile");
    }
    const python = single.python;
    const singleTrace = traceReactiveModulePython(single.graph, queue, python);
    expect(provenanceAt(singleTrace, lineOf(python, "net = "))).toMatchObject({
      what: "The system",
      why: "The one module, driving every place.",
    });
    expect(
      provenanceAt(singleTrace, lineOf(python, "        fire_Serve = "))?.what,
    ).toBe("Sets fire_Serve: Serve fires this step");
  });

  it("returns null off every range", () => {
    expect(provenanceAt([], 3)).toBeNull();
  });
});

describe("provenance under conflicts nondet", () => {
  const pick = {
    what: "The environment lets TakeLeft fire this step",
    why: "An input nothing drives: any resolution of the conflict is a run, and a proof ranges over all of them.",
    source: { kind: "transition", name: "TakeLeft" },
  };

  it("describes the flag in the IR and the pick in the coin module", () => {
    const open: PetriNetIr = { ...forkIr, zeroth: { conflicts: "nondet" } };
    const irText = renderPetriNetIr(open);
    expect(
      provenanceAt(
        tracePetriNetIr(open, irText),
        lineOf(irText, "  conflicts: nondet"),
      ),
    ).toEqual({
      what: "The conflicts flag: transitions sharing an input place fire in sweep order, or each waits for a pick nothing drives",
      ir: "zeroth.conflicts",
    });
    const outcome = compilePetriNetIr(open);
    if (!outcome.ok) {
      throw new Error("expected the fork to compile");
    }
    const text = outcome.python;
    const trace = traceReactiveModulePython(outcome.graph, open, text);
    expect(
      provenanceAt(trace, lineOf(text, "pick_TakeLeft = Var(BOOL)")),
    ).toEqual(pick);
    expect(
      provenanceAt(trace, lineOf(text, "        fire_TakeLeft = "))?.what,
    ).toBe("Sets fire_TakeLeft: TakeLeft fires this step");
  });

  it("describes the pick's Bool declaration and instance under clock rates", () => {
    const outcome = compilePetriNetIr(forkClockedIr);
    if (!outcome.ok) {
      throw new Error("expected the clocked fork to compile");
    }
    const text = outcome.python;
    const trace = traceReactiveModulePython(outcome.graph, forkClockedIr, text);
    expect(
      provenanceAt(trace, lineOf(text, "pick_TakeLeft = Var(Bool([1, 1]))")),
    ).toEqual(pick);
    expect(
      provenanceAt(
        trace,
        lineOf(text, "transition_TakeLeft = Transition_TakeLeft("),
      )?.why,
    ).toBe(
      "Drives clk_TakeLeft, ev_TakeLeft and reads Pool, pick_TakeLeft, t.",
    );
  });
});

describe("traceReactiveModulePython under clock rates", () => {
  const outcome = compilePetriNetIr(birthDeathIr);
  if (!outcome.ok) {
    throw new Error("expected the birth-death net to compile");
  }
  const text = outcome.python;
  const trace = traceReactiveModulePython(outcome.graph, birthDeathIr, text);
  const irText = renderPetriNetIr(birthDeathIr);
  const irTrace = tracePetriNetIr(birthDeathIr, irText);

  it("describes the time reference, the clocks, the events and their locals", () => {
    expect(provenanceAt(trace, lineOf(text, "t = Var(Clock())"))).toEqual({
      what: "The time reference",
      why: "External and driven by nothing: a clock's flow is a rate against d(t), so a module that reads it awaits t.",
    });
    expect(provenanceAt(trace, lineOf(text, "clk_Birth = Var("))).toMatchObject(
      {
        what: "Time left until Birth fires",
        source: { kind: "transition", name: "Birth" },
      },
    );
    expect(provenanceAt(trace, lineOf(text, "ev_Death = Var("))).toMatchObject({
      what: "Toggles when Death fires",
      source: { kind: "transition", name: "Death" },
    });
    expect(
      provenanceAt(trace, lineOf(text, "Population = Var(Nat())")),
    ).toMatchObject({ what: "The tokens in Population" });
    expect(
      provenanceAt(trace, lineOf(text, "        fires_Birth = "))?.what,
    ).toBe("Sets fires_Birth: Birth's clock ran out and its arcs allow it");
    expect(
      provenanceAt(trace, lineOf(text, "        fired_Death = ")),
    ).toMatchObject({
      what: "Sets fired_Death: Death fired this step",
      source: { kind: "transition", name: "Death" },
    });
  });

  it("describes the methods, their returns, the instances and the hidden clocks", () => {
    expect(
      provenanceAt(trace, lineOf(text, "    def next(self, clk_Birth")),
    ).toMatchObject({
      what: "A firing: the statements, then the next values",
    });
    expect(
      provenanceAt(trace, lineOf(text, "    def flow(self, clk_Birth")),
    ).toEqual({
      what: "The tangents between firings, one per driven variable",
      why: "A clock counts down against t while its transition is enabled; None leaves an event still.",
    });
    expect(
      provenanceAt(trace, lineOf(text, "        return if_then(clk_Birth >= 0"))
        ?.what,
    ).toBe("The tangents, one per driven variable, None where it has no flow");
    expect(
      provenanceAt(trace, lineOf(text, "        return exp(2.0), False"))?.what,
    ).toBe("The initial values, one per driven variable");
    expect(
      provenanceAt(trace, lineOf(text, "class Transition_Birth(Module):")),
    ).toMatchObject({
      what: "The module of transition Birth",
      why: "Birth: nothing -> Population, at rate 2",
    });
    expect(
      provenanceAt(trace, lineOf(text, "transition_Birth = Transition_Birth("))
        ?.why,
    ).toBe("Drives clk_Birth, ev_Birth and reads t.");
    expect(
      provenanceAt(trace, lineOf(text, "    hide={clk_Birth, clk_Death},")),
    ).toMatchObject({
      what: "The clocks kept private",
      source: { kind: "net", name: "birth_death" },
    });
    expect(provenanceAt(trace, lineOf(text, "net = compose("))).toMatchObject({
      what: "The system",
      why: "Every module composed: a variable one module drives is awaited by the others, in an order the awaits allow.",
    });
  });

  it("describes the rates flag and a rate as a clock in the IR", () => {
    expect(provenanceAt(irTrace, lineOf(irText, "  rates: clock"))).toEqual({
      what: "The rates flag: a rate as a coin tested each step over dt, or as a clock armed with exp(rate) in continuous time",
      ir: "zeroth.rates",
    });
    expect(provenanceAt(irTrace, lineOf(irText, "    rate: 2"))).toMatchObject({
      what: "Birth's firing rate",
      why: "Arms an exponential clock with this rate when the transition fires.",
    });
    expect(provenanceAt(irTrace, lineOf(irText, "  Death:"))?.why).toBe(
      "takes from Population; adds nothing; fires at rate 1, a clock armed with exp(1) each time it fires.",
    );
    expect(provenanceAt(irTrace, lineOf(irText, "kind: stochastic"))?.why).toBe(
      "Every transition has a rate; each arms an exponential clock and fires when it expires.",
    );
  });
});
