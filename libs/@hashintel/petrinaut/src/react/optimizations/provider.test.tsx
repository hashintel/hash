/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
} from "@hashintel/petrinaut-core";
import {
  type PetrinautConnectedOptimization,
  resolveTrialScenarioParameterValues,
} from "@hashintel/petrinaut-core/optimization";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
} from "../experiments/context";
import {
  PetrinautNavigationProvider,
  usePetrinautNavigation,
} from "../navigation";
import { PetrinautOptimizationContext } from "../optimization-context";
import { UserSettingsContext } from "../state/user-settings-context";
import {
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import {
  completedRunResult,
  createFakeDetachedObjectiveRuns,
  distributionFrame,
} from "./fake-detached-objective-runs.fixtures";
import { OptimizationsProvider } from "./provider";
import {
  sirOptimizationInput,
  sirOptimizationMetric,
} from "./sir-optimization-input.fixtures";
import {
  buildOptimizationSurfaceAxes,
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "./surface-grid";

import type { PetrinautNavigationState } from "../navigation";
import type { PropsWithChildren } from "react";

const input = sirOptimizationInput;
const metricId = sirOptimizationMetric.id;
const infectedRatioAxis = buildOptimizationSurfaceAxes(input)[0]!;

/** An event before a fake log stamps its `seq`, each variant on its own. */
type UnsequencedEvent = PetrinautOptimizationEvent extends infer Event
  ? Event extends unknown
    ? Omit<Event, "seq">
    : never
  : never;

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

/** Overrides the In-browser optimization setting below the default context. */
const InBrowserOptimizationSetting = ({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...value, enableInBrowserOptimization: enabled }}
    >
      {children}
    </UserSettingsContext>
  );
};

/** Routes the provider's detached objective runs to a fake. */
const ExperimentsActionsOverride = ({
  runDetachedObjective,
  children,
}: PropsWithChildren<{
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
}>) => {
  const value = use(ExperimentsActionsContext);
  return (
    <ExperimentsActionsContext value={{ ...value, runDetachedObjective }}>
      {children}
    </ExperimentsActionsContext>
  );
};

/**
 * A connected source whose runs stay quiet until aborted, counting connections
 * and disposals so tests can observe what the setting gates.
 */
const createQuietConnectedSource = () => {
  const calls = { connect: 0, dispose: 0 };
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: () => {
      calls.connect += 1;
      return {
        createOptimizationRun: () =>
          Promise.resolve({ runId: "run-quiet-connected" }),
        // eslint-disable-next-line require-yield -- the run stays quiet until aborted
        async *attachOptimizationRun(_runId, options) {
          options?.onAttached?.();
          await new Promise<void>((resolve) => {
            options?.signal?.addEventListener("abort", resolve, {
              once: true,
            });
          });
        },
        cancelOptimizationRun: () => Promise.resolve(),
        extendOptimizationRun: () => Promise.resolve(),
        releaseOptimizationRun: () => Promise.resolve(),
        dispose: () => {
          calls.dispose += 1;
        },
      };
    },
  };
  return { source, calls };
};

/**
 * A connected source whose study evaluates one trial per value through the
 * channel, in order, then completes — the shape of the in-browser optimizer.
 */
