import { SNAP_GRID_SIZE } from "../constants/ui";
import type { SDCPN } from "../core/types/sdcpn";

export const sirModel: { title: string; petriNetDefinition: SDCPN } = {
  title: "SIR Epidemic Model",
  petriNetDefinition: {
    places: [
      {
        id: "place__susceptible",
        name: "Susceptible",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -29 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__infected",
        name: "Infected",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -13 * SNAP_GRID_SIZE,
        y: 19 * SNAP_GRID_SIZE,
      },
      {
        id: "place__recovered",
        name: "Recovered",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 25 * SNAP_GRID_SIZE,
        y: 13 * SNAP_GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__infection",
        name: "Infection",
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
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.infection_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    Infected: [{}, {}],\n  };\n});",
        x: -10 * SNAP_GRID_SIZE,
        y: 5 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__recovery",
        name: "Recovery",
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
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.recovery_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    Recovered: [{}],\n  };\n});",
        x: 6 * SNAP_GRID_SIZE,
        y: 16 * SNAP_GRID_SIZE,
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
    ],
  },
};
