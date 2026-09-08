import { describe, expect, it, vi } from "vitest";

import { attachOptimizerWorker } from "./attach-optimizer-worker";

import type { WorkerThreadRuntime } from "../../../environment";
import type { PetrinautOptimizationDescribeResult } from "../../index";
import type {
  OptimizerStudySummary,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
  OptimizerTrialPayload,
} from "../messages";
import type {
  OptimizerStudyCallbacks,
  OptimizerStudyRunner,
} from "./study-runner";

type FakeRuntime = WorkerThreadRuntime<
  OptimizerToWorkerMessage,
  OptimizerToMainMessage
> & {
  readonly posted: OptimizerToMainMessage[];
  /** Deliver a message as the main thread would post it. */
  receive(message: OptimizerToWorkerMessage): void;
  postedOfType<TType extends OptimizerToMainMessage["type"]>(
    type: TType,
  ): Extract<OptimizerToMainMessage, { type: TType }>[];
};

const createFakeRuntime = (): FakeRuntime => {
  const posted: OptimizerToMainMessage[] = [];
  let listener: ((message: OptimizerToWorkerMessage) => void) | null = null;
  return {
    posted,
    postMessage(message) {
      posted.push(message);
    },
    onMessage(next) {
      listener = next;
    },
    delay: () => Promise.resolve(),
    receive(message) {
      if (!listener) {
        throw new Error("the protocol registered no message listener");
      }
      listener(message);
    },
    postedOfType(type) {
      return posted.filter(
        (message): message is Extract<typeof message, { type: typeof type }> =>
          message.type === type,
      );
    },
  };
};

/** One segment the fake runner was asked to run, settled by the test. */
type Segment = {
  readonly runId: string;
  readonly trials: number;
  readonly callbacks: OptimizerStudyCallbacks;
  readonly settle: (summary: OptimizerStudySummary) => void;
  readonly fail: (error: unknown) => void;
};

const createFakeRunner = (ready: Promise<void>) => {
  const segments: Segment[] = [];
  const released: string[] = [];
  const begin = (
    runId: string,
    trials: number,
    callbacks: OptimizerStudyCallbacks,
  ): Promise<OptimizerStudySummary> => {
    const { promise, resolve, reject } =
      Promise.withResolvers<OptimizerStudySummary>();
    segments.push({ runId, trials, callbacks, settle: resolve, fail: reject });
    return promise;
  };
  const start = vi.fn<OptimizerStudyRunner["start"]>((input) =>
    begin(input.runId, input.description.study.trials, input.callbacks),
  );
  const extend = vi.fn<OptimizerStudyRunner["extend"]>((input) =>
    begin(input.runId, input.trials, input.callbacks),
  );
  const runner: OptimizerStudyRunner = {
    ready,
    start,
    extend,
    release: async (runId) => {
      released.push(runId);
    },
  };
  return { runner, start, extend, segments, released };
};

const description: PetrinautOptimizationDescribeResult = {
  direction: "minimize",
  study: { trials: 3, sampler: "tpe", seed: 1, seedsPerTrial: 1 },
  parameters: [
    {
      identifier: "rate",
      type: "float",
      default: 1,
      minimum: 0,
      maximum: 2,
      scale: "linear",
    },
  ],
};

const summary: OptimizerStudySummary = {
  requestedTrials: 3,
  completedTrials: 3,
  prunedTrials: 0,
  failedTrials: 0,
  best: { trial: 1, parameters: { rate: 0.5 }, objective: 1 },
};

const trialPayload: OptimizerTrialPayload = {
  trial: 0,
  parameters: { rate: 0.5 },
  objective: 1,
  state: "complete",
  best: summary.best,
};

const flush = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
};

const setUp = (options?: { ready?: Promise<void> }) => {
  const runtime = createFakeRuntime();
  const fake = createFakeRunner(options?.ready ?? Promise.resolve());
  const createRunner = vi.fn(() => fake.runner);
  attachOptimizerWorker(runtime, createRunner);
  return { runtime, createRunner, ...fake };
};

const init = (context: ReturnType<typeof setUp>): void => {
  context.runtime.receive({
    type: "init",
    pyodide: {
      indexURL: "https://example.test/pyodide/",
      packages: { optuna: "4.9.0" },
      distributionPackages: ["numpy"],
    },
    pythonSources: { "petrinaut_optimizer_core/__init__.py": "" },
  });
};

const segmentOf = (
  context: ReturnType<typeof setUp>,
  index: number,
): Segment => {
  const segment = context.segments[index];
  if (!segment) {
    throw new Error(`no segment ${index} was started`);
  }
  return segment;
};