const createEvaluatingSource = (infectedRatios: readonly number[]) => {
  const calls = { connect: 0, dispose: 0 };
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: (channel) => {
      calls.connect += 1;
      return {
        createOptimizationRun: () =>
          Promise.resolve({ runId: "run-connected" }),
        async *attachOptimizationRun(runId, options) {
          options?.onAttached?.();
          let seq = 0;
          for (const [trial, infectedRatio] of infectedRatios.entries()) {
            const suggestedValues = { infected_ratio: infectedRatio };
            const outcome = await channel.evaluateTrial({
              runId,
              trial,
              manifest: input,
              suggestedValues,
              scenarioParameterValues: resolveTrialScenarioParameterValues(
                input,
                suggestedValues,
              ),
              seeds: [1, 2, 3],
              signal: options?.signal ?? new AbortController().signal,
            });
            seq += 1;
            yield {
              type: "trial",
              trial,
              parameters: suggestedValues,
              objective:
                outcome.kind === "objective" ? outcome.objective : null,
              state: outcome.kind === "objective" ? "complete" : "pruned",
              best: null,
              seq,
            };
          }
          seq += 1;
          yield {
            type: "complete",
            requestedTrials: infectedRatios.length,
            completedTrials: infectedRatios.length,
            prunedTrials: 0,
            failedTrials: 0,
            best: null,
            seq,
          };
        },
        cancelOptimizationRun: () => Promise.resolve(),
        extendOptimizationRun: () => Promise.resolve(),
        releaseOptimizationRun: () => Promise.resolve(),
        dispose: () => {
          calls.dispose += 1;
        },
      };
    },
  };
  return { source, calls };
};

