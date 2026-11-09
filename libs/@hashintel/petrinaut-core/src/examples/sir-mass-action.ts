import { GRID_SIZE } from "../grid-size";

import type { Scenario, SDCPN } from "../types/sdcpn";

/**
 * One scenario of the model: a population seeded with a few cases, and the
 * two rate constants.
 */
const outbreakScenario = ({
  id,
  name,
  description,
  population,
  initiallyInfected,
  beta,
  gamma,
}: {
  id: string;
  name: string;
  description: string;
  population: number;
  initiallyInfected: number;
  beta: string;
  gamma: string;
}): Scenario => ({
  id,
  name,
  description,
  scenarioParameters: [
    { type: "integer", identifier: "population", default: population },
    {
      type: "integer",
      identifier: "initially_infected",
      default: initiallyInfected,
    },
  ],
  parameterOverrides: { param__beta: beta, param__gamma: gamma },
  initialState: {
    type: "adhoc",
    content: {
      variables: [
        {
          name: "population",
          type: "integer",
          expression: String(population),
          exposed: true,
          optimize: null,
        },
        {
          name: "initially_infected",
          type: "integer",
          expression: String(initiallyInfected),
          exposed: true,
          optimize: null,
        },
      ],
      netParameters: [
        { parameterId: "param__beta", expression: beta, optimize: null },
        { parameterId: "param__gamma", expression: gamma, optimize: null },
      ],
      places: {
        place__susceptible: {
          kind: "uncoloured",
          count: {
            expression: "scenario.population - scenario.initially_infected",
            optimize: null,
          },
        },
        place__infected: {
          kind: "uncoloured",
          count: { expression: "scenario.initially_infected", optimize: null },
        },
        place__recovered: {
          kind: "uncoloured",
          count: { expression: "0", optimize: null },
        },
      },
    },
  },
});

/**
 * The SIR epidemic model with mass-action kinetics, as reaction networks
 * define it: each transition fires at a rate constant times the token counts
 * of its input places.
 *
 * - Infection, `S + I -> 2I`, fires at `beta * S * I`.
 * - Recovery, `I -> R`, fires at `gamma * I`.
 *
 * The rates read `input.<Place>.count`, so they follow the marking: infection
 * slows as susceptibles run out, and the wave grows only while
 * `beta * S / gamma > 1`. The basic reproduction number is
 * `R0 = beta * N / gamma` for a population of `N`.
 */
export const sirMassActionModel: { title: string; petriNetDefinition: SDCPN } =
  {
    title: "SIR Mass-Action Model",
    petriNetDefinition: {
      description:
        "Susceptible-Infected-Recovered epidemic with mass-action kinetics: infection fires at beta * S * I and recovery at gamma * I, read from the input places' token counts, as in a reaction network.",
      places: [
        {
          id: "place__susceptible",
          name: "Susceptible",
          description: "Individuals who can still catch the disease.",
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
          description: "Individuals carrying the disease and transmitting it.",
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
          description: "Individuals who have recovered and are immune.",
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
            "S + I -> 2I. Every susceptible-infected pair meets at rate beta, so the transition fires at beta * S * I.",
          inputArcs: [
            { placeId: "place__susceptible", weight: 1, type: "standard" },
            { placeId: "place__infected", weight: 1, type: "standard" },
          ],
          outputArcs: [{ placeId: "place__infected", weight: 2 }],
          lambdaType: "stochastic",
          lambdaCode: `// Mass action: beta times both input counts.
const susceptible = input.Susceptible.count;
const infected = input.Infected.count;
return parameters.beta * susceptible * infected;`,
          transitionKernelCode: "",
          x: -10 * GRID_SIZE,
          y: 5 * GRID_SIZE,
        },
        {
          id: "transition__recovery",
          name: "Recovery",
          description:
            "I -> R. Each infected individual recovers at rate gamma, so the transition fires at gamma * I.",
          inputArcs: [
            { placeId: "place__infected", weight: 1, type: "standard" },
          ],
          outputArcs: [{ placeId: "place__recovered", weight: 1 }],
          lambdaType: "stochastic",
          lambdaCode: `// Mass action: gamma times the infected count.
return parameters.gamma * input.Infected.count;`,
          transitionKernelCode: "",
          x: 6 * GRID_SIZE,
          y: 16 * GRID_SIZE,
        },
      ],
      types: [],
      differentialEquations: [],
      parameters: [
        {
          id: "param__beta",
          name: "Infection rate constant (beta)",
          variableName: "beta",
          type: "real",
          defaultValue: "0.003",
        },
        {
          id: "param__gamma",
          name: "Recovery rate constant (gamma)",
          variableName: "gamma",
          type: "real",
          defaultValue: "0.1",
        },
      ],
      scenarios: [
        outbreakScenario({
          id: "scenario__outbreak",
          name: "Outbreak",
          description:
            "R₀ = beta * N / gamma = 3 in a village of 100: a wave that infects most of the population.",
          population: 100,
          initiallyInfected: 5,
          beta: "0.003",
          gamma: "0.1",
        }),
        outbreakScenario({
          id: "scenario__below_threshold",
          name: "Below threshold",
          description:
            "R₀ = 0.8: each case infects fewer than one other, so the outbreak fades out.",
          population: 100,
          initiallyInfected: 5,
          beta: "0.0008",
          gamma: "0.1",
        }),
      ],
      metrics: [
        {
          id: "metric__infected",
          name: "Infected",
          description: "Individuals currently infected.",
          code: `return state.places.Infected.count;`,
        },
        {
          id: "metric__attack_rate",
          name: "Attack rate",
          description: "Share of the population infected so far.",
          code: `const s = state.places.Susceptible.count;
const total = s + state.places.Infected.count + state.places.Recovered.count;
return total === 0 ? 0 : 1 - s / total;`,
        },
      ],
    },
  };
