import type { SDCPN } from "../core/types/sdcpn";

export const sirModel: { title: string; sdcpn: SDCPN } = {
  title: "SIR Epidemic Model",
  sdcpn: {
    places: [
      {
        id: "place__susceptible",
        name: "Susceptible",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -300,
        y: 0,
        width: 130,
        height: 130,
      },
      {
        id: "place__infected",
        name: "Infected",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
        width: 130,
        height: 130,
      },
      {
        id: "place__recovered",
        name: "Recovered",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 300,
        y: 0,
        width: 130,
        height: 130,
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
        lambdaCode: "export default Lambda(() => 0.3)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    Infected: [{}, {}],\n  };\n});",
        x: -150,
        y: 0,
        width: 160,
        height: 80,
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
        lambdaCode: "export default Lambda(() => 0.1)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    Recovered: [{}],\n  };\n});",
        x: 150,
        y: 0,
        width: 160,
        height: 80,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
};
