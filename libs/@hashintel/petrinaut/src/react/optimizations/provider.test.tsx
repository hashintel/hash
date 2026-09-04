/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  petrinautOptimizationInputSchema,
  type PetrinautOptimization,
} from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  PetrinautNavigationProvider,
  usePetrinautNavigation,
} from "../navigation";
import { PetrinautOptimizationContext } from "../optimization-context";
import { ACTIVE_RUNS_STORAGE_KEY } from "./active-run-storage";
import {
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import { OptimizationsProvider } from "./provider";

import type { PetrinautNavigationState } from "../navigation";

const scenario = sirModel.petriNetDefinition.scenarios?.find(
  (candidate) => candidate.id === "scenario__seasonal_flu",
);
const metric = sirModel.petriNetDefinition.metrics?.find(
  (candidate) => candidate.id === "metric__infected_fraction",
);
if (!scenario || !metric) {
  throw new Error("The SIR optimization fixtures are incomplete");
}

const input = petrinautOptimizationInputSchema.parse({
  kind: "petrinaut-optimization",
  version: 1,
  name: "SIR optimization",
  model: {
    title: sirModel.title,
    definition: {
      ...sirModel.petriNetDefinition,
      scenarios: [scenario],
      metrics: [metric],
    },
  },
  scenario: {
    id: scenario.id,
    parameterBindings: {
      population: { kind: "fixed", value: 1_000 },
      infected_ratio: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.001,
          maximum: 0.2,
          scale: "log",
        },
      },
    },
  },
  objective: {
    metricId: "metric__infected_fraction",
    direction: "minimize",
  },
  execution: { seed: 1, dt: 1, maxTime: 180 },
  study: { trials: 2, sampler: "tpe" },
});

const CaptureContext = ({
  onValue,
}: {
  onValue: (value: OptimizationsContextValue) => void;
}) => {
  onValue(use(OptimizationsContext));
  return null;
};

const CaptureNavigation = ({
  onValue,
}: {
  onValue: (value: Readonly<PetrinautNavigationState>) => void;
}) => {
  onValue(usePetrinautNavigation().state);
  return null;
};

