import { describe, expect, it, vi } from "vitest";

import { createAbortController } from "../environment";
import { PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE } from "../optimization";
import { createOptimizationManifestInput } from "../shared/optimization-manifest.fixtures";
import { createBrowserOptimization } from "./browser-optimization";

import type { WorkerMessageHandler } from "../environment";
import type {
  PetrinautOptimizationChannel,
  PetrinautOptimizationEvent,
  PetrinautOptimizationTrialRequest,
} from "../optimization";
import type {
  OptimizerWorkerErrorEvent,
  OptimizerWorkerLike,
} from "./create-optimizer-worker";
import type {
  OptimizerStudySummary,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
  OptimizerTrialPayload,
} from "./messages";

type FakeWorkerErrorHandler = (event: OptimizerWorkerErrorEvent) => void;

type FakeWorker = OptimizerWorkerLike & {
  readonly sent: OptimizerToWorkerMessage[];
  readonly terminated: boolean;
  /** Deliver a message as the worker would post it. */
  emit(message: OptimizerToMainMessage): void;
  /** Fire the `error` event a worker whose script fails to load fires. */
  emitError(event: OptimizerWorkerErrorEvent): void;
  /** The messages of one type posted so far. */
  sentOfType<TType extends OptimizerToWorkerMessage["type"]>(
    type: TType,
  ): Extract<OptimizerToWorkerMessage, { type: TType }>[];
};

const createFakeWorker = (): FakeWorker => {
  const listeners = new Set<WorkerMessageHandler<OptimizerToMainMessage>>();
  const errorListeners = new Set<FakeWorkerErrorHandler>();
  const sent: OptimizerToWorkerMessage[] = [];
  let terminated = false;
  return {
    sent,
    get terminated() {
      return terminated;
    },
    postMessage(message) {
      sent.push(message);
    },
    addEventListener(
      type: "message" | "error",
      listener:
        | WorkerMessageHandler<OptimizerToMainMessage>
        | FakeWorkerErrorHandler,
    ) {
      if (type === "message") {
        listeners.add(listener as WorkerMessageHandler<OptimizerToMainMessage>);
      } else {
        errorListeners.add(listener as FakeWorkerErrorHandler);
      }
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    terminate() {
      terminated = true;
    },
    emit(message) {
      for (const listener of listeners) {
        listener({ data: message });
      }
    },
    emitError(event) {
      for (const listener of errorListeners) {
        listener(event);
      }
    },
    sentOfType(type) {
      return sent.filter(
        (message): message is Extract<typeof message, { type: typeof type }> =>
          message.type === type,
      );
    },
  };
};

const flush = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
};

const summary: OptimizerStudySummary = {
  requestedTrials: 20,
  completedTrials: 1,
  prunedTrials: 0,
  failedTrials: 0,
  best: { trial: 0, parameters: { rate: 0.5 }, objective: 1 },
};

const completedTrial: OptimizerTrialPayload = {
  trial: 0,
  parameters: { rate: 0.5, count: 6, enabled: true },
  objective: 1,
  state: "complete",
  best: {
    trial: 0,
    parameters: { rate: 0.5, count: 6, enabled: true },
    objective: 1,
  },
};

const collectEvents = (
  iterable: AsyncIterable<PetrinautOptimizationEvent>,
): Promise<PetrinautOptimizationEvent[]> =>
  (async () => {
    const events: PetrinautOptimizationEvent[] = [];
    for await (const event of iterable) {
      events.push(event);
    }
    return events;
  })();

const setUp = (options?: {
  evaluateTrial?: PetrinautOptimizationChannel["evaluateTrial"];
  createWorker?: (attempt: number) => FakeWorker;
}) => {
  const workers: FakeWorker[] = [];
  let attempts = 0;
  const evaluateTrial = vi.fn<PetrinautOptimizationChannel["evaluateTrial"]>(
    options?.evaluateTrial ??
      (async (request) => ({
        kind: "objective",
        objective: Number(request.suggestedValues.rate) * 2,
      })),
  );
  const capability = createBrowserOptimization({
    pyodide: { indexURL: "https://example.test/pyodide/" },
    createWorker: () => {
      attempts += 1;
      const worker = (options?.createWorker ?? createFakeWorker)(attempts);
      workers.push(worker);
      return worker;
    },
  }).connect({ evaluateTrial });
  return {
    capability,
    evaluateTrial,
    workers,
    get worker() {
      const worker = workers.at(-1);
      if (!worker) {
        throw new Error("no worker was created");
      }
      return worker;
    },
  };
};