const renderConnectedProvider = ({
  source,
  runDetachedObjective,
  enabled = true,
}: {
  source: PetrinautConnectedOptimization;
  runDetachedObjective: ExperimentsActionsValue["runDetachedObjective"];
  enabled?: boolean;
}) => {
  let latest: OptimizationsContextValue | null = null;
  const tree = (isEnabled: boolean) => (
    <InBrowserOptimizationSetting enabled={isEnabled}>
      <PetrinautOptimizationContext value={source}>
        <ExperimentsActionsOverride runDetachedObjective={runDetachedObjective}>
          <OptimizationsProvider>
            <CaptureContext
              onValue={(value) => {
                latest = value;
              }}
            />
          </OptimizationsProvider>
        </ExperimentsActionsOverride>
      </PetrinautOptimizationContext>
    </InBrowserOptimizationSetting>
  );
  const { rerender, unmount } = render(tree(enabled));
  return {
    getValue: () => {
      if (!latest) {
        throw new Error("Optimization context was not captured");
      }
      return latest;
    },
    setEnabled: (isEnabled: boolean) => rerender(tree(isEnabled)),
    unmount,
  };
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
    expect(
      sessionStorage.getItem("petrinaut:active-optimization-runs"),
    ).toContain("run-3");
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
      "petrinaut:active-optimization-runs",
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
    expect(sessionStorage.getItem("petrinaut:active-optimization-runs")).toBe(
      "{}",
    );
  });

  it("settles a replayed cancellation as cancelled rather than failed", async () => {
    // The give-up path cancels a possibly-live run and deliberately keeps its
    // stored entry, expecting the next reload to settle it. That replay must
    // report Cancelled — not a failed run offering Retry.
    sessionStorage.setItem(
      "petrinaut:active-optimization-runs",
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
    expect(sessionStorage.getItem("petrinaut:active-optimization-runs")).toBe(
      "{}",
    );
  });

  it("silently drops a stored run the service no longer knows", async () => {
    sessionStorage.setItem(
      "petrinaut:active-optimization-runs",
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
    expect(sessionStorage.getItem("petrinaut:active-optimization-runs")).toBe(
      "{}",
    );
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
      "petrinaut:active-optimization-runs",
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

  it("treats a connected source as absent while In-browser optimization is off", async () => {
    const { source, calls } = createQuietConnectedSource();
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
      enabled: false,
    });

    await expect(getValue().createOptimization(input)).rejects.toThrow(
      "Optimization is unavailable",
    );
    expect(calls.connect).toBe(0);
    expect(getValue().optimizations).toHaveLength(0);
  });

  it("connects and disposes a connected source as In-browser optimization is toggled", async () => {
    const { source, calls } = createQuietConnectedSource();
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue, setEnabled } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("running"),
    );
    expect(calls).toEqual({ connect: 1, dispose: 0 });
    expect(getValue().optimizations[0]?.navigation).toEqual({
      positions: { infected_ratio: 25 },
      booleans: {},
      followTrials: true,
    });
    expect(
      sessionStorage.getItem("petrinaut:active-optimization-runs"),
      "a run in this page cannot be re-attached to after a reload",
    ).toBeNull();

    setEnabled(false);
    expect(calls).toEqual({ connect: 1, dispose: 1 });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("cancelled"),
    );
    await expect(getValue().createOptimization(input)).rejects.toThrow(
      "Optimization is unavailable",
    );

    setEnabled(true);
    await act(async () => {
      await getValue().createOptimization(input);
    });
    expect(calls).toEqual({ connect: 2, dispose: 1 });
  });

  it("does not re-attach stored runs through a connected source", async () => {
    sessionStorage.setItem(
      "petrinaut:active-optimization-runs",
      JSON.stringify({ "run-stale": { input, createdAt: 1 } }),
    );
    const { source, calls } = createQuietConnectedSource();
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(calls.connect).toBe(0);
    expect(getValue().optimizations).toHaveLength(0);
    expect(
      sessionStorage.getItem("petrinaut:active-optimization-runs"),
    ).not.toBeNull();
  });

  it("uses a remote capability regardless of the In-browser optimization setting", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-remote" }),
      async *attachOptimizationRun(_runId, options) {
        options?.onAttached?.();
        yield { type: "started", requestedTrials: 2, seq: 1 };
      },
      cancelOptimizationRun: () => Promise.resolve(),
    };
    let latest: OptimizationsContextValue | null = null;
    render(
      <InBrowserOptimizationSetting enabled={false}>
        <PetrinautOptimizationContext value={capability}>
          <OptimizationsProvider>
            <CaptureContext
              onValue={(value) => {
                latest = value;
              }}
            />
          </OptimizationsProvider>
        </PetrinautOptimizationContext>
      </InBrowserOptimizationSetting>,
    );
    const getValue = () => {
      if (!latest) {
        throw new Error("Optimization context was not captured");
      }
      return latest;
    };

    await act(async () => {
      await getValue().createOptimization(input, { computeBackend: "webgpu" });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.runId).toBe("run-remote"),
    );
    // A remote study computes nothing locally: no backend choice, no navigation.
    expect(getValue().optimizations[0]).toMatchObject({
      computeBackend: "cpu",
      navigation: null,
      selection: null,
      axes: [expect.objectContaining({ identifier: "infected_ratio" })],
    });
  });

  it("evaluates a connected study's trials through runDetachedObjective, following each step, then refines the selection", async () => {
    const { source, calls } = createEvaluatingSource([0.05, 0.02]);
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue, unmount } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input, {
        computeBackend: "webgpu",
      });
    });

    // Trial 0 runs on the study's backend with its seeds pinned, and the
    // navigation follows it while its batch streams as the selection.
    await waitFor(() => expect(fake.runs).toHaveLength(1));
    expect(fake.runs[0]!.request).toMatchObject({
      cacheKey: "run-connected",
      seed: 1,
      runCount: 3,
      runSeeds: [1, 2, 3],
      computeBackend: "webgpu",
      scenarioParameterValues: { population: 1_000, infected_ratio: 0.05 },
    });
    const followedPosition = optimizationAxisPositionFor(
      infectedRatioAxis,
      0.05,
    );
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection?.key).toBe("trial:0"),
    );
    expect(getValue().optimizations[0]).toMatchObject({
      computeBackend: "webgpu",
      computeBackendFallbackReason: null,
      navigation: {
        positions: { infected_ratio: followedPosition },
        followTrials: true,
      },
      selection: { key: "trial:0", runTarget: null, computing: true },
    });
    const streamed = distributionFrame(metricId, 1, [[0.2, 3]]);
    fake.runs[0]!.frames.set([streamed]);
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection?.metricFrames).toEqual([
        streamed,
      ]),
    );

    // Its outcome reaches Optuna; the first fallback reason lands on the record.
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
        runValues: [0.25, 0.25, 0.25],
        computeBackend: "cpu",
        fallbackReason: "no adapter",
      }),
    );
    await waitFor(() => expect(fake.runs).toHaveLength(2));
    await waitFor(() =>
      expect(getValue().optimizations[0]?.trials).toEqual([
        expect.objectContaining({
          trial: 0,
          objective: 0.25,
          state: "complete",
        }),
      ]),
    );
    // The record names the backend the trials ran on, not the one asked for.
    expect(getValue().optimizations[0]).toMatchObject({
      computeBackend: "cpu",
      computeBackendFallbackReason: "no adapter",
    });
    expect(getValue().optimizations[0]?.selection?.key).toBe("trial:1");
    expect(
      getValue().optimizations[0]?.navigation?.positions.infected_ratio,
    ).toBe(optimizationAxisPositionFor(infectedRatioAxis, 0.02));

    fake.runs[1]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.125, 3]])],
        runValues: [0.125, 0.125, 0.125],
      }),
    );
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    expect(getValue().optimizations[0]?.best).toMatchObject({
      trial: 1,
      objective: 0.125,
    });

    // Complete: the selection refines at the followed point, up the ladder.
    const lastPosition = optimizationAxisPositionFor(infectedRatioAxis, 0.02);
    await waitFor(() => expect(fake.runs).toHaveLength(3));
    expect(fake.runs[2]!.request).toMatchObject({
      cacheKey: optimizationId,
      computeBackend: "webgpu",
      seed: 1,
      runCount: 8,
      scenarioParameterValues: {
        population: 1_000,
        infected_ratio: optimizationAxisValueAt(
          infectedRatioAxis,
          lastPosition,
        ),
      },
    });
    expect(fake.runs[2]!.request.runSeeds).toBeUndefined();
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection).toMatchObject({
        key: `infected_ratio=${lastPosition}`,
        runsCompleted: 0,
        runTarget: 8,
        computing: true,
      }),
    );
    fake.runs[2]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.1, 8]])],
        runsCompleted: 8,
      }),
    );
    await waitFor(() => expect(fake.runs).toHaveLength(4));
    expect(fake.runs[3]!.request.runCount).toBe(17);
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection).toMatchObject({
        runsCompleted: 8,
        runTarget: 25,
        computing: true,
      }),
    );

    // A navigation change cancels the batch in flight and refines the new point.
    act(() => {
      getValue().setOptimizationNavigation(optimizationId, {
        positions: { infected_ratio: 3 },
      });
    });
    expect(fake.runs[3]!.cancelled).toBe(true);
    await waitFor(() => expect(fake.runs).toHaveLength(5));
    expect(fake.runs[4]!.request).toMatchObject({
      runCount: 8,
      scenarioParameterValues: {
        infected_ratio: optimizationAxisValueAt(infectedRatioAxis, 3),
      },
    });
    expect(getValue().optimizations[0]?.selection?.key).toBe(
      "infected_ratio=3",
    );

    // Removing the study cancels its batches; unmounting disposes the source.
    act(() => getValue().removeOptimization(optimizationId));
    expect(fake.runs[4]!.cancelled).toBe(true);
    expect(getValue().optimizations).toHaveLength(0);
    expect(calls).toEqual({ connect: 1, dispose: 0 });
    unmount();
    expect(calls).toEqual({ connect: 1, dispose: 1 });
  });

  it("lets a user move stop following while the study runs, refining beside the trials", async () => {
    const { source } = createEvaluatingSource([0.05, 0.02]);
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection?.key).toBe("trial:0"),
    );
    expect(fake.runs[0]!.request.computeBackend).toBe("cpu");

    act(() => {
      getValue().setOptimizationNavigation(optimizationId, {
        positions: { infected_ratio: 40 },
      });
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.navigation).toEqual({
        positions: { infected_ratio: 40 },
        booleans: {},
        followTrials: false,
      }),
    );
    expect(fake.runs[1]!.request).toMatchObject({
      cacheKey: optimizationId,
      computeBackend: "cpu",
      runCount: 8,
      scenarioParameterValues: {
        infected_ratio: optimizationAxisValueAt(infectedRatioAxis, 40),
      },
    });
    expect(getValue().optimizations[0]?.selection?.key).toBe(
      "infected_ratio=40",
    );

    // The next trial starts without moving the navigation or the selection.
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
        runValues: [0.25, 0.25, 0.25],
      }),
    );
    await waitFor(() => expect(fake.runs).toHaveLength(3));
    expect(fake.runs[2]!.request.cacheKey).toBe("run-connected");
    expect(getValue().optimizations[0]?.navigation?.positions).toEqual({
      infected_ratio: 40,
    });
    expect(getValue().optimizations[0]?.selection?.key).toBe(
      "infected_ratio=40",
    );
    expect(fake.runs[1]!.cancelled).toBe(false);
  });
});

