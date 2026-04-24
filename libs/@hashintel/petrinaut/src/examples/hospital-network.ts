import { SNAP_GRID_SIZE } from "../constants/ui";
import type { SDCPN } from "../core/types/sdcpn";

/**
 * Hospital Network example — demonstrates subnets.
 *
 * The root net models patient flow between departments (ER → Ward → Discharge).
 * A subnet models the internal triage process within the ER department.
 */
export const hospitalNetwork: { title: string; petriNetDefinition: SDCPN } = {
  title: "Hospital Network",
  petriNetDefinition: {
    places: [
      {
        id: "place__er",
        name: "Emergency Room",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -20 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__ward",
        name: "Hospital Ward",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__discharged",
        name: "Discharged",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 20 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__admit",
        name: "Admit",
        inputArcs: [{ placeId: "place__er", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__ward", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.admission_rate)",
        transitionKernelCode:
          'export default TransitionKernel(() => {\n  return {\n    "Hospital Ward": [{}],\n  };\n});',
        x: -10 * SNAP_GRID_SIZE,
        y: 5 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__discharge",
        name: "Discharge",
        inputArcs: [{ placeId: "place__ward", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__discharged", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.discharge_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    Discharged: [{}],\n  };\n});",
        x: 10 * SNAP_GRID_SIZE,
        y: 5 * SNAP_GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__admission_rate",
        name: "Admission Rate",
        variableName: "admission_rate",
        type: "real",
        defaultValue: "2",
      },
      {
        id: "param__discharge_rate",
        name: "Discharge Rate",
        variableName: "discharge_rate",
        type: "real",
        defaultValue: "1",
      },
    ],
    componentInstances: [
      {
        id: "instance__er_triage",
        name: "ER Triage Unit",
        subnetId: "subnet__er_triage",
        parameterValues: {
          param__triage_rate: "5",
          param__treatment_rate: "3",
        },
        wiring: [
          {
            externalPlaceId: "place__er",
            internalPlaceId: "place__waiting",
          },
          {
            externalPlaceId: "place__ward",
            internalPlaceId: "place__treated",
          },
        ],
        x: -10 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
    ],
    scenarios: [
      {
        id: "scenario__normal_day",
        name: "Normal Day",
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
        name: "ER Triage",
        places: [
          {
            id: "place__waiting",
            name: "Waiting",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            showAsInitialState: true,
            x: -15 * SNAP_GRID_SIZE,
            y: 5 * SNAP_GRID_SIZE,
          },
          {
            id: "place__assessment",
            name: "Assessment",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0 * SNAP_GRID_SIZE,
            y: 5 * SNAP_GRID_SIZE,
          },
          {
            id: "place__treated",
            name: "Treated",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 15 * SNAP_GRID_SIZE,
            y: 5 * SNAP_GRID_SIZE,
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
            transitionKernelCode:
              "export default TransitionKernel(() => {\n  return {\n    Assessment: [{}],\n  };\n});",
            x: -7 * SNAP_GRID_SIZE,
            y: 0 * SNAP_GRID_SIZE,
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
            transitionKernelCode:
              "export default TransitionKernel(() => {\n  return {\n    Treated: [{}],\n  };\n});",
            x: 7 * SNAP_GRID_SIZE,
            y: 0 * SNAP_GRID_SIZE,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "param__triage_rate",
            name: "Triage Rate",
            variableName: "triage_rate",
            type: "real",
            defaultValue: "5",
          },
          {
            id: "param__treatment_rate",
            name: "Treatment Rate",
            variableName: "treatment_rate",
            type: "real",
            defaultValue: "3",
          },
        ],
      },
    ],
  },
};
