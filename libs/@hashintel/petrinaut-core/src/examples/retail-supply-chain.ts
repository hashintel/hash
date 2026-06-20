import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const GS = GRID_SIZE;

/**
 * Demonstrates subnet composition with a central warehouse distributing stock
 * to 3 retail channels (Flagship store, Suburban store, Online channel). Each
 * channel shares the same internal flow (receive → stockroom → shelf → sale)
 * but operates at different speeds. The warehouse is the shared source and
 * total sales are the shared sink.
 */
export const retailSupplyChainSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Retail Supply Chain",
  petriNetDefinition: {
    places: [
      {
        id: "root__warehouse",
        name: "Warehouse",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -22 * GS,
        y: 8 * GS,
      },
      {
        id: "root__total_sales",
        name: "TotalSales",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 22 * GS,
        y: 8 * GS,
      },
    ],
    transitions: [
      {
        id: "root__dispatch_flagship",
        name: "DispatchFlagship",
        inputArcs: [
          { placeId: "root__warehouse", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__flagship",
              portPlaceId: "store__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 4);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -18 * GS,
        y: 0,
      },
      {
        id: "root__dispatch_suburban",
        name: "DispatchSuburban",
        inputArcs: [
          { placeId: "root__warehouse", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__suburban",
              portPlaceId: "store__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 2);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -4 * GS,
        y: 0,
      },
      {
        id: "root__dispatch_online",
        name: "DispatchOnline",
        inputArcs: [
          { placeId: "root__warehouse", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__online",
              portPlaceId: "store__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 10 * GS,
        y: 0,
      },
      {
        id: "root__record_flagship",
        name: "RecordFlagship",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__flagship",
              portPlaceId: "store__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__total_sales", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -10 * GS,
        y: 28 * GS,
      },
      {
        id: "root__record_suburban",
        name: "RecordSuburban",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__suburban",
              portPlaceId: "store__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__total_sales", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 4 * GS,
        y: 28 * GS,
      },
      {
        id: "root__record_online",
        name: "RecordOnline",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__online",
              portPlaceId: "store__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__total_sales", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 18 * GS,
        y: 28 * GS,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    componentInstances: [
      {
        id: "inst__flagship",
        name: "FlagshipStore",
        subnetId: "subnet__store",
        parameterValues: {
          store__receive_rate: "5",
          store__shelving_rate: "3",
          store__sales_rate: "4",
        },
        x: -14 * GS,
        y: 18 * GS,
      },
      {
        id: "inst__suburban",
        name: "SuburbanStore",
        subnetId: "subnet__store",
        parameterValues: {
          store__receive_rate: "2",
          store__shelving_rate: "1.5",
          store__sales_rate: "1.2",
        },
        x: 0,
        y: 18 * GS,
      },
      {
        id: "inst__online",
        name: "OnlineChannel",
        subnetId: "subnet__store",
        parameterValues: {
          store__receive_rate: "1",
          store__shelving_rate: "0.5",
          store__sales_rate: "3",
        },
        x: 14 * GS,
        y: 18 * GS,
      },
    ],
    scenarios: [
      {
        id: "scenario__quarterly_run",
        name: "QuarterlyRun",
        description:
          "Quarterly stock distribution run starting with 100 units in the warehouse. " +
          "The Online channel has the highest sales_rate (3) but the slowest receive " +
          "and shelving rates (1 and 0.5 respectively), modelling order-processing " +
          "delays — stock must clear a slow fulfilment pipeline before it sells quickly. " +
          "The Flagship store is the highest-throughput channel overall.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "per_place",
          content: {
            root__warehouse: "100",
            root__total_sales: "0",
          },
        },
      },
    ],
    subnets: [
      {
        id: "subnet__store",
        name: "RetailChannel",
        places: [
          {
            id: "store__port_in",
            name: "StockIn",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -10 * GS,
            y: 5 * GS,
          },
          {
            id: "store__stockroom",
            name: "Stockroom",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: -3 * GS,
            y: 5 * GS,
          },
          {
            id: "store__shelf",
            name: "Shelf",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 4 * GS,
            y: 5 * GS,
          },
          {
            id: "store__port_out",
            name: "SaleOut",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 10 * GS,
            y: 5 * GS,
          },
        ],
        transitions: [
          {
            id: "store__receive",
            name: "Receive",
            inputArcs: [
              { placeId: "store__port_in", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "store__stockroom", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.receive_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -6 * GS,
            y: 2 * GS,
          },
          {
            id: "store__shelf_stock",
            name: "ShelfStock",
            inputArcs: [
              { placeId: "store__stockroom", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "store__shelf", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.shelving_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 0,
            y: 2 * GS,
          },
          {
            id: "store__sell",
            name: "Sell",
            inputArcs: [
              { placeId: "store__shelf", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "store__port_out", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.sales_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 7 * GS,
            y: 2 * GS,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "store__receive_rate",
            name: "ReceiveRate",
            variableName: "receive_rate",
            type: "real",
            defaultValue: "3",
          },
          {
            id: "store__shelving_rate",
            name: "ShelvingRate",
            variableName: "shelving_rate",
            type: "real",
            defaultValue: "2",
          },
          {
            id: "store__sales_rate",
            name: "SalesRate",
            variableName: "sales_rate",
            type: "real",
            defaultValue: "1.5",
          },
        ],
        componentInstances: [],
      },
    ],
  },
};