/**
 * A connected source shaped like the in-browser optimizer's lifecycle: a run
 * log in segments, each begun by `started` and ended by a terminal event,
 * which a settled study continues with more trials; a stop ends the segment
 * once the trial in flight has settled. Segment `n` evaluates
 * `ratiosBySegment[n]`, one trial per value, through the channel.
 */
const createResumableSource = (
  ratiosBySegment: readonly (readonly number[])[],
  { rejectExtension }: { rejectExtension?: string } = {},
) => {
  const calls = { extend: [] as number[], release: [] as string[], cancel: 0 };
  // The cancelled terminal is the worker's own message, sent once the pruned
  // steps in flight have reported; a test decides when it arrives.
  let closeStoppedSegment: () => void = () => {};
  const source: PetrinautConnectedOptimization = {
    kind: "connected",
    connect: (channel) => {
      const events: PetrinautOptimizationEvent[] = [];
      const listeners = new Set<() => void>();
      let controller = new AbortController();
      let segment = 0;
      let trial = 0;
      let requested = 0;
      let running = false;
      let cancelled = false;
      // Read through a call so the flag is re-checked after each await (a
      // plain property read would be control-flow-narrowed to `false`).
      const isCancelled = () => cancelled;
      const append = (event: UnsequencedEvent) => {
        events.push({
          ...event,
          seq: events.length + 1,
        } as PetrinautOptimizationEvent);
        for (const listener of listeners) {
          listener();
        }
      };
      const runSegment = async (ratios: readonly number[]) => {
        running = true;
        cancelled = false;
        for (const ratio of ratios) {
          if (isCancelled()) {
            break;
          }
          const suggestedValues = { infected_ratio: ratio };
          const outcome = await channel.evaluateTrial({
            runId: "run-resumable",
            trial,
            manifest: input,
            suggestedValues,
            scenarioParameterValues: resolveTrialScenarioParameterValues(
              input,
              suggestedValues,
            ),
            seeds: [1, 2, 3],
            signal: controller.signal,
          });
          append({
            type: "trial",
            trial,
            parameters: suggestedValues,
            objective: outcome.kind === "objective" ? outcome.objective : null,
            state: outcome.kind === "objective" ? "complete" : "pruned",
            best: null,
          });
          trial += 1;
        }
        if (isCancelled()) {
          await new Promise<void>((resolve) => {
            closeStoppedSegment = resolve;
          });
        }
        running = false;
        append(
          isCancelled()
            ? {
                type: "error",
                code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
                message: "optimization cancelled",
                retryable: false,
              }
            : {
                type: "complete",
                requestedTrials: requested,
                completedTrials: trial,
                prunedTrials: 0,
                failedTrials: 0,
                best: null,
              },
        );
      };
      return {
        createOptimizationRun: () => {
          const ratios = ratiosBySegment[0] ?? [];
          requested = ratios.length;
          append({ type: "started", requestedTrials: requested });
          // The worker asks for its first evaluation a task after the run
          // is created, once the provider knows the run id.
          setTimeout(() => void runSegment(ratios), 0);
          return Promise.resolve({ runId: "run-resumable" });
        },
        extendOptimizationRun: (_runId, trials) => {
          if (rejectExtension !== undefined) {
            return Promise.reject(new Error(rejectExtension));
          }
          if (running) {
            return Promise.reject(new Error("still running"));
          }
          calls.extend.push(trials);
          segment += 1;
          requested += trials;
          controller = new AbortController();
          append({ type: "started", requestedTrials: requested });
          const ratios = ratiosBySegment[segment] ?? [];
          setTimeout(() => void runSegment(ratios), 0);
          return Promise.resolve();
        },
        async *attachOptimizationRun(_runId, options) {
          options?.onAttached?.();
          let index = options?.cursor ?? 0;
          for (;;) {
            const event = events[index];
            if (event) {
              index += 1;
              yield event;
              if (event.type === "complete" || event.type === "error") {
                return;
              }
              continue;
            }
            await new Promise<void>((resolve) => {
              const wake = () => {
                listeners.delete(wake);
                resolve();
              };
              listeners.add(wake);
              options?.signal?.addEventListener("abort", wake, { once: true });
            });
            if (options?.signal?.aborted) {
              return;
            }
          }
        },
        cancelOptimizationRun: () => {
          calls.cancel += 1;
          cancelled = true;
          controller.abort();
          return Promise.resolve();
        },
        releaseOptimizationRun: (runId) => {
          calls.release.push(runId);
          return Promise.resolve();
        },
        dispose: () => {},
      };
    },
  };
  return { source, calls, closeStoppedSegment: () => closeStoppedSegment() };
};

