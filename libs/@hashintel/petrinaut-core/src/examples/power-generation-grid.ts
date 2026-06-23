import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const GS = GRID_SIZE;

export const powerGenerationGridSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Power Generation Grid",
  petriNetDefinition: {
    places: [
      {
        id: "root__fuel_reserve",
        name: "Fuel Reserve",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -22 * GS,
        y: 5 * GS,
      },
      {
        id: "root__electricity_grid",
        name: "Electricity Grid",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 22 * GS,
        y: 5 * GS,
      },
      {
        id: "root__consumed_power",
        name: "Consumed Power",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 30 * GS,
        y: 5 * GS,
      },
    ],
    transitions: [
      {
        id: "root__feed_coal",
        name: "Feed Coal Plant",
        inputArcs: [
          {
            placeId: "root__fuel_reserve",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__coal",
              portPlaceId: "plant__port_fuel",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 6);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -18 * GS,
        y: 0,
      },
      {
        id: "root__feed_gas",
        name: "Feed Gas Plant",
        inputArcs: [
          {
            placeId: "root__fuel_reserve",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__gas",
              portPlaceId: "plant__port_fuel",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 3);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -4 * GS,
        y: 0,
      },
      {
        id: "root__feed_peaker",
        name: "Feed Peaker Plant",
        inputArcs: [
          {
            placeId: "root__fuel_reserve",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__peaker",
              portPlaceId: "plant__port_fuel",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 1);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 10 * GS,
        y: 0,
      },
      {
        id: "root__grid_coal",
        name: "Coal to Grid",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__coal",
              portPlaceId: "plant__port_electricity",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "root__electricity_grid",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -10 * GS,
        y: 28 * GS,
      },
      {
        id: "root__grid_gas",
        name: "Gas to Grid",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__gas",
              portPlaceId: "plant__port_electricity",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "root__electricity_grid",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 4 * GS,
        y: 28 * GS,
      },
      {
        id: "root__grid_peaker",
        name: "Peaker to Grid",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__peaker",
              portPlaceId: "plant__port_electricity",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "root__electricity_grid",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default LambdaFunction(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 18 * GS,
        y: 28 * GS,
      },
      {
        id: "root__consume_power",
        name: "Consume Power",
        inputArcs: [
          {
            placeId: "root__electricity_grid",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "root__consumed_power",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode:
          "export default LambdaFunction(({ parameters }) => parameters.grid_load);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 26 * GS,
        y: 0,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "root__grid_load",
        name: "Grid Load",
        variableName: "grid_load",
        type: "real",
        defaultValue: "2",
      },
    ],
    scenarios: [
      {
        id: "scenario__peak_demand",
        name: "PeakDemand",
        description:
          "High-demand scenario with an elevated grid load. The coal plant carries the majority of generation owing to its high combustion rate, producing heavy emissions. The natural gas plant provides balanced supplemental output. The peaker plant barely contributes but does so with nearly zero waste, making it the cleanest source per token of electricity delivered.",
        scenarioParameters: [],
        parameterOverrides: {
          root__grid_load: "5",
        },
        initialState: {
          type: "per_place",
          content: {
            root__fuel_reserve: "80",
          },
        },
      },
    ],
    metrics: [],
    subnets: [
      {
        id: "subnet__plant",
        name: "PowerPlant",
        places: [
          {
            id: "plant__port_fuel",
            name: "Fuel In",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -10 * GS,
            y: 5 * GS,
          },
          {
            id: "plant__combustion",
            name: "Combustion",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 5 * GS,
          },
          {
            id: "plant__port_electricity",
            name: "Electricity Out",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 10 * GS,
            y: 5 * GS,
          },
          {
            id: "plant__emissions",
            name: "Emissions",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 12 * GS,
          },
        ],
        transitions: [
          {
            id: "plant__ignite",
            name: "Ignite",
            inputArcs: [
              {
                placeId: "plant__port_fuel",
                weight: 1,
                type: "standard",
              },
            ],
            outputArcs: [
              {
                placeId: "plant__combustion",
                weight: 1,
              },
            ],
            lambdaType: "stochastic",
            lambdaCode:
              "export default LambdaFunction(({ parameters }) => parameters.combustion_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -5 * GS,
            y: 2 * GS,
          },
          {
            id: "plant__generate",
            name: "Generate",
            inputArcs: [
              {
                placeId: "plant__combustion",
                weight: 1,
                type: "standard",
              },
            ],
            outputArcs: [
              {
                placeId: "plant__port_electricity",
                weight: 1,
              },
            ],
            lambdaType: "stochastic",
            lambdaCode:
              "export default LambdaFunction(({ parameters }) => parameters.efficiency_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 5 * GS,
            y: 2 * GS,
          },
          {
            id: "plant__emit_waste",
            name: "Emit Waste",
            inputArcs: [
              {
                placeId: "plant__combustion",
                weight: 1,
                type: "standard",
              },
            ],
            outputArcs: [
              {
                placeId: "plant__emissions",
                weight: 1,
              },
            ],
            lambdaType: "stochastic",
            lambdaCode:
              "export default LambdaFunction(({ parameters }) => parameters.emission_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 0,
            y: 8 * GS,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "plant__combustion_rate",
            name: "Combustion Rate",
            variableName: "combustion_rate",
            type: "real",
            defaultValue: "3",
          },
          {
            id: "plant__efficiency_rate",
            name: "Efficiency Rate",
            variableName: "efficiency_rate",
            type: "real",
            defaultValue: "2",
          },
          {
            id: "plant__emission_rate",
            name: "Emission Rate",
            variableName: "emission_rate",
            type: "real",
            defaultValue: "1",
          },
        ],
        componentInstances: [],
      },
    ],
    componentInstances: [
      {
        id: "inst__coal",
        name: "CoalPlant",
        subnetId: "subnet__plant",
        parameterValues: {
          plant__combustion_rate: "8",
          plant__efficiency_rate: "3",
          plant__emission_rate: "5",
        },
        x: -14 * GS,
        y: 18 * GS,
      },
      {
        id: "inst__gas",
        name: "NaturalGasPlant",
        subnetId: "subnet__plant",
        parameterValues: {
          plant__combustion_rate: "4",
          plant__efficiency_rate: "3.2",
          plant__emission_rate: "0.8",
        },
        x: 0,
        y: 18 * GS,
      },
      {
        id: "inst__peaker",
        name: "PeakerPlant",
        subnetId: "subnet__plant",
        parameterValues: {
          plant__combustion_rate: "1",
          plant__efficiency_rate: "0.95",
          plant__emission_rate: "0.05",
        },
        x: 14 * GS,
        y: 18 * GS,
      },
    ],
  },
};
