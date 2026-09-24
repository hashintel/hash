import { describe, expect, it } from "vitest";

import { emitReactiveModulePython } from "./emit-reactive-module-python";
import { renderPetriNetIr } from "./petri-net-ir";
import { compilePetriNetIr } from "./petri-net-ir-to-reactive-module";
import {
  provenanceAt,
  tracePetriNetIr,
  traceReactiveModulePython,
} from "./provenance";

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

describe("traceReactiveModulePython", () => {
  const outcome = compilePetriNetIr(queue);
  if (!outcome.ok) {
    throw new Error("expected the queue to compile");
  }
  const text = emitReactiveModulePython(outcome.graph);
  const trace = traceReactiveModulePython(outcome.graph, queue, text);

  it("describes variables, modules, methods, statements and the system", () => {
    expect(
      provenanceAt(trace, lineOf(text, "fire_Serve = Var(")),
    ).toMatchObject({
      what: "Serve fires this step",
      source: { kind: "transition", name: "Serve" },
    });
    expect(provenanceAt(trace, lineOf(text, "u_Arrive = Var("))).toMatchObject({
      what: "Uniform draw for Arrive, each step",
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

  it("returns null off every range", () => {
    expect(provenanceAt([], 3)).toBeNull();
  });
});
