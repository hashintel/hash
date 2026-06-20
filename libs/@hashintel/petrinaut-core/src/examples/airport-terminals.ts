import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const GS = GRID_SIZE;

/**
 * Demonstrates subnet composition with 3 airport terminals (International,
 * Domestic, Charter) each sharing the same internal flow (check-in → security
 * → boarding) but operating at different processing speeds. All draw from a
 * shared arrivals pool and contribute to a shared departures count.
 */
export const airportTerminalsSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Airport Terminals",
  petriNetDefinition: {
    places: [
      {
        id: "root__arrivals",
        name: "Arrivals",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -22 * GS,
        y: 7 * GS,
      },
      {
        id: "root__departed",
        name: "Departed",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 22 * GS,
        y: 7 * GS,
      },
    ],
    transitions: [
      {
        id: "root__route_international",
        name: "RouteInternational",
        inputArcs: [{ placeId: "root__arrivals", weight: 1, type: "standard" }],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__international",
              portPlaceId: "term__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 2);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -18 * GS,
        y: 0,
      },
      {
        id: "root__route_domestic",
        name: "RouteDomestic",
        inputArcs: [{ placeId: "root__arrivals", weight: 1, type: "standard" }],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__domestic",
              portPlaceId: "term__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 3);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -4 * GS,
        y: 0,
      },
      {
        id: "root__route_charter",
        name: "RouteCharter",
        inputArcs: [{ placeId: "root__arrivals", weight: 1, type: "standard" }],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__charter",
              portPlaceId: "term__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1.5);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 10 * GS,
        y: 0,
      },
      {
        id: "root__depart_international",
        name: "DepartInternational",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__international",
              portPlaceId: "term__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__departed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -10 * GS,
        y: 26 * GS,
      },
      {
        id: "root__depart_domestic",
        name: "DepartDomestic",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__domestic",
              portPlaceId: "term__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__departed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 4 * GS,
        y: 26 * GS,
      },
      {
        id: "root__depart_charter",
        name: "DepartCharter",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__charter",
              portPlaceId: "term__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__departed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 18 * GS,
        y: 26 * GS,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    componentInstances: [
      {
        id: "inst__international",
        name: "InternationalTerminal",
        subnetId: "subnet__terminal",
        parameterValues: {
          term__check_in_rate: "1",
          term__security_rate: "0.5",
          term__boarding_rate: "1.5",
        },
        x: -14 * GS,
        y: 16 * GS,
      },
      {
        id: "inst__domestic",
        name: "DomesticTerminal",
        subnetId: "subnet__terminal",
        parameterValues: {
          term__check_in_rate: "2.5",
          term__security_rate: "2",
          term__boarding_rate: "3",
        },
        x: 0,
        y: 16 * GS,
      },
      {
        id: "inst__charter",
        name: "CharterTerminal",
        subnetId: "subnet__terminal",
        parameterValues: {
          term__check_in_rate: "4",
          term__security_rate: "3.5",
          term__boarding_rate: "5",
        },
        x: 14 * GS,
        y: 16 * GS,
      },
    ],
    scenarios: [
      {
        id: "scenario__busy_day",
        name: "BusyDay",
        description:
          "Peak-traffic day with 40 passengers in the arrivals pool. " +
          "Security is the primary bottleneck for the International terminal " +
          "(rate 0.5), which has strict customs checks, so passengers accumulate " +
          "in check-in while waiting for security clearance. The Domestic and " +
          "Charter terminals process passengers significantly faster.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "per_place",
          content: {
            root__arrivals: "40",
            root__departed: "0",
          },
        },
      },
    ],
    subnets: [
      {
        id: "subnet__terminal",
        name: "AirportTerminal",
        places: [
          {
            id: "term__port_in",
            name: "TerminalIn",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -12 * GS,
            y: 5 * GS,
          },
          {
            id: "term__check_in",
            name: "CheckIn",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: -6 * GS,
            y: 5 * GS,
          },
          {
            id: "term__security",
            name: "Security",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 5 * GS,
          },
          {
            id: "term__boarding",
            name: "Boarding",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 6 * GS,
            y: 5 * GS,
          },
          {
            id: "term__port_out",
            name: "TerminalOut",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 12 * GS,
            y: 5 * GS,
          },
        ],
        transitions: [
          {
            id: "term__start_checkin",
            name: "StartCheckIn",
            inputArcs: [
              { placeId: "term__port_in", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "term__check_in", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.check_in_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -9 * GS,
            y: 2 * GS,
          },
          {
            id: "term__clear_security",
            name: "ClearSecurity",
            inputArcs: [
              { placeId: "term__check_in", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "term__security", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.security_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -3 * GS,
            y: 2 * GS,
          },
          {
            id: "term__board_flight",
            name: "BoardFlight",
            inputArcs: [
              { placeId: "term__security", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "term__boarding", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.boarding_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 3 * GS,
            y: 2 * GS,
          },
          {
            id: "term__depart",
            name: "Depart",
            inputArcs: [
              { placeId: "term__boarding", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "term__port_out", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "export default Lambda(() => 10);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 9 * GS,
            y: 2 * GS,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "term__check_in_rate",
            name: "CheckInRate",
            variableName: "check_in_rate",
            type: "real",
            defaultValue: "2",
          },
          {
            id: "term__security_rate",
            name: "SecurityRate",
            variableName: "security_rate",
            type: "real",
            defaultValue: "1.5",
          },
          {
            id: "term__boarding_rate",
            name: "BoardingRate",
            variableName: "boarding_rate",
            type: "real",
            defaultValue: "3",
          },
        ],
        componentInstances: [],
      },
    ],
  },
};
