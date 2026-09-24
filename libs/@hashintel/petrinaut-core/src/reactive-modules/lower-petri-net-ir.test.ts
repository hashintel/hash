import { describe, expect, it } from "vitest";

import {
  interpretReactiveModuleGraph,
  orderReactiveModules,
  type ReactiveValue,
} from "./interpret-reactive-module-graph";
import { lowerPetriNetIr } from "./lower-petri-net-ir";
import {
  type PetriNetIr,
  type PetriNetIrArcs,
  petriNetIrArcWeight,
  resolveZerothTarget,
  type ZerothTarget,
} from "./petri-net-ir";
import { moduleAwaits } from "./reactive-module-graph";

const MODULUS = 2 ** 32;

/** A small deterministic generator, so a failure names the net that broke. */
const createRandom = (seed: number) => {
  let state = seed % MODULUS;
  const unit = (): number => {
    state = (state * 1664525 + 1013904223) % MODULUS;
    return state / MODULUS;
  };
  return {
    unit,
    int: (min: number, max: number): number =>
      min + Math.floor(unit() * (max - min + 1)),
    chance: (probability: number): boolean => unit() < probability,
  };
};

const randomArcs = (
  random: ReturnType<typeof createRandom>,
  places: string[],
  count: number,
): PetriNetIrArcs => {
  const arcs: PetriNetIrArcs = {};
  for (let i = 0; i < count; i++) {
    const place = places[random.int(0, places.length - 1)];
    if (place !== undefined) {
      const weight = random.int(1, 2);
      arcs[place] = weight === 1 ? null : { weight };
    }
  }
  return arcs;
};

const randomNet = (seed: number, stochastic: boolean): PetriNetIr => {
  const random = createRandom(seed);
  const placeNames = ["A", "B", "C", "D", "E"].slice(0, random.int(2, 5));
  const places: PetriNetIr["places"] = {};
  const marking: Record<string, number> = {};
  for (const name of placeNames) {
    const initial = random.int(0, 3);
    if (initial > 0) {
      marking[name] = initial;
    }
    places[name] = random.chance(0.4)
      ? { capacity: initial + random.int(0, 2) }
      : null;
  }
  const transitions: PetriNetIr["transitions"] = {};
  const count = random.int(1, 5);
  for (let i = 0; i < count; i++) {
    transitions[`T${i}`] = {
      ...(random.chance(0.85)
        ? { inputs: randomArcs(random, placeNames, random.int(1, 2)) }
        : {}),
      ...(random.chance(0.85)
        ? { outputs: randomArcs(random, placeNames, random.int(1, 2)) }
        : {}),
      ...(stochastic ? { rate: 0.5 + random.unit() * 3 } : {}),
      ...(random.chance(0.3) ? { controllable: true as const } : {}),
    };
  }
  return {
    name: `net${seed}`,
    kind: stochastic ? "stochastic" : "plain",
    places,
    ...(Object.keys(marking).length === 0 ? {} : { marking }),
    transitions,
  };
};

/**
 * One Petrinaut step over the IR, as the engine takes it: transitions in
 * order, enablement on the current count, capacity on count plus pending
 * plus the net change, consumption at once, production at the end.
 */
const referenceStep = (
  ir: PetriNetIr,
  marking: Record<string, number>,
  inputs: (name: string) => ReactiveValue,
): Record<string, number> => {
  const target = resolveZerothTarget(ir.zeroth);
  const count = { ...marking };
  const pending: Record<string, number> = {};
  for (const [name, transition] of Object.entries(ir.transitions)) {
    const consumes = Object.entries(transition.inputs ?? {}).map(
      ([place, arc]) => [place, petriNetIrArcWeight(arc)] as const,
    );
    const produces = Object.entries(transition.outputs ?? {}).map(
      ([place, arc]) => [place, petriNetIrArcWeight(arc)] as const,
    );
    const deltas: Record<string, number> = {};
    for (const [place, weight] of produces) {
      deltas[place] = (deltas[place] ?? 0) + weight;
    }
    for (const [place, weight] of consumes) {
      deltas[place] = (deltas[place] ?? 0) - weight;
    }
    let enabled = consumes.every(
      ([place, weight]) => (count[place] ?? 0) >= weight,
    );
    for (const [place, delta] of Object.entries(deltas)) {
      const capacity = ir.places[place]?.capacity;
      if (delta > 0 && capacity !== undefined) {
        enabled &&=
          (count[place] ?? 0) + (pending[place] ?? 0) + delta <= capacity;
      }
    }
    if (ir.kind === "stochastic") {
      const draw = inputs(`u_${name}`);
      enabled &&=
        typeof draw === "number" &&
        draw >= Math.exp(-(transition.rate ?? 0) * target.dt);
    }
    if (transition.controllable === true && target.control === "open") {
      enabled &&= inputs(`go_${name}`) === true;
    }
    if (!enabled) {
      continue;
    }
    for (const [place, weight] of consumes) {
      count[place] = (count[place] ?? 0) - weight;
    }
    for (const [place, weight] of produces) {
      pending[place] = (pending[place] ?? 0) + weight;
    }
  }
  for (const place of Object.keys(ir.places)) {
    count[place] = (count[place] ?? 0) + (pending[place] ?? 0);
  }
  return count;
};

