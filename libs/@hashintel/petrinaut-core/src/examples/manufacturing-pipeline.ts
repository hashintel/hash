import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const GS = GRID_SIZE;

/**
 * Three sequential manufacturing stages (Cutting → Welding → Painting), each
 * modelled as an instance of the same ProcessingStation subnet. Welding is the
 * deliberate bottleneck — its processing rate is significantly lower than the
 * other two stations, causing work-in-progress to accumulate in front of it.
 *
 * The root net feeds raw material into Cutting and collects finished goods after
 * Painting. Transfer transitions between stages fire at a high rate (20) to act
 * as near-instant conveyors. Each station exposes an in-port and an out-port so
 * the root-level transitions can wire them together via component-port arcs.
 */
export const manufacturingPipelineSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Manufacturing Pipeline",
  petriNetDefinition: {
    places: [
      {
        id: "root__raw_material",
        name: "RawMaterial",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -25 * GS,
        y: 5 * GS,
      },
      {
        id: "root__finished_goods",
        name: "FinishedGoods",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 25 * GS,
        y: 5 * GS,
      },
    ],
    transitions: [
      {
        id: "root__feed_cutting",
        name: "FeedCutting",
        inputArcs: [
          { placeId: "root__raw_material", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__cutting",
              portPlaceId: "ps__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.feed_rate);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -21 * GS,
        y: 0,
      },
      {
        id: "root__cutting_to_welding",
        name: "CuttingToWelding",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__cutting",
              portPlaceId: "ps__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__welding",
              portPlaceId: "ps__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -6 * GS,
        y: 0,
      },
      {
        id: "root__welding_to_painting",
        name: "WeldingToPainting",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__welding",
              portPlaceId: "ps__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__painting",
              portPlaceId: "ps__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 9 * GS,
        y: 0,
      },
      {
        id: "root__collect_output",
        name: "CollectOutput",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__painting",
              portPlaceId: "ps__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__finished_goods", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 21 * GS,
        y: 0,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "root__feed_rate",
        name: "FeedRate",
        variableName: "feed_rate",
        type: "real",
        defaultValue: "5",
      },
    ],
    componentInstances: [
      {
        id: "inst__cutting",
        name: "Cutting",
        subnetId: "subnet__ps",
        parameterValues: {
          ps__processing_rate: "4",
          ps__good_rate: "3.5",
          ps__defect_rate: "0.5",
        },
        x: -17 * GS,
        y: 18 * GS,
      },
      {
        id: "inst__welding",
        name: "Welding",
        subnetId: "subnet__ps",
        parameterValues: {
          ps__processing_rate: "1.5",
          ps__good_rate: "1.2",
          ps__defect_rate: "0.3",
        },
        x: -2 * GS,
        y: 18 * GS,
      },
      {
        id: "inst__painting",
        name: "Painting",
        subnetId: "subnet__ps",
        parameterValues: {
          ps__processing_rate: "2.5",
          ps__good_rate: "2.3",
          ps__defect_rate: "0.2",
        },
        x: 13 * GS,
        y: 18 * GS,
      },
    ],
    scenarios: [
      {
        id: "scenario__default",
        name: "Default",
        description:
          "20 units of raw material enter the pipeline. Welding is the bottleneck — its processing rate of 1.5 is well below Cutting (4) and Painting (2.5), so work-in-progress accumulates in front of the welding station.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "per_place",
          content: {
            root__raw_material: "20",
          },
        },
      },
    ],
    subnets: [
      {
        id: "subnet__ps",
        name: "ProcessingStation",
        places: [
          {
            id: "ps__port_in",
            name: "PortIn",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -8 * GS,
            y: 5 * GS,
          },
          {
            id: "ps__in_process",
            name: "InProcess",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 5 * GS,
          },
          {
            id: "ps__port_out",
            name: "PortOut",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 8 * GS,
            y: 5 * GS,
          },
          {
            id: "ps__defective",
            name: "Defective",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 12 * GS,
          },
        ],
        transitions: [
          {
            id: "ps__start",
            name: "Start",
            inputArcs: [
              { placeId: "ps__port_in", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "ps__in_process", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.processing_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -4 * GS,
            y: 2 * GS,
          },
          {
            id: "ps__complete_good",
            name: "CompleteGood",
            inputArcs: [
              { placeId: "ps__in_process", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "ps__port_out", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.good_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 4 * GS,
            y: 2 * GS,
          },
          {
            id: "ps__produce_defect",
            name: "ProduceDefect",
            inputArcs: [
              { placeId: "ps__in_process", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "ps__defective", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.defect_rate);",
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
            id: "ps__processing_rate",
            name: "ProcessingRate",
            variableName: "processing_rate",
            type: "real",
            defaultValue: "2",
          },
          {
            id: "ps__good_rate",
            name: "GoodRate",
            variableName: "good_rate",
            type: "real",
            defaultValue: "1.7",
          },
          {
            id: "ps__defect_rate",
            name: "DefectRate",
            variableName: "defect_rate",
            type: "real",
            defaultValue: "0.3",
          },
        ],
        componentInstances: [],
      },
    ],
  },
};
