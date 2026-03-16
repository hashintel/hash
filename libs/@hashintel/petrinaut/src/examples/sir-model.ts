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
        x: -375,
        y: 135,
      },
      {
        id: "place__infected",
        name: "Infected",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -195,
        y: 285,
      },
      {
        id: "place__recovered",
        name: "Recovered",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 315,
        y: 120,
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
          },
          {
            placeId: "place__infected",
            weight: 1,
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
        x: -165,
        y: 75,
      },
      {
        id: "transition__recovery",
        name: "Recovery",
        inputArcs: [
          {
            placeId: "place__infected",
            weight: 1,
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
        x: 75,
        y: 225,
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
  },
};
