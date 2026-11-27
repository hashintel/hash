import {
  createExecutionTrace,
  createTraceEncoder,
  type ExecutionTraceConfig,
  type SDCPN,
} from "@hashintel/petrinaut-core";

/** Two plain places and the transition that moves a token between them. */
export const queueNet: SDCPN = {
  places: [
    {
      id: "queued",
      name: "Queued",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
    {
      id: "done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "finish",
      name: "Finish",
      inputArcs: [{ placeId: "queued", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "done", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 50,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * A trace of the queue net as a source would write it: three tokens queued
 * at position 0, one finished at each of `firingTimes`, and coverage up to
 * `coveredTime`.
 */
export const createQueueTrace = ({
  firingTimes = [1.5, 3],
  coveredTime = 5,
  continuity = "discrete",
  ...config
}: {
  firingTimes?: readonly number[];
  coveredTime?: number;
} & Partial<
  Pick<ExecutionTraceConfig, "continuity" | "epochMs" | "onDemand">
> = {}) => {
  const encoder = createTraceEncoder(queueNet);
  const { trace, writer } = createExecutionTrace({
    net: queueNet,
    clock: "time",
    continuity,
    ...config,
  });
  const finish = (time: number) =>
    writer.append([
      encoder.firing(time, {
        transitionIds: ["finish"],
        consumed: { queued: 1 },
        produced: { done: 1 },
      }),
    ]);
  writer.append([encoder.state(0, { queued: 3 }, "initial")]);
  for (const time of firingTimes) {
    finish(time);
  }
  writer.cover(coveredTime);
  return { trace, writer, finish };
};