describe("OptimizationsProvider lifecycle of a connected study", () => {
  it("settles on the best, then continues from its cursor, following the new steps", async () => {
    const { source, calls } = createResumableSource([[0.05], [0.02]]);
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input, {
        parallelism: 2,
      });
    });
    await waitFor(() => expect(fake.runs).toHaveLength(1));
    expect(fake.runs[0]!.request.queueKey).toBe("run-resumable:trial:0");
    await waitFor(() =>
      expect(getValue().optimizations[0]).toMatchObject({
        parallelism: 2,
        resumable: false,
        inFlight: [
          { trial: 0, parameters: { infected_ratio: 0.05 }, objective: null },
        ],
        activity: [expect.objectContaining({ label: "Step 1", runCount: 3 })],
      }),
    );

    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
        runValues: [0.25, 0.25, 0.25],
      }),
    );
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    // Following ended where the study did best, and that point refines.
    const bestPosition = optimizationAxisPositionFor(infectedRatioAxis, 0.05);
    expect(getValue().optimizations[0]).toMatchObject({
      resumable: true,
      requestedTrials: 1,
      navigation: {
        positions: { infected_ratio: bestPosition },
        followTrials: false,
      },
      inFlight: [],
    });
    await waitFor(() => expect(fake.runs).toHaveLength(2));
    expect(fake.runs[1]!.request).toMatchObject({
      cacheKey: optimizationId,
      scenarioParameterValues: {
        infected_ratio: optimizationAxisValueAt(
          infectedRatioAxis,
          bestPosition,
        ),
      },
    });

    await act(async () => {
      await getValue().extendOptimization(optimizationId, 1);
    });
    expect(calls.extend).toEqual([1]);
    expect(fake.runs[1]!.cancelled).toBe(true);
    await waitFor(() =>
      expect(getValue().optimizations[0]).toMatchObject({
        status: "running",
        resumable: false,
        requestedTrials: 2,
        navigation: { followTrials: true },
      }),
    );
    await waitFor(() => expect(fake.runs).toHaveLength(3));
    expect(fake.runs[2]!.request.queueKey).toBe("run-resumable:trial:1");
    await waitFor(() =>
      expect(getValue().optimizations[0]?.selection?.key).toBe("trial:1"),
    );

    fake.runs[2]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.125, 3]])],
        runValues: [0.125, 0.125, 0.125],
      }),
    );
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    expect(getValue().optimizations[0]).toMatchObject({
      resumable: true,
      requestedTrials: 2,
      completedTrials: 2,
      trials: [
        expect.objectContaining({ trial: 0 }),
        expect.objectContaining({ trial: 1 }),
      ],
    });
    expect(getValue().optimizations[0]?.best).toMatchObject({
      trial: 1,
      objective: 0.125,
    });

    act(() => getValue().removeOptimization(optimizationId));
    expect(calls.release).toEqual(["run-resumable"]);
    expect(getValue().optimizations).toHaveLength(0);
  });

  it("stops a study without dropping its attachment, so the segment's terminal event lands before a continuation", async () => {
    const { source, calls, closeStoppedSegment } = createResumableSource([
      [0.05, 0.02],
      [0.01],
    ]);
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() => expect(fake.runs).toHaveLength(1));

    act(() => getValue().cancelOptimization(optimizationId));
    expect(calls.cancel).toBe(1);
    expect(getValue().optimizations[0]).toMatchObject({
      status: "cancelled",
      resumable: false,
    });
    // The trial in flight is pruned as cancelled and reports before the
    // worker acknowledges the stop.
    await waitFor(() => expect(getValue().optimizations[0]?.lastSeq).toBe(2));
    expect(getValue().optimizations[0]).toMatchObject({
      status: "cancelled",
      resumable: false,
      prunedTrials: 1,
    });
    closeStoppedSegment();
    await waitFor(() => expect(getValue().optimizations[0]?.lastSeq).toBe(3));
    expect(getValue().optimizations[0]).toMatchObject({
      status: "cancelled",
      resumable: true,
      prunedTrials: 1,
    });

    await act(async () => {
      await getValue().extendOptimization(optimizationId, 1);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]).toMatchObject({
        status: "running",
        requestedTrials: 3,
        lastSeq: 4,
      }),
    );
    // The stop settled the study on a point, which began refining (the
    // second run); the continuation cancels that and runs the new trial.
    await waitFor(() => expect(fake.runs).toHaveLength(3));
    expect(fake.runs[1]!.request.cacheKey).toBe(optimizationId);
    expect(fake.runs[1]!.cancelled).toBe(true);
    // The stopped segment asked for its second trial never, so numbering
    // continues from the pruned one.
    expect(fake.runs[2]!.request).toMatchObject({
      queueKey: "run-resumable:trial:1",
      scenarioParameterValues: { infected_ratio: 0.01 },
    });
  });

  it("puts a refused continuation on the record and leaves the study resumable", async () => {
    const { source } = createResumableSource([[0.05]], {
      rejectExtension: "An optimization may run at most 1,000 trials in total",
    });
    const fake = createFakeDetachedObjectiveRuns();
    const { getValue } = renderConnectedProvider({
      source,
      runDetachedObjective: fake.runDetachedObjective,
    });

    let optimizationId = "";
    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() => expect(fake.runs).toHaveLength(1));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
        runValues: [0.25, 0.25, 0.25],
      }),
    );
    await waitFor(() =>
      expect(getValue().optimizations[0]?.resumable).toBe(true),
    );

    await expect(
      getValue().extendOptimization(optimizationId, 999),
    ).rejects.toThrow("at most 1,000 trials");
    // The refusal's state update landed outside an act scope; flush it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(getValue().optimizations[0]).toMatchObject({
      status: "complete",
      resumable: true,
      error: "An optimization may run at most 1,000 trials in total",
    });
  });

  it("never marks a remote run resumable", async () => {
    const capability: PetrinautOptimization = {
      createOptimizationRun: () => Promise.resolve({ runId: "run-remote-2" }),
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

    await act(async () => {
      await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    expect(getValue().optimizations[0]?.resumable).toBe(false);
    await expect(
      getValue().extendOptimization(getValue().optimizations[0]!.id, 1),
    ).rejects.toThrow("cannot be continued");
  });
});