describe("attachOptimizerWorker", () => {
  it("creates the runner from the init message and reports readiness", async () => {
    const context = setUp();

    init(context);
    await flush();

    expect(context.createRunner).toHaveBeenCalledWith({
      pyodide: {
        indexURL: "https://example.test/pyodide/",
        packages: { optuna: "4.9.0" },
        distributionPackages: ["numpy"],
      },
      pythonSources: { "petrinaut_optimizer_core/__init__.py": "" },
    });
    expect(context.runtime.posted).toEqual([{ type: "ready" }]);
  });

  it("reports a runtime that fails to load as init-error", async () => {
    const context = setUp({ ready: Promise.reject(new Error("offline")) });

    init(context);
    await flush();

    expect(context.runtime.posted).toEqual([
      { type: "init-error", message: "offline" },
    ]);
  });

  it("answers a study posted before init with an error", () => {
    const context = setUp();

    context.runtime.receive({
      type: "start",
      runId: "early",
      description,
      parallelism: 1,
    });

    expect(context.runtime.posted).toEqual([
      {
        type: "error",
        runId: "early",
        message: "The optimizer worker received a study before its runtime",
      },
    ]);
    expect(context.start).not.toHaveBeenCalled();
  });

  it("starts the study and completes an evaluate round trip through the main thread", async () => {
    const context = setUp();
    init(context);
    context.runtime.receive({
      type: "start",
      runId: "study",
      description,
      parallelism: 2,
    });

    expect(context.start).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "study", description, parallelism: 2 }),
    );
    const segment = segmentOf(context, 0);
    expect(segment.callbacks.isCancelled()).toBe(false);

    const outcome = segment.callbacks.evaluate(0, { rate: 0.5 });
    expect(context.runtime.postedOfType("evaluate")).toEqual([
      {
        type: "evaluate",
        runId: "study",
        requestId: 1,
        trial: 0,
        suggestedValues: { rate: 0.5 },
      },
    ]);
    context.runtime.receive({
      type: "evaluated",
      requestId: 1,
      outcome: { kind: "objective", objective: 1 },
    });
    expect(await outcome).toEqual({ kind: "objective", objective: 1 });

    segment.callbacks.onTrial(trialPayload);
    segment.settle(summary);
    await flush();
    expect(context.runtime.posted.slice(-2)).toEqual([
      { type: "trial", runId: "study", event: trialPayload },
      { type: "complete", runId: "study", summary },
    ]);
  });

  it("ignores an evaluated message for a request it no longer holds", () => {
    const context = setUp();
    init(context);

    expect(() =>
      context.runtime.receive({
        type: "evaluated",
        requestId: 7,
        outcome: { kind: "objective", objective: 1 },
      }),
    ).not.toThrow();
  });

  it("cancel prunes the segment's pending evaluations, flags the loop and posts cancelled when it stops", async () => {
    const context = setUp();
    init(context);
    context.runtime.receive({
      type: "start",
      runId: "stopped",
      description,
      parallelism: 2,
    });
    context.runtime.receive({
      type: "start",
      runId: "other",
      description,
      parallelism: 1,
    });
    const stopped = segmentOf(context, 0);
    const other = segmentOf(context, 1);
    const pending = [
      stopped.callbacks.evaluate(0, { rate: 0.1 }),
      stopped.callbacks.evaluate(1, { rate: 0.2 }),
    ];
    const otherPending = other.callbacks.evaluate(0, { rate: 0.3 });

    context.runtime.receive({ type: "cancel", runId: "stopped" });

    expect(stopped.callbacks.isCancelled()).toBe(true);
    expect(other.callbacks.isCancelled()).toBe(false);
    expect(await Promise.all(pending)).toEqual([
      { kind: "pruned", reason: "cancelled" },
      { kind: "pruned", reason: "cancelled" },
    ]);
    context.runtime.receive({
      type: "evaluated",
      requestId: 3,
      outcome: { kind: "objective", objective: 3 },
    });
    expect(await otherPending).toEqual({ kind: "objective", objective: 3 });

    stopped.settle({ ...summary, cancelled: true });
    await flush();
    expect(context.runtime.posted.at(-1)).toEqual({
      type: "cancelled",
      runId: "stopped",
    });

    // The next segment of the same study starts uncancelled.
    context.runtime.receive({ type: "extend", runId: "stopped", trials: 2 });
    expect(context.extend).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "stopped", trials: 2 }),
    );
    expect(segmentOf(context, 2).callbacks.isCancelled()).toBe(false);
  });

  it("release prunes pending evaluations and drops the study without posting back", async () => {
    const context = setUp();
    init(context);
    await flush();
    context.runtime.receive({
      type: "start",
      runId: "released",
      description,
      parallelism: 1,
    });
    const segment = segmentOf(context, 0);
    const pending = segment.callbacks.evaluate(0, { rate: 0.1 });
    const postedBefore = context.runtime.posted.length;

    context.runtime.receive({ type: "release", runId: "released" });

    // The loop sees the cancellation until the release, queued behind the
    // segment in the real runner, settles.
    expect(segment.callbacks.isCancelled()).toBe(true);
    expect(await pending).toEqual({ kind: "pruned", reason: "cancelled" });
    await flush();
    expect(context.released).toEqual(["released"]);
    expect(context.runtime.posted).toHaveLength(postedBefore);
  });

  it("reports a segment the runner rejects as an error for its run", async () => {
    const context = setUp();
    init(context);
    context.runtime.receive({
      type: "start",
      runId: "failing",
      description,
      parallelism: 1,
    });

    segmentOf(context, 0).fail(
      new Error("ValueError: trial objective must be a finite number"),
    );
    await flush();

    expect(context.runtime.posted.at(-1)).toEqual({
      type: "error",
      runId: "failing",
      message: "ValueError: trial objective must be a finite number",
    });
  });
});