function renderProvider(capability: PetrinautOptimization) {
  let latest: OptimizationsContextValue | null = null;
  render(
    <PetrinautOptimizationContext value={capability}>
      <OptimizationsProvider>
        <CaptureContext
          onValue={(value) => {
            latest = value;
          }}
        />
      </OptimizationsProvider>
    </PetrinautOptimizationContext>,
  );

  return () => {
    if (!latest) {
      throw new Error("Optimization context was not captured");
    }
    return latest;
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * A trial event as a detached attachment delivers it — `best: null`, since
 * the service no longer knows the objective direction after the creating
 * request ends; the provider computes the running best itself. `overrides`
 * typically sets `seq` and `objective`.
 */
const trialEvent = (
  trial: number,
  overrides: Record<string, unknown> = {},
) => ({
  type: "trial" as const,
  trial,
  parameters: { infected_ratio: 0.01 * (trial + 1) },
  objective: 0.4 - trial * 0.1,
  state: "complete" as const,
  best: null,
  ...overrides,
});

/**
 * NodeAPI's per-attachment timeout line: terminal for the attachment window,
 * not for the run, so the provider must reconnect. Carries no `seq`.
 */
const retryableErrorEvent = {
  type: "error" as const,
  code: "optimization_timeout",
  message: "The optimization attachment timed out",
  retryable: true,
};

class FakeClassifiedError extends Error {
  category: string;
  hashRequestId: string | null;
  optimizationRunId: string | null;
  httpStatus: number | null;
  retryAfter: number | null;

  constructor(
    message: string,
    options: {
      category: string;
      hashRequestId?: string | null;
      optimizationRunId?: string | null;
      httpStatus?: number | null;
      retryAfter?: number | null;
    },
  ) {
    super(message);
    this.category = options.category;
    this.hashRequestId = options.hashRequestId ?? null;
    this.optimizationRunId = options.optimizationRunId ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }
}

describe("OptimizationsProvider", () => {
  it("replaces the creation overlay with the created optimization location", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-navigation" }),
      async *attachOptimizationRun() {
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 0,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 1,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    let latest: OptimizationsContextValue | null = null;
    let navigationState: Readonly<PetrinautNavigationState> | null = null;

    render(
      <PetrinautOptimizationContext value={capability}>
        <PetrinautNavigationProvider
          initialState={{ overlay: { type: "create-optimization" } }}
        >
          <CaptureNavigation
            onValue={(value) => {
              navigationState = value;
            }}
          />
          <OptimizationsProvider>
            <CaptureContext
              onValue={(value) => {
                latest = value;
              }}
            />
          </OptimizationsProvider>
        </PetrinautNavigationProvider>
      </PetrinautOptimizationContext>,
    );

    let optimizationId = "";
    await act(async () => {
      optimizationId = await latest!.createOptimization(input);
    });

    expect(navigationState).toMatchObject({
      mode: "simulate",
      simulateView: "optimizations",
      simulateResource: { type: "optimization", id: optimizationId },
      overlay: null,
    });
  });

  it("retries a failed optimization from its original input", async () => {
    let call = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => {
        call += 1;
        return call === 1
          ? Promise.reject(
              new FakeClassifiedError("connection interrupted", {
                category: "network",
              }),
            )
          : Promise.resolve({ runId: `run-retry-${call}` });
      },
      async *attachOptimizationRun() {
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 0,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 1,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);
    let failedId = "";

    await act(async () => {
      failedId = await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("error"),
    );

    let retriedId: string | null = null;
    await act(async () => {
      retriedId = await getValue().retryOptimization(failedId);
    });

    expect(retriedId).not.toBeNull();
    expect(retriedId).not.toBe(failedId);
    await waitFor(() =>
      expect(
        getValue().optimizations.find((o) => o.id === retriedId)?.status,
      ).toBe("complete"),
    );
    // The retry reuses the failed run's input, so the failed record remains.
    expect(getValue().optimizations).toHaveLength(2);
  });

  it("runs detached create + attach when the capability supports it", async () => {
    const cursors: number[] = [];
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-1" }),
      // Attachments emit no `started` event: the first line is a trial (or
      // terminal) event.
      async *attachOptimizationRun(_runId, options) {
        cursors.push(options?.cursor ?? -1);
        yield trialEvent(0, { seq: 1 });
        yield trialEvent(1, { seq: 2 });
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 2,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 3,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    const optimization = getValue().optimizations[0]!;
    expect(cursors).toEqual([0]);
    expect(optimization.runId).toBe("run-1");
    expect(optimization.lastSeq).toBe(3);
    expect(optimization.trials).toHaveLength(2);
    expect(optimization.completedTrials).toBe(2);
    // The objective is minimized and no event carried `best`, so the
    // provider computed the running best itself.
    expect(optimization.best).toEqual({
      trial: 1,
      parameters: trialEvent(1).parameters,
      objective: trialEvent(1).objective,
    });
  });

  it("reports a created run as running before any event arrives", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-quiet" }),
      // A quiet run: the attachment is accepted but no event arrives for a
      // long time (attachments emit no `started` event by design).
      // eslint-disable-next-line require-yield -- the run stays quiet until aborted
      async *attachOptimizationRun(_runId, options) {
        options?.onAttached?.();
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", resolve, { once: true });
        });
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("running"),
    );
    expect(getValue().optimizations[0]?.connectionState).toBe("streaming");
    expect(getValue().optimizations[0]?.trials).toHaveLength(0);
  });

  it("reconnects after a network failure, resuming from the last applied seq without duplicating trials or clobbering totals", async () => {
    vi.useFakeTimers();
    const cursors: number[] = [];
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-2" }),
      async *attachOptimizationRun(_runId, options) {
        attachCalls += 1;
        cursors.push(options?.cursor ?? -1);
        if (attachCalls === 1) {
          yield trialEvent(0, { seq: 1, objective: 0.4 });
          throw new FakeClassifiedError("connection interrupted", {
            category: "network",
          });
        }
        // Overlapping replay: the run must skip the already-applied seq 1.
        yield trialEvent(0, { seq: 1, objective: 0.4 });
        // A better post-reconnect objective updates the running best...
        yield trialEvent(1, { seq: 2, objective: 0.2 });
        // ...and a worse one does not (the objective is minimized).
        yield trialEvent(2, { seq: 3, objective: 0.5 });
        yield {
          type: "complete",
          requestedTrials: 3,
          // Attachment summaries are since-cursor, not run totals: the
          // provider must keep its own accumulated counters.
          completedTrials: 2,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 4,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    // Flush the create + first (failing) attachment.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const interrupted = getValue().optimizations[0]!;
    expect(interrupted.status).toBe("running");
    expect(interrupted.connectionState).toBe("reconnecting");
    expect(interrupted.trials).toHaveLength(1);
    expect(interrupted.best?.trial).toBe(0);

    // The first backoff delay elapses and the second attachment completes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const optimization = getValue().optimizations[0]!;
    expect(cursors).toEqual([0, 1]);
    expect(optimization.status).toBe("complete");
    expect(optimization.connectionState).toBeNull();
    // The replayed trial at seq 1 was deduplicated.
    expect(optimization.trials).toHaveLength(3);
    expect(optimization.trials.map((trial) => trial.trial)).toEqual([0, 1, 2]);
    // All trials applied across both attachments, not the since-cursor 2.
    expect(optimization.completedTrials).toBe(3);
    expect(optimization.requestedTrials).toBe(3);
    // The running best crossed the reconnect: trial 1 (0.2) beat trial 0
    // (0.4) and survived trial 2 (0.5).
    expect(optimization.best).toEqual({
      trial: 1,
      parameters: trialEvent(1).parameters,
      objective: 0.2,
    });
    expect(optimization.error).toBeNull();
  });

  it("surfaces the classified failure after repeated reconnects fail and cancels the orphaned run", async () => {
    vi.useFakeTimers();
    let attachCalls = 0;
    const cancelledRunIds: string[] = [];
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-3" }),
      // eslint-disable-next-line require-yield -- every attachment fails before yielding
      async *attachOptimizationRun() {
        attachCalls += 1;
        throw new FakeClassifiedError("connection interrupted", {
          category: "network",
          optimizationRunId: "run-3",
        });
      },
      cancelOptimizationRun: (runId) => {
        cancelledRunIds.push(runId);
        return Promise.resolve();
      },
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    // Walk through every backoff delay (1s, 2s, 4s, ... capped at 30s) until
    // the 8th consecutive failure stops the reconnection loop.
    for (const delayMs of [
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayMs);
      });
    }

    const optimization = getValue().optimizations[0]!;
    expect(attachCalls).toBe(8);
    expect(optimization.status).toBe("error");
    expect(optimization.connectionState).toBeNull();
    expect(optimization.errorCategory).toBe("network");
    expect(optimization.error).toBe(
      "Connection to the optimization service was interrupted after 0 of 2 trials. Retry the optimization. (diagnostic id: run-3)",
    );
    expect(optimization.errorDiagnostics).toEqual({
      hashRequestId: null,
      optimizationRunId: "run-3",
      httpStatus: null,
    });
    // The possibly-live run was cancelled so the account's single-flight
    // frees up. Its stored entry survives on purpose: a cancel's resolution
    // does not prove the server acted (some hosts fire-and-forget), so the
    // next reload's re-attach settles the run's true fate instead.
    expect(cancelledRunIds).toEqual(["run-3"]);
    expect(sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY)).toContain("run-3");
  });

  it("lets Remove cancel a possibly-live run after a terminal error", async () => {
    const cancelledRunIds: string[] = [];
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-10" }),
      // eslint-disable-next-line require-yield -- the attachment is rejected outright
      async *attachOptimizationRun() {
        throw new FakeClassifiedError("Optimization run not found", {
          category: "http",
          httpStatus: 404,
        });
      },
      cancelOptimizationRun: (runId) => {
        cancelledRunIds.push(runId);
        return Promise.resolve();
      },
    };
    const getValue = renderProvider(capability);
    let optimizationId = "";

    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("error"),
    );
    // The attach loop has ended (its live-loop map entry is gone); Remove
    // must still find the run id on the record itself.
    act(() => getValue().removeOptimization(optimizationId));

    expect(cancelledRunIds.at(-1)).toBe("run-10");
    // Once via the give-up path, once via the explicit Remove.
    expect(cancelledRunIds).toHaveLength(2);
    expect(getValue().optimizations).toHaveLength(0);
  });

  it("cancels a detached run server-side and aborts its attachment", async () => {
    const cancelledRunIds: string[] = [];
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-4" }),
      async *attachOptimizationRun(_runId, options) {
        yield trialEvent(0, { seq: 1 });
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", resolve, { once: true });
        });
      },
      cancelOptimizationRun: (runId) => {
        cancelledRunIds.push(runId);
        return Promise.resolve();
      },
    };
    const getValue = renderProvider(capability);
    let optimizationId = "";

    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("running"),
    );

    act(() => getValue().cancelOptimization(optimizationId));

    expect(cancelledRunIds).toEqual(["run-4"]);
    expect(getValue().optimizations[0]?.status).toBe("cancelled");
  });

  it("re-attaches to stored runs after a reload, rebuilding from a full replay", async () => {
    sessionStorage.setItem(
      ACTIVE_RUNS_STORAGE_KEY,
      JSON.stringify({ "run-5": { input, createdAt: 123 } }),
    );
    const cursors: number[] = [];
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "unused" }),
      async *attachOptimizationRun(_runId, options) {
        cursors.push(options?.cursor ?? -1);
        yield trialEvent(0, { seq: 1 });
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 1,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 2,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    const optimization = getValue().optimizations[0]!;
    expect(cursors).toEqual([0]);
    expect(optimization.runId).toBe("run-5");
    expect(optimization.createdAt).toBe(123);
    expect(optimization.trials).toHaveLength(1);
    expect(optimization.completedTrials).toBe(1);
    // The best was rebuilt locally from the replayed trial.
    expect(optimization.best?.trial).toBe(0);
    // The settled run was forgotten so the next reload doesn't re-attach.
    expect(sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY)).toBe("{}");
  });

  it("settles a replayed cancellation as cancelled rather than failed", async () => {
    // The give-up path cancels a possibly-live run and deliberately keeps its
    // stored entry, expecting the next reload to settle it. That replay must
    // report Cancelled — not a failed run offering Retry.
    sessionStorage.setItem(
      ACTIVE_RUNS_STORAGE_KEY,
      JSON.stringify({ "run-6": { input, createdAt: 123 } }),
    );
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "unused" }),
      async *attachOptimizationRun() {
        yield trialEvent(0, { seq: 1 });
        yield {
          type: "error",
          code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
          message: "The optimization was cancelled",
          retryable: false,
          seq: 2,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("cancelled"),
    );
    const optimization = getValue().optimizations[0]!;
    expect(optimization.error).toBeNull();
    expect(optimization.errorCategory).toBeNull();
    // The trial applied before the cancellation is still part of the record.
    expect(optimization.trials).toHaveLength(1);
    expect(sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY)).toBe("{}");
  });

  it("silently drops a stored run the service no longer knows", async () => {
    sessionStorage.setItem(
      ACTIVE_RUNS_STORAGE_KEY,
      JSON.stringify({ "run-6": { input, createdAt: 123 } }),
    );
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "unused" }),
      // eslint-disable-next-line require-yield -- the run is gone server-side
      async *attachOptimizationRun() {
        throw new FakeClassifiedError("Run not found", {
          category: "http",
          httpStatus: 404,
        });
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await waitFor(() => expect(getValue().optimizations).toHaveLength(0));
    expect(sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY)).toBe("{}");
  });

  it("treats a retryable NodeAPI error event as a dropped connection and reconnects", async () => {
    vi.useFakeTimers();
    const cursors: number[] = [];
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-7" }),
      async *attachOptimizationRun(_runId, options) {
        attachCalls += 1;
        cursors.push(options?.cursor ?? -1);
        if (attachCalls === 1) {
          yield trialEvent(0, { seq: 1 });
          // NodeAPI's attachment window died; the run itself continues.
          yield retryableErrorEvent;
          return;
        }
        yield trialEvent(1, { seq: 2 });
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 1,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 3,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getValue().optimizations[0]?.connectionState).toBe("reconnecting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const optimization = getValue().optimizations[0]!;
    expect(cursors).toEqual([0, 1]);
    expect(optimization.status).toBe("complete");
    expect(optimization.trials).toHaveLength(2);
    expect(optimization.completedTrials).toBe(2);
    expect(optimization.error).toBeNull();
  });

  it("surfaces NodeAPI's terminal message after retryable error events exhaust the reconnect cap", async () => {
    vi.useFakeTimers();
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-8" }),
      async *attachOptimizationRun() {
        attachCalls += 1;
        // Every attachment window dies without yielding any progress.
        yield retryableErrorEvent;
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    for (const delayMs of [
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayMs);
      });
    }

    const optimization = getValue().optimizations[0]!;
    expect(attachCalls).toBe(8);
    expect(optimization.status).toBe("error");
    expect(optimization.connectionState).toBeNull();
    expect(optimization.error).toBe("The optimization attachment timed out");
  });

  it("surfaces a mid-run 404 as a classified error without retrying", async () => {
    vi.useFakeTimers();
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-9" }),
      async *attachOptimizationRun() {
        attachCalls += 1;
        if (attachCalls === 1) {
          yield trialEvent(0, { seq: 1 });
          throw new FakeClassifiedError("connection interrupted", {
            category: "network",
          });
        }
        // The run is gone by the time the reconnect lands (e.g. NodeAPI
        // dropped ownership after forwarding the terminal event elsewhere).
        throw new FakeClassifiedError("Optimization run not found", {
          category: "http",
          httpStatus: 404,
        });
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const optimization = getValue().optimizations[0]!;
    expect(optimization.status).toBe("error");
    expect(optimization.errorCategory).toBe("http");
    expect(optimization.error).toContain("(status 404)");

    // No further reconnects are scheduled for the definitive 404.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(attachCalls).toBe(2);
  });

  it("reconnects through a transient gateway error", async () => {
    vi.useFakeTimers();
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-11" }),
      async *attachOptimizationRun() {
        attachCalls += 1;
        if (attachCalls === 1) {
          // NodeAPI is restarting or deploying.
          throw new FakeClassifiedError("Bad gateway", {
            category: "http",
            httpStatus: 503,
          });
        }
        yield trialEvent(0, { seq: 1 });
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 1,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 2,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const optimization = getValue().optimizations[0]!;
    expect(attachCalls).toBe(2);
    expect(optimization.status).toBe("complete");
    expect(optimization.trials).toHaveLength(1);
    expect(optimization.error).toBeNull();
  });

  it("explains a busy service when creation is rejected with 429", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () =>
        Promise.reject(
          new FakeClassifiedError("Too many optimization requests", {
            category: "http",
            httpStatus: 429,
            retryAfter: 30,
          }),
        ),
      // eslint-disable-next-line require-yield -- creation is rejected before any attachment
      async *attachOptimizationRun() {
        throw new Error("Nothing to attach to");
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("error"),
    );
    expect(getValue().optimizations[0]?.error).toBe(
      "The optimization service is busy — another optimization may already be running for your account. Try again in ~30s.",
    );
  });

  it("does not duplicate restored runs under StrictMode double-mounting", async () => {
    sessionStorage.setItem(
      ACTIVE_RUNS_STORAGE_KEY,
      JSON.stringify({ "run-12": { input, createdAt: 123 } }),
    );
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "unused" }),
      async *attachOptimizationRun() {
        yield trialEvent(0, { seq: 1 });
        yield {
          type: "complete",
          requestedTrials: 2,
          completedTrials: 1,
          prunedTrials: 0,
          failedTrials: 0,
          best: null,
          seq: 2,
        };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };

    let latest: OptimizationsContextValue | null = null;
    render(
      <StrictMode>
        <PetrinautOptimizationContext value={capability}>
          <OptimizationsProvider>
            <CaptureContext
              onValue={(value) => {
                latest = value;
              }}
            />
          </OptimizationsProvider>
        </PetrinautOptimizationContext>
      </StrictMode>,
    );
    const getValue = () => {
      if (!latest) {
        throw new Error("Optimization context was not captured");
      }
      return latest;
    };

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    // The double-invoked effect cleaned its first pass up instead of
    // re-attaching the same stored run twice.
    expect(getValue().optimizations).toHaveLength(1);
    expect(getValue().optimizations[0]?.runId).toBe("run-12");
  });

  it("restores the streaming state as soon as a quiet reattachment is accepted", async () => {
    vi.useFakeTimers();
    let attachCalls = 0;
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-13" }),
      async *attachOptimizationRun(_runId, options) {
        attachCalls += 1;
        if (attachCalls === 1) {
          options?.onAttached?.();
          yield trialEvent(0, { seq: 1 });
          throw new FakeClassifiedError("connection interrupted", {
            category: "network",
          });
        }
        // The reattachment is accepted but the run stays quiet: no events.
        options?.onAttached?.();
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", resolve, { once: true });
        });
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getValue().optimizations[0]?.connectionState).toBe("reconnecting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const optimization = getValue().optimizations[0]!;
    expect(attachCalls).toBe(2);
    // No event has arrived yet, but the accepted attachment already cleared
    // the reconnecting indicator.
    expect(optimization.connectionState).toBe("streaming");
    expect(optimization.status).toBe("running");
    expect(optimization.error).toBeNull();
  });
});
