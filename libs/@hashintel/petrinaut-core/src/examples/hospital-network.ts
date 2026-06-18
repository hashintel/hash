import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Demonstrates subnet authoring. The root net contains department-level flow,
 * and an ER triage subnet exposes boundary places as component ports.
 */
export const hospitalNetworkSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Hospital Network",
  petriNetDefinition: {
    places: [
      {
        id: "place__er",
        name: "EmergencyRoom",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -20 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
      {
        id: "place__ward",
        name: "HospitalWard",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 10 * GRID_SIZE,
      },
      {
        id: "place__discharged",
        name: "Discharged",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 20 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__admit",
        name: "Admit",
        inputArcs: [{ placeId: "place__er", weight: 1, type: "standard" }],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "instance__er_triage",
              portPlaceId: "place__waiting",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.admission_rate)",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -10 * GRID_SIZE,
        y: 5 * GRID_SIZE,
      },
      {
        id: "transition__move_to_ward",
        name: "MoveToWard",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "instance__er_triage",
              portPlaceId: "place__treated",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "place__ward", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.admission_rate)",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 0,
        y: 5 * GRID_SIZE,
      },
      {
        id: "transition__discharge",
        name: "Discharge",
        inputArcs: [{ placeId: "place__ward", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__discharged", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.discharge_rate)",
        transitionKernelCode: [
          "export default TransitionKernel(() => {",
          "  return {",
          "    Discharged: [{}],",
          "  };",
          "});",
        ].join("\n"),
        x: 10 * GRID_SIZE,
        y: 5 * GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__admission_rate",
        name: "AdmissionRate",
        variableName: "admission_rate",
        type: "real",
        defaultValue: "2",
      },
      {
        id: "param__discharge_rate",
        name: "DischargeRate",
        variableName: "discharge_rate",
        type: "real",
        defaultValue: "1",
      },
    ],
    componentInstances: [
      {
        id: "instance__er_triage",
        name: "ERTriageUnit",
        subnetId: "subnet__er_triage",
        parameterValues: {
          param__triage_rate: "5",
          param__treatment_rate: "3",
        },
        x: -10 * GRID_SIZE,
        y: 20 * GRID_SIZE,
      },
    ],
    scenarios: [
      {
        id: "scenario__normal_day",
        name: "NormalDay",
        description: "Typical daily patient flow through the hospital.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "per_place",
          content: {
            place__er: "10",
            place__ward: "5",
            place__discharged: "0",
          },
        },
      },
    ],
    subnets: [
      {
        id: "subnet__er_triage",
        name: "ERTriage",
        places: [
          {
            id: "place__waiting",
            name: "Waiting",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -15 * GRID_SIZE,
            y: 5 * GRID_SIZE,
          },
          {
            id: "place__assessment",
            name: "Assessment",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 5 * GRID_SIZE,
          },
          {
            id: "place__treated",
            name: "Treated",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 15 * GRID_SIZE,
            y: 5 * GRID_SIZE,
          },
        ],
        transitions: [
          {
            id: "transition__triage",
            name: "Triage",
            inputArcs: [
              { placeId: "place__waiting", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "place__assessment", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.triage_rate)",
            transitionKernelCode: [
              "export default TransitionKernel(() => {",
              "  return {",
              "    Assessment: [{}],",
              "  };",
              "});",
            ].join("\n"),
            x: -7 * GRID_SIZE,
            y: 0,
          },
          {
            id: "transition__treat",
            name: "Treat",
            inputArcs: [
              { placeId: "place__assessment", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "place__treated", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.treatment_rate)",
            transitionKernelCode: [
              "export default TransitionKernel(() => {",
              "  return {",
              "    Treated: [{}],",
              "  };",
              "});",
            ].join("\n"),
            x: 7 * GRID_SIZE,
            y: 0,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "param__triage_rate",
            name: "TriageRate",
            variableName: "triage_rate",
            type: "real",
            defaultValue: "5",
          },
          {
            id: "param__treatment_rate",
            name: "TreatmentRate",
            variableName: "treatment_rate",
            type: "real",
            defaultValue: "3",
          },
        ],
        componentInstances: [],
      },
    ],
  },
};