const hash = (text: string): number => {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) % MODULUS;
  }
  return value;
};

/** One value per input name and step, the same for every shape of a net. */
const inputsFor =
  (seed: number) =>
  (step: number, name: string): ReactiveValue => {
    const random = createRandom(seed * 7919 + step * 104729 + hash(name));
    // The first draw of a plain LCG barely moves; skip it.
    random.unit();
    return name.startsWith("go_") ? random.chance(0.6) : random.unit();
  };

const placesOnly = (
  values: Record<string, ReactiveValue>,
  ir: PetriNetIr,
): Record<string, number> =>
  Object.fromEntries(
    Object.keys(ir.places).map((place) => [place, Number(values[place])]),
  );

const TARGETS: ZerothTarget[] = [
  {},
  { shape: "modular" },
  { marking: "int" },
  { shape: "modular", marking: "int" },
  { control: "open" },
  { shape: "modular", control: "open", marking: "int", dt: 0.25 },
];

const STEPS = 25;

describe("lowerPetriNetIr", () => {
  it("gives every shape the trajectory of a Petrinaut step, on random nets", () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const stochastic of [false, true]) {
        for (const zeroth of TARGETS) {
          const ir: PetriNetIr = { ...randomNet(seed, stochastic), zeroth };
          const inputs = inputsFor(seed);
          const expected: Record<string, number>[] = [
            Object.fromEntries(
              Object.keys(ir.places).map((place) => [
                place,
                ir.marking?.[place] ?? 0,
              ]),
            ),
          ];
          for (let step = 1; step <= STEPS; step++) {
            expected.push(
              referenceStep(ir, expected[step - 1] ?? {}, (name) =>
                inputs(step, name),
              ),
            );
          }
          const trace = interpretReactiveModuleGraph(lowerPetriNetIr(ir), {
            steps: STEPS,
            inputs,
          }).map((values) => placesOnly(values, ir));
          expect(
            trace,
            `seed ${seed} ${ir.kind} ${JSON.stringify(zeroth)}`,
          ).toEqual(expected);
        }
      }
    }
  });

  it("lets a transition module read its places latched and await only earlier transitions", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const ir: PetriNetIr = {
        ...randomNet(seed, seed % 2 === 0),
        zeroth: { shape: "modular", marking: "int" },
      };
      const graph = lowerPetriNetIr(ir);
      const transitions = Object.keys(ir.transitions);
      for (const module of graph.modules) {
        if (!module.className.startsWith("Transition_")) {
          continue;
        }
        const own = transitions.indexOf(
          module.className.slice("Transition_".length),
        );
        for (const awaited of moduleAwaits(module)) {
          if (awaited.startsWith("fire_")) {
            const other = transitions.indexOf(awaited.slice("fire_".length));
            expect(other, `${module.className} awaits ${awaited}`).toBeLessThan(
              own,
            );
          } else {
            expect(awaited).toMatch(/^(hit|go|u)_/u);
          }
        }
      }
      // Kahn's sort accepts it, as composition would.
      expect(orderReactiveModules(graph)).toHaveLength(graph.modules.length);
    }
  });

  it("drives every place and flag from exactly one module", () => {
    const graph = lowerPetriNetIr({
      ...randomNet(3, true),
      zeroth: { shape: "modular", marking: "int", control: "open" },
    });
    const drivers = new Map<string, number>();
    for (const module of graph.modules) {
      for (const name of module.ctrl) {
        drivers.set(name, (drivers.get(name) ?? 0) + 1);
      }
    }
    for (const variable of graph.variables) {
      expect(drivers.get(variable.name) ?? 0).toBe(
        variable.role === "input" ? 0 : 1,
      );
    }
  });
});
