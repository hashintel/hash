import { createExecutionTrace } from "./execution-trace";
import { createTraceEncoder } from "./trace-encoder";

import type { RunContinuity } from "../extensions/net-class";
import type { SDCPN } from "../types/sdcpn";
import type { ExecutionTraceConfig } from "./execution-trace";

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
 * A trace of the queue net with three tokens queued at `startTime`, and the
 * means to write it: `finish(time)` moves one token, as a source would.
 */
export const createQueueTrace = (
  options: {
    startTime?: number;
    continuity?: RunContinuity;
  } & Pick<ExecutionTraceConfig, "epochMs" | "onDemand"> = {},
) => {
  const { startTime = 0, continuity = "discrete", ...config } = options;
  const encoder = createTraceEncoder(queueNet);
  const { trace, writer } = createExecutionTrace({
    net: queueNet,
    clock: "time",
    continuity,
    ...config,
  });
  writer.append([encoder.state(startTime, { queued: 3 }, "initial")]);
  return {
    trace,
    writer,
    encoder,
    finish: (time: number) =>
      writer.append([
        encoder.firing(time, {
          transitionIds: ["finish"],
          consumed: { queued: 1 },
          produced: { done: 1 },
        }),
      ]),
  };
};
