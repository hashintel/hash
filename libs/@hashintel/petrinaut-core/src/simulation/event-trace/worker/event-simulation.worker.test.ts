import { describe, expect, it, vi } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";

import type { SDCPN } from "../../../types/sdcpn";
import type { ToEventMainMessage, ToEventWorkerMessage } from "./messages";

// The core compiles against no host types, so the host timer is declared.
declare const setTimeout: (handler: () => void, timeout?: number) => unknown;

const host = vi.hoisted(() => ({
  posted: [] as unknown[],
  listener: null as ((message: unknown) => void) | null,
}));

vi.mock("../../../environment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../environment")>()),
  createWorkerThreadRuntime: () => ({
    postMessage: (message: unknown) => {
      host.posted.push(message);
    },
    onMessage: (listener: (message: unknown) => void) => {
      host.listener = listener;
    },
    delay: (timeout?: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeout);
      }),
  }),
}));

/** A token a transition of rate zero watches: the run never fires and never deadlocks. */
const idle: SDCPN = {
  places: [
    {
      id: "hold",
      name: "Hold",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "watch",
      name: "Watch",
      inputArcs: [{ placeId: "hold", weight: 1, type: "read" }],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 0);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const send = (message: ToEventWorkerMessage): void => host.listener!(message);

const posted = <Type extends ToEventMainMessage["type"]>(type: Type) =>
  (host.posted as ToEventMainMessage[]).filter(
    (message): message is Extract<ToEventMainMessage, { type: Type }> =>
      message.type === type,
  );

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe("event simulation worker", () => {
  it("computes no further than the latest demand, even a lower one", async () => {
    await import("./event-simulation.worker");
    send({
      type: "init",
      sdcpn: idle,
      hirArtifacts: compileHirArtifacts(idle, undefined, { includeHir: true })
        .artifacts,
      initialMarking: { hold: 1 },
      parameterValues: {},
      seed: 1,
      maxTime: null,
      simulator: { id: "js-adaptive", parameters: { tolerance: 1e-6 } },
    });
    send({ type: "start" });
    send({ type: "demand", time: Number.POSITIVE_INFINITY });
    await wait(40);
    send({ type: "demand", time: 1 });

    // Long enough for the advances made so far to reach the host.
    await wait(200);
    const covered = posted("events").at(-1)!.coveredTime;
    expect(covered).toBeGreaterThan(1);

    await wait(100);
    send({ type: "pause" });
    expect(posted("paused").at(-1)!.time).toBe(covered);
    send({ type: "stop" });
  });
});
