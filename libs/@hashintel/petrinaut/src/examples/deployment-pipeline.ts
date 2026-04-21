import { SNAP_GRID_SIZE } from "../constants/ui";
import type { SDCPN } from "../core/types/sdcpn";

export const deploymentPipelineSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Deployment Pipeline",
  petriNetDefinition: {
    places: [
      {
        id: "place__deployment-ready",
        name: "DeploymentReady",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -8 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__incident-being-investigated",
        name: "IncidentBeingInvestigated",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -8 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__deployment-in-progress",
        name: "DeploymentInProgress",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 25 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__completed-deployments",
        name: "CompletedDeployments",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 55 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "place__resolved-incidents",
        name: "ResolvedIncidents",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 25 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__create-deployment",
        name: "Create Deployment",
        inputArcs: [],
        outputArcs: [{ placeId: "place__deployment-ready", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.deployment_creation_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    DeploymentReady: [{}],\n  };\n});",
        x: -30 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__incident-raised",
        name: "Incident Raised",
        inputArcs: [],
        outputArcs: [
          { placeId: "place__incident-being-investigated", weight: 1 },
        ],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.incident_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    IncidentBeingInvestigated: [{}],\n  };\n});",
        x: -30 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__start-deployment",
        name: "Start Deployment",
        inputArcs: [
          {
            placeId: "place__deployment-ready",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
            type: "inhibitor",
          },
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
            type: "inhibitor",
          },
        ],
        outputArcs: [{ placeId: "place__deployment-in-progress", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "export default Lambda(() => true)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    DeploymentInProgress: [{}],\n  };\n});",
        x: 8 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__finish-deployment",
        name: "Finish Deployment",
        inputArcs: [
          {
            placeId: "place__deployment-in-progress",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "place__completed-deployments", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "export default Lambda(() => true)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    CompletedDeployments: [{}],\n  };\n});",
        x: 40 * SNAP_GRID_SIZE,
        y: -10 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__close-incident",
        name: "Close Incident",
        inputArcs: [
          {
            placeId: "place__incident-being-investigated",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "place__resolved-incidents", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode:
          "export default Lambda((tokens, parameters) => parameters.incident_resolution_rate)",
        transitionKernelCode:
          "export default TransitionKernel(() => {\n  return {\n    ResolvedIncidents: [{}],\n  };\n});",
        x: 8 * SNAP_GRID_SIZE,
        y: 10 * SNAP_GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__deployment_creation_rate",
        name: "Deployment Creation Rate",
        variableName: "deployment_creation_rate",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "param__incident_rate",
        name: "Incident Rate",
        variableName: "incident_rate",
        type: "real",
        defaultValue: "0.1",
      },
      {
        id: "param__incident_resolution_rate",
        name: "Incident Resolution Rate",
        variableName: "incident_resolution_rate",
        type: "real",
        defaultValue: "0.3",
      },
    ],
  },
};
