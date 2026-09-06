import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Susceptible-Infected-Recovered (SIR) compartmental epidemic model, expressed
 * as a stochastic Petri net.
 *
 * The Infection transition consumes one Susceptible and one Infected and
 * produces two Infected tokens (arc weight 2), reproducing the mass-action
 * `S + I -> 2I` dynamics; Recovery moves Infected to Recovered. Firing rates are
 * driven by the `infection_rate` and `recovery_rate` global parameters, so the
 * basic reproduction number can be explored by changing parameters alone.
 *
 * This is the simplest built-in example and a good introduction to stochastic
 * firing and global parameters. See `docs/examples.md` for suggested initial
 * state and walkthrough.
 */
export const sirModel: { title: string; petriNetDefinition: SDCPN } = {
  title: "SIR Epidemic Model",
  petriNetDefinition: {
    description:
      "Susceptible-Infected-Recovered (SIR) compartmental epidemic model as a stochastic Petri net. Infection follows mass-action S + I -> 2I dynamics; the infection and recovery rates are global parameters, so R0 can be explored by changing parameters alone.",
    places: [
      {
        id: "place__susceptible",
        name: "Susceptible",
        description:
          "Individuals who have not yet caught the disease and can be infected by contact with an infected individual.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -29 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
      {
        id: "place__infected",
        name: "Infected",
        description:
          "Individuals currently carrying the disease and able to transmit it to susceptible contacts.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -13 * GRID_SIZE,
        y: 19 * GRID_SIZE,
      },
      {
        id: "place__recovered",
        name: "Recovered",
        description:
          "Individuals who have recovered and are immune; they never return to the susceptible or infected pools.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 25 * GRID_SIZE,
        y: 13 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__infection",
        name: "Infection",
        description:
          "Contact between a susceptible and an infected individual infects the susceptible: consumes one of each and produces two infected (S + I -> 2I), firing at the infection_rate parameter.",
        inputArcs: [
          {
            placeId: "place__susceptible",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place__infected",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__infected",
            weight: 2,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Mass-action infection: fires at the configured infection rate whenever a
// Susceptible and an Infected are both present (the two standard input arcs).
return parameters.infection_rate;`,
        transitionKernelCode: `// Consumes 1 Susceptible + 1 Infected and produces 2 Infected (the output
// arc has weight 2), encoding the S + I -> 2I reaction: the susceptible has
// become newly infected. Places are untyped, so tokens carry no attributes.
return {
  Infected: [{}, {}],
};`,
        x: -10 * GRID_SIZE,
        y: 5 * GRID_SIZE,
      },
      {
        id: "transition__recovery",
        name: "Recovery",
        description:
          "An infected individual recovers and becomes immune, moving to Recovered at the recovery_rate parameter.",
        inputArcs: [
          {
            placeId: "place__infected",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__recovered",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Each Infected recovers at the configured recovery rate. The ratio of
// infection_rate to recovery_rate sets the basic reproduction number R0.
return parameters.recovery_rate;`,
        transitionKernelCode: `// Move one Infected to Recovered (1-to-1). Recovered individuals are immune,
// so they never re-enter the Susceptible or Infected places.
return {
  Recovered: [{}],
};`,
        x: 6 * GRID_SIZE,
        y: 16 * GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__infection_rate",
        name: "Infection Rate",
        variableName: "infection_rate",
        type: "real",
        defaultValue: "3",
      },
      {
        id: "param__recovery_rate",
        name: "Recovery Rate",
        variableName: "recovery_rate",
        type: "real",
        defaultValue: "1",
      },
    ],
    scenarios: [
      {
        id: "scenario__seasonal_flu",
        name: "Seasonal Flu",
        description:
          "Moderate outbreak with R₀ ≈ 1.5. Models a typical seasonal influenza wave in a small community.",
        scenarioParameters: [
          { type: "integer", identifier: "population", default: 1000 },
          { type: "ratio", identifier: "infected_ratio", default: 0.01 },
        ],
        parameterOverrides: {
          param__infection_rate: "1.5",
          param__recovery_rate: "0.8",
        },
        initialState: {
          type: "per_place",
          content: {
            place__susceptible:
              "scenario.population * (1 - scenario.infected_ratio)",
            place__infected: "scenario.population * scenario.infected_ratio",
            place__recovered: "0",
          },
        },
      },
      {
        id: "scenario__high_virulence",
        name: "High Virulence Outbreak",
        description:
          "Aggressive pathogen with R₀ ≈ 6 and slow recovery, modelling rapid spread before interventions.",
        scenarioParameters: [
          { type: "integer", identifier: "population", default: 10000 },
          { type: "ratio", identifier: "infected_ratio", default: 0.0001 },
        ],
        parameterOverrides: {
          param__infection_rate: "6",
          param__recovery_rate: "0.5",
        },
        initialState: {
          type: "per_place",
          content: {
            place__susceptible:
              "scenario.population * (1 - scenario.infected_ratio)",
            place__infected: "scenario.population * scenario.infected_ratio",
            place__recovered: "0",
          },
        },
      },
      {
        id: "scenario__contained_outbreak",
        name: "Contained Outbreak",
        description:
          "Sub-threshold spread with R₀ < 1 (recovery outpaces infection), so the outbreak fizzles out instead of taking off.",
        scenarioParameters: [
          { type: "integer", identifier: "population", default: 1000 },
          { type: "ratio", identifier: "infected_ratio", default: 0.05 },
        ],
        parameterOverrides: {
          param__infection_rate: "0.6",
          param__recovery_rate: "1.2",
        },
        initialState: {
          type: "per_place",
          content: {
            place__susceptible:
              "scenario.population * (1 - scenario.infected_ratio)",
            place__infected: "scenario.population * scenario.infected_ratio",
            place__recovered: "0",
          },
        },
      },
      {
        id: "scenario__pandemic_wave",
        name: "Pandemic Wave",
        description:
          "A large, mostly-susceptible population seeded with a few cases and R₀ ≈ 5 — useful for watching the classic epidemic curve build and burn out at scale.",
        scenarioParameters: [
          { type: "integer", identifier: "population", default: 100000 },
          { type: "ratio", identifier: "infected_ratio", default: 0.00005 },
        ],
        parameterOverrides: {
          param__infection_rate: "2.5",
          param__recovery_rate: "0.5",
        },
        initialState: {
          type: "per_place",
          content: {
            place__susceptible:
              "scenario.population * (1 - scenario.infected_ratio)",
            place__infected: "scenario.population * scenario.infected_ratio",
            place__recovered: "0",
          },
        },
      },
    ],
    metrics: [
      {
        id: "metric__infected_fraction",
        name: "Infected Fraction",
        description: "Share of the population currently infected.",
        code: `const s = state.places.Susceptible.count;
const i = state.places.Infected.count;
const r = state.places.Recovered.count;
const total = s + i + r;
return total === 0 ? 0 : i / total;`,
      },
    ],
  },
};
