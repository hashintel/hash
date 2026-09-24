import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Birth–Death Process — the smallest stochastic net with a live population:
 * one place, one transition that adds to it, one that takes from it.
 *
 * Birth is a source transition that adds one token to Population at
 * `birth_rate`, whatever the population is; Death takes one token from
 * Population at `death_rate` and is enabled only while a token remains. With
 * the default rates (two births per death) the population grows at about one
 * token per unit of time; equal rates make it a random walk that keeps
 * returning to zero.
 *
 * It mirrors `birth_death.py` in Zeroth's reactive-modules repository, a
 * birth–death process written by hand as three modules, so the module the
 * Zeroth Reactive Modules window compiles from this net can be read beside it.
 *
 * GPU-ready as shipped: the place is uncoloured, no code touches strings, and
 * the token count is the observable. Bounded for the default rates: Population
 * grows at ≈1 token per unit of time from 0, so it stays below 200 for maxTime
 * up to 120 at dt 0.1.
 */
export const birthDeath: { title: string; petriNetDefinition: SDCPN } = {
  title: "Birth–Death Process",
  petriNetDefinition: {
    description:
      "A birth–death process: births add to the population at a fixed rate, and each death removes one member at a fixed rate while any remain. Two births per death makes the population grow; equal rates make it a random walk from zero.",
    places: [
      {
        id: "place__population",
        name: "Population",
        description:
          "The living population. Birth feeds it and Death drains it one token at a time.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 8 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__birth",
        name: "Birth",
        description:
          "Source transition with no inputs: adds one member to Population at birth_rate whatever the population is.",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place__population",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Births arrive at the configured rate. The transition has no input arcs,
// so it is a source: it is always enabled and feeds Population.
export default Lambda((tokens, parameters) => parameters.birth_rate)`,
        transitionKernelCode: `// Add one member to the population. The place is untyped, so tokens carry
// no attributes.
export default TransitionKernel(() => {
  return {
    Population: [{}],
  };
});`,
        x: -14 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
      {
        id: "transition__death",
        name: "Death",
        description:
          "Takes one member from Population at death_rate; the input arc keeps it disabled while the population is empty.",
        inputArcs: [
          {
            placeId: "place__population",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [],
        lambdaType: "stochastic",
        lambdaCode: `// Each death happens at the configured rate, and only while the input arc
// finds a member of the population to take.
export default Lambda((tokens, parameters) => parameters.death_rate)`,
        transitionKernelCode: `// The member leaves: the token is consumed and nothing is produced.
export default TransitionKernel(() => {
  return {};
});`,
        x: 14 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__birth_rate",
        name: "Birth Rate",
        variableName: "birth_rate",
        type: "real",
        defaultValue: "2",
      },
      {
        id: "param__death_rate",
        name: "Death Rate",
        variableName: "death_rate",
        type: "real",
        defaultValue: "1",
      },
    ],
    scenarios: [
      {
        id: "scenario__two_births_per_death",
        name: "Two births per death",
        description:
          "An empty population with births at 2 and deaths at 1. Sweep death_rate against birth_rate to find where the population stops growing.",
        scenarioParameters: [
          { type: "real", identifier: "birth_rate", default: 2 },
          { type: "real", identifier: "death_rate", default: 1 },
        ],
        parameterOverrides: {
          param__birth_rate: "scenario.birth_rate",
          param__death_rate: "scenario.death_rate",
        },
        initialState: {
          type: "adhoc",
          content: {
            variables: [
              {
                name: "birth_rate",
                type: "real",
                expression: "2",
                exposed: true,
                optimize: null,
              },
              {
                name: "death_rate",
                type: "real",
                expression: "1",
                exposed: true,
                optimize: null,
              },
            ],
            netParameters: [
              {
                parameterId: "param__birth_rate",
                expression: "scenario.birth_rate",
                optimize: null,
              },
              {
                parameterId: "param__death_rate",
                expression: "scenario.death_rate",
                optimize: null,
              },
            ],
            places: {
              place__population: {
                kind: "uncoloured",
                count: { expression: "0", optimize: null },
              },
            },
          },
        },
      },
    ],
  },
};