/** Creates a run and brings the worker to the point of having received `start`. */
const startRun = async (context: ReturnType<typeof setUp>) => {
  const { runId } = await context.capability.createOptimizationRun(
    createOptimizationManifestInput(),
  );
  context.worker.emit({ type: "ready" });
  await flush();
  return runId;
};

describe("createBrowserOptimization", () => {
  it("initialises the worker lazily with the runtime config and the Python sources", async () => {
    const context = setUp();
    expect(context.workers).toHaveLength(0);

    await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );

    const [init] = context.worker.sent;
    if (init?.type !== "init") {
      throw new Error("the first worker message must be init");
    }
    expect(init.pyodide.indexURL).toBe("https://example.test/pyodide/");
    expect(init.pyodide.packages.optuna).toMatch(/^\d/);
    expect(Object.keys(init.pythonSources)).toEqual([
      "petrinaut_optimizer_core/__init__.py",
      "petrinaut_optimizer_core/description.py",
      "petrinaut_optimizer_core/study.py",
      "petrinaut_optimizer_core/ask_tell.py",
      "petrinaut_optimizer_core/pyodide_entry.py",
    ]);
    expect(context.worker.sentOfType("start")).toHaveLength(0);
  });

  it("streams started, trial and complete events with dense sequence numbers", async () => {
    const context = setUp();
    const runId = await startRun(context);
    const events = collectEvents(
      context.capability.attachOptimizationRun(runId),
    );

    const [start] = context.worker.sentOfType("start");
    expect(start).toMatchObject({
      runId,
      description: {
        direction: "maximize",
        study: { trials: 20, sampler: "tpe", seed: 42, seedsPerTrial: 1 },
      },
      parallelism: 1,
    });

    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();

    expect(context.evaluateTrial).toHaveBeenCalledTimes(1);
    const request = context.evaluateTrial.mock
      .calls[0]?.[0] as PetrinautOptimizationTrialRequest;
    expect(request).toMatchObject({
      runId,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
      scenarioParameterValues: { rate: 0.5, count: 6, enabled: 1, share: 0.25 },
      seeds: [42],
    });
    expect(request.manifest.name).toBe("Find the best rate");
    expect(request.signal.aborted).toBe(false);
    expect(context.worker.sentOfType("evaluated")).toEqual([
      {
        type: "evaluated",
        requestId: 1,
        outcome: { kind: "objective", objective: 1 },
      },
    ]);

    context.worker.emit({ type: "trial", runId, event: completedTrial });
    context.worker.emit({ type: "complete", runId, summary });

    expect(await events).toEqual([
      { type: "started", requestedTrials: 20, seq: 1 },
      {
        type: "trial",
        trial: 0,
        parameters: { rate: 0.5, count: 6, enabled: true },
        objective: 1,
        state: "complete",
        best: completedTrial.best,
        seq: 2,
      },
      {
        type: "complete",
        requestedTrials: 20,
        completedTrials: 1,
        prunedTrials: 0,
        failedTrials: 0,
        best: summary.best,
        seq: 3,
      },
    ]);
  });

  it("reports pruned trials with a null objective and forwards pruned outcomes", async () => {
    const context = setUp({
      evaluateTrial: async () => ({ kind: "pruned", reason: "no frames" }),
    });
    const runId = await startRun(context);

    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();
    expect(context.worker.sentOfType("evaluated")[0]?.outcome).toEqual({
      kind: "pruned",
      reason: "no frames",
    });

    context.worker.emit({
      type: "trial",
      runId,
      event: { ...completedTrial, objective: 3, state: "pruned", best: null },
    });
    context.worker.emit({
      type: "complete",
      runId,
      summary: { ...summary, completedTrials: 0, prunedTrials: 1, best: null },
    });

    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events[1]).toMatchObject({
      type: "trial",
      objective: null,
      state: "pruned",
      best: null,
    });
    expect(events[2]).toMatchObject({ type: "complete", prunedTrials: 1 });
  });

  it("cancels a running study through the worker and ends with the cancelled error code", async () => {
    const context = setUp({
      evaluateTrial: (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    const runId = await startRun(context);
    const events = collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();

    await context.capability.cancelOptimizationRun(runId);
    await flush();
    expect(context.worker.sentOfType("cancel")).toEqual([
      { type: "cancel", runId },
    ]);
    expect(context.worker.sentOfType("evaluated")).toEqual([
      {
        type: "evaluated",
        requestId: 1,
        outcome: { kind: "pruned", reason: "cancelled" },
      },
    ]);

    context.worker.emit({ type: "cancelled", runId });
    await context.capability.cancelOptimizationRun(runId);

    expect((await events).at(-1)).toEqual({
      type: "error",
      code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
      message: "optimization cancelled",
      retryable: false,
      seq: 2,
    });
  });

  it("answers an evaluate posted after cancel with a cancelled outcome without running it", async () => {
    const context = setUp();
    const runId = await startRun(context);
    await context.capability.cancelOptimizationRun(runId);

    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();

    expect(context.evaluateTrial).not.toHaveBeenCalled();
    expect(context.worker.sentOfType("evaluated")).toEqual([
      {
        type: "evaluated",
        requestId: 1,
        outcome: { kind: "pruned", reason: "cancelled" },
      },
    ]);
  });

  it("ignores an evaluation of a stopped segment that settles after the next segment started", async () => {
    let rejectStale: (error: Error) => void = () => {};
    const context = setUp({
      evaluateTrial: async (request) => {
        if (request.trial === 0) {
          return new Promise((_resolve, reject) => {
            rejectStale = reject;
          });
        }
        return { kind: "objective", objective: 1 };
      },
    });
    const runId = await startRun(context);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();
    await context.capability.cancelOptimizationRun(runId);
    context.worker.emit({ type: "cancelled", runId });
    await context.capability.extendOptimizationRun(runId, 1);
    await flush();
    expect(context.worker.sentOfType("extend")).toHaveLength(1);

    rejectStale(new Error("late failure"));
    await flush();

    expect(context.worker.sentOfType("evaluated")).toHaveLength(0);
    expect(context.worker.sentOfType("cancel")).toEqual([
      { type: "cancel", runId },
    ]);
    expect(context.worker.sentOfType("release")).toHaveLength(0);

    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 2,
      trial: 1,
      suggestedValues: { rate: 1, count: 4, enabled: false },
    });
    await flush();
    expect(context.worker.sentOfType("evaluated")).toEqual([
      {
        type: "evaluated",
        requestId: 2,
        outcome: { kind: "objective", objective: 1 },
      },
    ]);
    context.worker.emit({ type: "complete", runId, summary });
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId, { cursor: 2 }),
    );
    expect(events.map((event) => event.type)).toEqual(["started", "complete"]);
  });

  it("cancels a run that is still waiting for the runtime without starting it", async () => {
    const context = setUp();
    const { runId } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );

    await context.capability.cancelOptimizationRun(runId);
    context.worker.emit({ type: "ready" });
    await flush();

    expect(context.worker.sentOfType("start")).toHaveLength(0);
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.map((event) => event.type)).toEqual(["started", "error"]);
    expect(events[1]).toMatchObject({
      code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
    });
  });

  it("rejects attaching to an unknown run with the not-found shape", () => {
    const context = setUp();

    expect(() => context.capability.attachOptimizationRun("missing")).toThrow(
      expect.objectContaining({ category: "http", httpStatus: 404 }),
    );
  });

  it("fails the run when the channel throws and stops the study", async () => {
    const context = setUp({
      evaluateTrial: async () => {
        throw new Error("backend unavailable");
      },
    });
    const runId = await startRun(context);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();

    expect(context.worker.sentOfType("cancel")).toEqual([
      { type: "cancel", runId },
    ]);
    expect(context.worker.sentOfType("evaluated")).toHaveLength(0);
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "trial_evaluation_failed",
      message: "backend unavailable",
      retryable: false,
      seq: 2,
    });

    // The worker winds the study down afterwards; its late messages change nothing.
    context.worker.emit({ type: "cancelled", runId });
    expect(
      await collectEvents(context.capability.attachOptimizationRun(runId)),
    ).toHaveLength(2);
  });

  it("fails the run when the channel throws synchronously", async () => {
    const context = setUp({
      evaluateTrial: () => {
        throw new Error("channel misconfigured");
      },
    });
    const runId = await startRun(context);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });
    await flush();

    expect(context.worker.sentOfType("cancel")).toEqual([
      { type: "cancel", runId },
    ]);
    expect(context.worker.sentOfType("evaluated")).toHaveLength(0);
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "trial_evaluation_failed",
      message: "channel misconfigured",
    });
  });

  it("fails the run when the optimizer suggests values outside the manifest", async () => {
    const context = setUp();
    const runId = await startRun(context);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 7, enabled: true },
    });
    await flush();

    expect(context.evaluateTrial).not.toHaveBeenCalled();
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "trial_evaluation_failed",
      message: 'Optimization parameter "count" must align with step 2 from 2',
    });
  });

  it("reports a study error from the worker", async () => {
    const context = setUp();
    const runId = await startRun(context);

    context.worker.emit({ type: "error", runId, message: "ValueError: nope" });

    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "study_failed",
      message: "ValueError: nope",
      retryable: false,
      seq: 2,
    });
  });

  it("runs studies one at a time on a shared worker", async () => {
    const context = setUp();
    const first = await startRun(context);
    const { runId: second } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    await flush();

    expect(context.workers).toHaveLength(1);
    expect(
      context.worker.sentOfType("start").map(({ runId }) => runId),
    ).toEqual([first]);

    context.worker.emit({ type: "complete", runId: first, summary });
    await flush();

    expect(
      context.worker.sentOfType("start").map(({ runId }) => runId),
    ).toEqual([first, second]);
    expect(
      (await collectEvents(context.capability.attachOptimizationRun(first))).at(
        -1,
      )?.type,
    ).toBe("complete");
  });

  it("fails a run the runtime could not load and retries with a fresh worker", async () => {
    const context = setUp();
    const { runId } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    const firstWorker = context.worker;

    firstWorker.emit({ type: "init-error", message: "offline" });
    await flush();

    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    const last = events.at(-1);
    expect(last).toMatchObject({
      type: "error",
      code: "optimizer_unavailable",
      retryable: true,
    });
    expect(last?.type === "error" ? last.message : "").toContain("offline");
    expect(firstWorker.terminated).toBe(true);

    await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    expect(context.workers).toHaveLength(2);
    expect(context.worker.sentOfType("init")).toHaveLength(1);
  });

  it("fails a run whose worker script does not load and retries with a fresh worker", async () => {
    const context = setUp();
    const { runId } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    const firstWorker = context.worker;

    firstWorker.emitError({});
    await flush();

    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "optimizer_unavailable",
      message:
        "The in-browser optimizer could not start: The optimizer worker failed to load",
      retryable: true,
      seq: 2,
    });
    expect(firstWorker.terminated).toBe(true);

    await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    expect(context.workers).toHaveLength(2);
    expect(context.worker.sentOfType("init")).toHaveLength(1);
  });

  it("fails a run whose worker cannot be created and retries on the next run", async () => {
    const context = setUp({
      createWorker: (attempt) => {
        if (attempt === 1) {
          throw new Error("SecurityError: cross-origin worker script");
        }
        return createFakeWorker();
      },
    });

    const { runId } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );

    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "optimizer_unavailable",
      message:
        "The in-browser optimizer could not start: SecurityError: cross-origin worker script",
      retryable: true,
      seq: 2,
    });
    expect(context.workers).toHaveLength(0);

    const second = await startRun(context);
    expect(context.workers).toHaveLength(1);
    expect(
      context.worker.sentOfType("start").map(({ runId: started }) => started),
    ).toEqual([second]);
  });

  it("replays past a cursor and aborts a tailing attachment", async () => {
    const context = setUp();
    const runId = await startRun(context);
    context.worker.emit({ type: "trial", runId, event: completedTrial });

    const replayed = await collectEvents(
      (async function* takeFirstEvent() {
        const iterator = context.capability
          .attachOptimizationRun(runId, { cursor: 1 })
          [Symbol.asyncIterator]();
        const next = await iterator.next();
        if (!next.done) {
          yield next.value;
        }
        await iterator.return?.(undefined);
      })(),
    );
    expect(replayed.map((event) => event.seq)).toEqual([2]);

    const onAttached = vi.fn();
    let abort = (): void => {};
    const tailing = collectEvents(
      context.capability.attachOptimizationRun(runId, {
        cursor: 2,
        onAttached,
        signal: {
          aborted: false,
          addEventListener: (_type, listener) => {
            abort = listener;
          },
          removeEventListener: () => {},
        },
      }),
    );
    await flush();
    expect(onAttached).toHaveBeenCalledTimes(1);
    abort();
    await expect(tailing).rejects.toMatchObject({ name: "AbortError" });
  });

  it("dispose cancels every run and terminates the worker", async () => {
    const context = setUp();
    const running = await startRun(context);
    const { runId: queued } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );

    context.capability.dispose();

    expect(context.worker.terminated).toBe(true);
    for (const runId of [running, queued]) {
      const events = await collectEvents(
        context.capability.attachOptimizationRun(runId),
      );
      expect(events.at(-1)).toMatchObject({
        type: "error",
        code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
      });
    }
    await expect(
      context.capability.createOptimizationRun(
        createOptimizationManifestInput(),
      ),
    ).rejects.toThrow("disposed");
  });

  it("extends a completed study with trials that continue the numbering", async () => {
    const context = setUp();
    const runId = await startRun(context);
    context.worker.emit({ type: "trial", runId, event: completedTrial });
    context.worker.emit({ type: "complete", runId, summary });
    expect(
      (
        await collectEvents(context.capability.attachOptimizationRun(runId))
      ).map((event) => event.type),
    ).toEqual(["started", "trial", "complete"]);

    await context.capability.extendOptimizationRun(runId, 5);
    const tail = collectEvents(
      context.capability.attachOptimizationRun(runId, { cursor: 3 }),
    );
    await flush();

    expect(context.worker.sentOfType("extend")).toEqual([
      { type: "extend", runId, trials: 5, parallelism: 1 },
    ]);
    context.worker.emit({ type: "started", runId, requestedTrials: 6 });
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 2,
      trial: 1,
      suggestedValues: { rate: 1, count: 4, enabled: false },
    });
    await flush();
    const request = context.evaluateTrial.mock.calls.at(-1)?.[0];
    expect(request).toMatchObject({ runId, trial: 1 });
    expect(request?.signal.aborted).toBe(false);
    expect(context.worker.sentOfType("evaluated").at(-1)).toEqual({
      type: "evaluated",
      requestId: 2,
      outcome: { kind: "objective", objective: 2 },
    });

    const secondTrial: OptimizerTrialPayload = {
      trial: 1,
      parameters: { rate: 1, count: 4, enabled: false },
      objective: 2,
      state: "complete",
      best: {
        trial: 1,
        parameters: { rate: 1, count: 4, enabled: false },
        objective: 2,
      },
    };
    context.worker.emit({ type: "trial", runId, event: secondTrial });
    context.worker.emit({
      type: "complete",
      runId,
      summary: {
        ...summary,
        requestedTrials: 6,
        completedTrials: 2,
        best: secondTrial.best,
      },
    });

    expect(await tail).toEqual([
      { type: "started", requestedTrials: 6, seq: 4 },
      {
        type: "trial",
        trial: 1,
        parameters: secondTrial.parameters,
        objective: 2,
        state: "complete",
        best: secondTrial.best,
        seq: 5,
      },
      {
        type: "complete",
        requestedTrials: 6,
        completedTrials: 2,
        prunedTrials: 0,
        failedTrials: 0,
        best: secondTrial.best,
        seq: 6,
      },
    ]);
    expect(
      (
        await collectEvents(context.capability.attachOptimizationRun(runId))
      ).map((event) => event.seq),
    ).toEqual([1, 2, 3]);
  });

  it("extends a stopped study from the trials it was told, with a fresh signal", async () => {
    const context = setUp();
    const runId = await startRun(context);
    context.worker.emit({ type: "trial", runId, event: completedTrial });
    await context.capability.cancelOptimizationRun(runId);
    context.worker.emit({ type: "cancelled", runId });

    await context.capability.extendOptimizationRun(runId, 2);
    await flush();

    expect(context.worker.sentOfType("extend")).toEqual([
      { type: "extend", runId, trials: 2, parallelism: 1 },
    ]);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 2,
      trial: 2,
      suggestedValues: { rate: 1, count: 4, enabled: false },
    });
    await flush();
    expect(context.evaluateTrial.mock.calls.at(-1)?.[0]?.signal.aborted).toBe(
      false,
    );
    expect(context.worker.sentOfType("evaluated")).toHaveLength(1);

    context.worker.emit({ type: "complete", runId, summary });
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId, { cursor: 3 }),
    );
    expect(events.map((event) => [event.type, event.seq])).toEqual([
      ["started", 4],
      ["complete", 5],
    ]);
    expect(events[0]).toMatchObject({ requestedTrials: 3 });
  });

  it("rejects extending a run that is running, unknown, released or failed, or past the caps", async () => {
    const context = setUp();
    const runId = await startRun(context);

    await expect(
      context.capability.extendOptimizationRun(runId, 1),
    ).rejects.toThrow("is still running");
    await expect(
      context.capability.extendOptimizationRun("missing", 1),
    ).rejects.toThrow(
      expect.objectContaining({ category: "http", httpStatus: 404 }),
    );

    context.worker.emit({ type: "trial", runId, event: completedTrial });
    context.worker.emit({ type: "complete", runId, summary });
    await expect(
      context.capability.extendOptimizationRun(runId, 0),
    ).rejects.toThrow("positive whole number of trials");
    await expect(
      context.capability.extendOptimizationRun(runId, 1000),
    ).rejects.toThrow(/at most .* trials in total; 1 already ran/);
    await expect(
      context.capability.extendOptimizationRun(runId, 2, { parallelism: 5 }),
    ).rejects.toThrow("between 1 and 4");
    expect(context.worker.sentOfType("extend")).toHaveLength(0);

    await context.capability.extendOptimizationRun(runId, 999);
    await flush();
    expect(context.worker.sentOfType("extend")).toEqual([
      { type: "extend", runId, trials: 999, parallelism: 1 },
    ]);
    context.worker.emit({ type: "complete", runId, summary });
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId, { cursor: 3 }),
    );
    expect(events[0]).toMatchObject({
      type: "started",
      requestedTrials: 1000,
    });

    await context.capability.releaseOptimizationRun(runId);
    await context.capability.releaseOptimizationRun(runId);
    expect(context.worker.sentOfType("release")).toEqual([
      { type: "release", runId },
    ]);
    await expect(
      context.capability.extendOptimizationRun(runId, 1),
    ).rejects.toThrow("released or failed");

    const failed = await startRun(context);
    context.worker.emit({ type: "error", runId: failed, message: "boom" });
    await expect(
      context.capability.extendOptimizationRun(failed, 1),
    ).rejects.toThrow("released or failed");
  });

  it("releasing a running study stops it and ends its stream", async () => {
    const context = setUp();
    const runId = await startRun(context);
    context.worker.emit({
      type: "evaluate",
      runId,
      requestId: 1,
      trial: 0,
      suggestedValues: { rate: 0.5, count: 6, enabled: true },
    });

    await context.capability.releaseOptimizationRun(runId);
    await flush();

    expect(context.worker.sentOfType("cancel")).toEqual([
      { type: "cancel", runId },
    ]);
    expect(context.worker.sentOfType("release")).toEqual([
      { type: "release", runId },
    ]);
    expect(context.worker.sentOfType("evaluated")).toHaveLength(0);
    const events = await collectEvents(
      context.capability.attachOptimizationRun(runId),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
      seq: 2,
    });
  });

  it("stopping a queued extension keeps the study and lets the queue move on", async () => {
    const context = setUp();
    const first = await startRun(context);
    context.worker.emit({ type: "trial", runId: first, event: completedTrial });
    context.worker.emit({ type: "complete", runId: first, summary });
    const { runId: second } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
    );
    await flush();

    await context.capability.extendOptimizationRun(first, 3);
    expect(context.worker.sentOfType("extend")).toHaveLength(0);
    await context.capability.cancelOptimizationRun(first);
    expect(
      (
        await collectEvents(
          context.capability.attachOptimizationRun(first, { cursor: 3 }),
        )
      ).map((event) => [event.type, event.seq]),
    ).toEqual([
      ["started", 4],
      ["error", 5],
    ]);

    await context.capability.extendOptimizationRun(first, 2);
    context.worker.emit({ type: "complete", runId: second, summary });
    await flush();

    expect(context.worker.sentOfType("extend")).toEqual([
      { type: "extend", runId: first, trials: 2, parallelism: 1 },
    ]);
    context.worker.emit({ type: "complete", runId: first, summary });
    const events = await collectEvents(
      context.capability.attachOptimizationRun(first, { cursor: 5 }),
    );
    expect(events.map((event) => [event.type, event.seq])).toEqual([
      ["started", 6],
      ["complete", 7],
    ]);
    expect(events[0]).toMatchObject({ requestedTrials: 3 });
  });

  it("passes the parallelism to the worker and evaluates trials in flight together", async () => {
    const context = setUp();
    const { runId } = await context.capability.createOptimizationRun(
      createOptimizationManifestInput(),
      { parallelism: 3 },
    );
    context.worker.emit({ type: "ready" });
    await flush();
    expect(context.worker.sentOfType("start")[0]?.parallelism).toBe(3);

    for (const [requestId, trial] of [
      [1, 0],
      [2, 1],
    ] as const) {
      context.worker.emit({
        type: "evaluate",
        runId,
        requestId,
        trial,
        suggestedValues: { rate: 0.5, count: 6, enabled: true },
      });
    }
    await flush();
    expect(context.evaluateTrial).toHaveBeenCalledTimes(2);
    expect(
      context.worker.sentOfType("evaluated").map(({ requestId }) => requestId),
    ).toEqual([1, 2]);

    context.worker.emit({ type: "complete", runId, summary });
    await context.capability.extendOptimizationRun(runId, 2);
    await flush();
    expect(context.worker.sentOfType("extend").at(-1)).toMatchObject({
      trials: 2,
      parallelism: 3,
    });

    context.worker.emit({ type: "complete", runId, summary });
    await context.capability.extendOptimizationRun(runId, 1, {
      parallelism: 1,
    });
    await flush();
    expect(context.worker.sentOfType("extend").at(-1)).toMatchObject({
      trials: 1,
      parallelism: 1,
    });

    await expect(
      context.capability.createOptimizationRun(
        createOptimizationManifestInput(),
        { parallelism: 0 },
      ),
    ).rejects.toThrow("between 1 and 4");
  });

  it("refuses to create a run for an already-aborted signal", async () => {
    const context = setUp();
    const controller = createAbortController();
    controller.abort();

    await expect(
      context.capability.createOptimizationRun(
        createOptimizationManifestInput(),
        { signal: controller.signal },
      ),
    ).rejects.toThrow(expect.objectContaining({ name: "AbortError" }));
    expect(context.workers).toHaveLength(0);
  });

  it("rejects an invalid manifest before allocating a run", async () => {
    const context = setUp();

    await expect(
      context.capability.createOptimizationRun({
        ...createOptimizationManifestInput(),
        study: { trials: 0, sampler: "tpe" },
      }),
    ).rejects.toThrow(/Invalid optimization manifest: study\.trials/);
    expect(context.workers).toHaveLength(0);
  });
});
