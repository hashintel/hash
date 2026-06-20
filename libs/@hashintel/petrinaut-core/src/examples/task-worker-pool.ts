import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const GS = GRID_SIZE;

/**
 * A shared task queue drained by three workers of different speeds and
 * reliability: Fast, Standard, and Slow. All three compete for tasks from the
 * same queue. Each worker subnet contains internal retry logic — failed
 * in-progress tasks move to a retry queue and are re-attempted at the same
 * start rate, rather than being discarded.
 *
 * Because assignment rates and success rates differ across workers, faster
 * workers naturally absorb a larger share of the queue. The retry_queue place
 * within each subnet accumulates tasks that have failed at least once, making
 * it easy to observe reliability differences across worker types.
 */
export const taskWorkerPoolSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Task Worker Pool",
  petriNetDefinition: {
    places: [
      {
        id: "root__task_queue",
        name: "TaskQueue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: -12 * GS,
      },
      {
        id: "root__completed",
        name: "Completed",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 28 * GS,
      },
    ],
    transitions: [
      // Assignment transitions — root__task_queue → each worker's in-port
      {
        id: "root__assign_fast",
        name: "AssignFast",
        inputArcs: [
          { placeId: "root__task_queue", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__fast",
              portPlaceId: "w__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 4);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -12 * GS,
        y: -4 * GS,
      },
      {
        id: "root__assign_standard",
        name: "AssignStandard",
        inputArcs: [
          { placeId: "root__task_queue", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__standard",
              portPlaceId: "w__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 2);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 0,
        y: -4 * GS,
      },
      {
        id: "root__assign_slow",
        name: "AssignSlow",
        inputArcs: [
          { placeId: "root__task_queue", weight: 1, type: "standard" },
        ],
        outputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__slow",
              portPlaceId: "w__port_in",
            },
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 0.8);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 12 * GS,
        y: -4 * GS,
      },
      // Collection transitions — each worker's out-port → root__completed
      {
        id: "root__collect_fast",
        name: "CollectFast",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__fast",
              portPlaceId: "w__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__completed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: -12 * GS,
        y: 22 * GS,
      },
      {
        id: "root__collect_standard",
        name: "CollectStandard",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__standard",
              portPlaceId: "w__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__completed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 0,
        y: 22 * GS,
      },
      {
        id: "root__collect_slow",
        name: "CollectSlow",
        inputArcs: [
          {
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "inst__slow",
              portPlaceId: "w__port_out",
            },
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [{ placeId: "root__completed", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 20);",
        transitionKernelCode: "export default TransitionKernel(() => ({}));",
        x: 12 * GS,
        y: 22 * GS,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    componentInstances: [
      {
        id: "inst__fast",
        name: "FastWorker",
        subnetId: "subnet__worker",
        parameterValues: {
          w__start_rate: "5",
          w__success_rate: "4",
          w__retry_rate: "0.3",
        },
        x: -16 * GS,
        y: 8 * GS,
      },
      {
        id: "inst__standard",
        name: "StandardWorker",
        subnetId: "subnet__worker",
        parameterValues: {
          w__start_rate: "2",
          w__success_rate: "1.5",
          w__retry_rate: "0.8",
        },
        x: 0,
        y: 8 * GS,
      },
      {
        id: "inst__slow",
        name: "SlowWorker",
        subnetId: "subnet__worker",
        parameterValues: {
          w__start_rate: "0.8",
          w__success_rate: "0.6",
          w__retry_rate: "1.2",
        },
        x: 16 * GS,
        y: 8 * GS,
      },
    ],
    scenarios: [
      {
        id: "scenario__default",
        name: "Default",
        description:
          "30 tasks start in the queue. Faster workers handle proportionally more tasks due to their higher assignment and success rates. The slow worker's high retry rate causes tasks to cycle through its retry queue before completing.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "per_place",
          content: {
            root__task_queue: "30",
          },
        },
      },
    ],
    subnets: [
      {
        id: "subnet__worker",
        name: "Worker",
        places: [
          {
            id: "w__port_in",
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
            id: "w__in_progress",
            name: "InProgress",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 5 * GS,
          },
          {
            id: "w__retry_queue",
            name: "RetryQueue",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 12 * GS,
          },
          {
            id: "w__port_out",
            name: "PortOut",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            isPort: true,
            x: 8 * GS,
            y: 5 * GS,
          },
        ],
        transitions: [
          {
            id: "w__start",
            name: "Start",
            inputArcs: [{ placeId: "w__port_in", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "w__in_progress", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.start_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -4 * GS,
            y: 2 * GS,
          },
          {
            id: "w__succeed",
            name: "Succeed",
            inputArcs: [
              { placeId: "w__in_progress", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "w__port_out", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.success_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 4 * GS,
            y: 2 * GS,
          },
          {
            id: "w__fail_to_retry",
            name: "FailToRetry",
            inputArcs: [
              { placeId: "w__in_progress", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "w__retry_queue", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.retry_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: -2 * GS,
            y: 8 * GS,
          },
          {
            id: "w__retry",
            name: "Retry",
            inputArcs: [
              { placeId: "w__retry_queue", weight: 1, type: "standard" },
            ],
            outputArcs: [{ placeId: "w__in_progress", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode:
              "export default Lambda((tokens, parameters) => parameters.start_rate);",
            transitionKernelCode:
              "export default TransitionKernel(() => ({}));",
            x: 2 * GS,
            y: 8 * GS,
          },
        ],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "w__start_rate",
            name: "StartRate",
            variableName: "start_rate",
            type: "real",
            defaultValue: "3",
          },
          {
            id: "w__success_rate",
            name: "SuccessRate",
            variableName: "success_rate",
            type: "real",
            defaultValue: "2",
          },
          {
            id: "w__retry_rate",
            name: "RetryRate",
            variableName: "retry_rate",
            type: "real",
            defaultValue: "0.5",
          },
        ],
        componentInstances: [],
      },
    ],
  },
};
