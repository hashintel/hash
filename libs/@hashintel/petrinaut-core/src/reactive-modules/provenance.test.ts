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
    const python = emitReactiveModulePython(single.graph);
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
