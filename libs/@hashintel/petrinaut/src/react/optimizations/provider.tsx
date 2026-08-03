import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  petrinautOptimizationInputSchema,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { PetrinautOptimizationContext } from "../optimization-context";
import {
  readStoredActiveRuns,
  removeStoredActiveRun,
  storeActiveRun,
} from "./active-run-storage";
import {
  type OptimizationBest,
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import { abortableDelay, decideAttachFailure } from "./reconnect-policy";
import {
  buildErrorMessage,
  type ClassifiedError,
  classifyError,
  isAbortFailure,
} from "./transport-errors";

import type { PropsWithChildren } from "react";

/**
 * Fold a completed trial into the running best. Attachments deliver
 * `best: null`, so the provider maintains the best itself from every trial it
 * applies; `event.best` is still preferred when present, and would be
 * authoritative if the optimizer ever stamped it onto replayable frames.
 */
const computeRunningBest = (
  current: OptimizationRecord,
  event: Extract<PetrinautOptimizationEvent, { type: "trial" }>,
): OptimizationBest | null => {
  if (event.state !== "complete" || event.objective === null) {
    return current.best;
  }
  const isBetter =
    current.best === null ||
    (current.input.objective.direction === "maximize"
      ? event.objective > current.best.objective
      : event.objective < current.best.objective);
  return isBetter
    ? {
        trial: event.trial,
        parameters: event.parameters,
        objective: event.objective,
      }
    : current.best;
};

/**
 * A NodeAPI-authored terminal error event with `retryable: true`: the
 * per-attachment window died (overall or idle timeout) while the run itself
 * may still be live. Thrown inside the attach loop so the shared
 * reconnect-with-cursor path handles it like a dropped connection; only if
 * reconnecting is exhausted is the event applied as the run's terminal error.
 */
class RetryableRunInterruption extends Error {
  readonly event: Extract<PetrinautOptimizationEvent, { type: "error" }>;

  constructor(event: Extract<PetrinautOptimizationEvent, { type: "error" }>) {
    super(event.message);
    this.name = "RetryableRunInterruption";
    this.event = event;
  }
}

const createOptimizationRecord = (
  id: string,
  input: PetrinautOptimizationInput,
  overrides: Partial<OptimizationRecord> = {},
): OptimizationRecord => ({
  id,
  input,
  createdAt: Date.now(),
  status: "initializing",
  error: null,
  errorCategory: null,
  errorDiagnostics: null,
  runId: null,
  lastSeq: 0,
  connectionState: null,
  requestedTrials: input.study.trials,
  completedTrials: 0,
  prunedTrials: 0,
  failedTrials: 0,
  trials: [],
  best: null,
  ...overrides,
});

export const OptimizationsProvider = ({ children }: PropsWithChildren) => {
  const capability = use(PetrinautOptimizationContext);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  /** Server run ids of active detached runs, keyed by record id. */
  const runIdsRef = useRef(new Map<string, string>());
  const [optimizations, setOptimizations] = useState<OptimizationRecord[]>([]);
  const [selectedOptimizationId, setSelectedOptimizationId] = useState<
    string | null
  >(null);

  useBlockWindowClose({
    shouldBlock: optimizations.some(isOptimizationActive),
  });

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    return () => {
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
    };
  }, []);

  const patchOptimization = useCallback(
    (
      optimizationId: string,
      updater: (optimization: OptimizationRecord) => OptimizationRecord,
    ) => {
      setOptimizations((current) =>
        current.map((optimization) =>
          optimization.id === optimizationId
            ? updater(optimization)
            : optimization,
        ),
      );
    },
    [],
  );

  const dropOptimizationRecord = useCallback((optimizationId: string) => {
    setOptimizations((current) =>
      current.filter((optimization) => optimization.id !== optimizationId),
    );
    setSelectedOptimizationId((current) =>
      current === optimizationId ? null : current,
    );
  }, []);

  const markOptimizationCancelled = useCallback(
    (optimizationId: string) => {
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "cancelled",
        error: null,
        errorCategory: null,
        errorDiagnostics: null,
        connectionState: null,
      }));
    },
    [patchOptimization],
  );

  const markOptimizationFailed = useCallback(
    (
      optimizationId: string,
      error: unknown,
      classified: ClassifiedError | null,
    ) => {
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "error",
        connectionState: null,
        // A classified transport failure yields a safe, actionable message
        // and correlation ids; anything else keeps its message.
        error: classified
          ? buildErrorMessage(classified, current)
          : error instanceof Error
            ? error.message
            : String(error),
        errorCategory: classified?.category ?? null,
        errorDiagnostics: classified?.diagnostics ?? null,
      }));
    },
    [patchOptimization],
  );

  /**
   * Fold one canonical optimizer event into the record, causing a single
   * state update per event.
   */
  const applyOptimizationEvent = useCallback(
    (
      optimizationId: string,
      event: PetrinautOptimizationEvent,
      options: {
        /** Stream-level fields (resume cursor, connection state). */
        extra?: Partial<OptimizationRecord>;
      } = {},
    ) => {
      const { extra = {} } = options;
      switch (event.type) {
        case "started":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            status: "running",
            requestedTrials: event.requestedTrials,
          }));
          break;
        case "trial":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            status: "running",
            completedTrials:
              current.completedTrials + (event.state === "complete" ? 1 : 0),
            prunedTrials:
              current.prunedTrials + (event.state === "pruned" ? 1 : 0),
            failedTrials:
              current.failedTrials + (event.state === "failed" ? 1 : 0),
            trials: [...current.trials, event],
            best: event.best ?? computeRunningBest(current, event),
          }));
          break;
        case "complete":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            status: "complete",
            connectionState: null,
            // The complete event's requested-trial count is the true total,
            // but its completed/pruned/failed counts only cover the frames
            // this attachment observed (everything past its cursor), so the
            // record's own accumulated counters and running best stay
            // authoritative.
            requestedTrials: event.requestedTrials,
            best: event.best ?? current.best,
          }));
          break;
        case "error":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            connectionState: null,
            /**
             * A cancellation reaches us as a non-retryable error event — the
             * stream has no type of its own for it. It is an outcome, not a
             * failure, so settle it exactly as a locally-driven cancel does:
             * otherwise re-attaching after a give-up cancel, a reaped orphan,
             * or a cancel issued elsewhere shows a failed run offering Retry.
             */
            ...(event.code === PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE
              ? {
                  status: "cancelled" as const,
                  error: null,
                  errorCategory: null,
                  errorDiagnostics: null,
                }
              : { status: "error" as const, error: event.message }),
          }));
          break;
      }
    },
    [patchOptimization],
  );

  /**
   * Consume a detached run's event stream, applying each event to the record
   * and re-attaching when the connection drops. Every reconnect resumes from
   * the last applied `seq`, and replayed events at or below that cursor are
   * skipped so trials are never double-counted.
   *
   * Which failures reconnect, and for how long, is
   * {@link decideAttachFailure}'s decision; this loop only carries it out.
   */
  const runAttachLoop = useCallback(
    async ({
      optimizationId,
      runId,
      attach,
      cancel,
      abortController,
      dropRecordOnNotFound = false,
    }: {
      optimizationId: string;
      runId: string;
      attach: PetrinautOptimization["attachOptimizationRun"];
      cancel: PetrinautOptimization["cancelOptimizationRun"];
      abortController: AbortController;
      /**
       * Silently drop the record when the very first attachment 404s — used
       * when re-attaching to a stored run that may have expired server-side.
       */
      dropRecordOnNotFound?: boolean;
    }): Promise<void> => {
      const { signal } = abortController;
      // Read through a call so the abort flag is re-checked after each await
      // (a plain property read would be control-flow-narrowed to `false`).
      const isCancelled = () => signal.aborted;
      let lastSeq = 0;
      let sawTerminalEvent = false;
      let consecutiveFailures = 0;
      let receivedAnyEvent = false;

      while (!isCancelled()) {
        try {
          for await (const event of attach(runId, {
            cursor: lastSeq,
            signal,
            /**
             * Restore the honest connection state as soon as the attachment
             * is accepted — a quiet run may not produce an event for a long
             * time, and "(reconnecting…)" would otherwise stick until one
             * arrives. Deliberate trade-off: only received EVENTS reset the
             * failure counter, so NodeAPI attachment windows that keep
             * dying without yielding progress still exhaust the reconnect
             * cap even though each of them attached successfully.
             */
            onAttached: () => {
              patchOptimization(optimizationId, (current) => ({
                ...current,
                connectionState: "streaming",
              }));
            },
          })) {
            if (isCancelled()) {
              break;
            }
            if (typeof event.seq === "number") {
              if (event.seq <= lastSeq) {
                // A replayed event the record already contains.
                continue;
              }
              lastSeq = event.seq;
            }
            if (event.type === "error" && event.retryable) {
              // NodeAPI closed its attachment window (overall/idle timeout)
              // while the run may still be live. Deliberately checked before
              // the failure-counter reset: a window that keeps dying without
              // yielding progress must still exhaust the cap.
              throw new RetryableRunInterruption(event);
            }
            consecutiveFailures = 0;
            receivedAnyEvent = true;
            if (event.type === "complete" || event.type === "error") {
              sawTerminalEvent = true;
            }
            applyOptimizationEvent(optimizationId, event, {
              extra: { lastSeq, connectionState: "streaming" },
            });
          }
          if (isCancelled() && !sawTerminalEvent) {
            markOptimizationCancelled(optimizationId);
            return;
          }
          // A normal end implies a terminal event was decoded (the stream
          // parser rejects endings without one), so the record is settled.
          removeStoredActiveRun(runId);
          return;
        } catch (error) {
          const classified = classifyError(error);
          const retryableInterruption =
            error instanceof RetryableRunInterruption ? error : null;
          // Counted before deciding: every decision other than `reconnect`
          // leaves the loop, and only `reconnect` reads the tally.
          consecutiveFailures += 1;
          const decision = decideAttachFailure({
            error,
            classified,
            isRetryableInterruption: retryableInterruption !== null,
            aborted: isCancelled(),
            sawTerminalEvent,
            receivedAnyEvent,
            dropRecordOnNotFound,
            consecutiveFailures,
          });

          switch (decision.kind) {
            case "cancelled":
              markOptimizationCancelled(optimizationId);
              return;
            case "settled":
              // A trailing transport hiccup after the terminal event changes
              // nothing about the run's outcome.
              removeStoredActiveRun(runId);
              return;
            case "expired":
              removeStoredActiveRun(runId);
              dropOptimizationRecord(optimizationId);
              return;
            case "reconnect":
              patchOptimization(optimizationId, (current) => ({
                ...current,
                connectionState: "reconnecting",
              }));
              await abortableDelay(decision.delayMs, signal);
              if (isCancelled()) {
                markOptimizationCancelled(optimizationId);
                return;
              }
              continue;
            case "giveUp":
              // The run may still be live server-side; cancelling it frees the
              // account's single-flight so a fresh run (e.g. the drawer's
              // Retry) isn't rejected as busy. The stored entry is
              // deliberately kept — some hosts' cancel resolves before the
              // server acted, so resolution proves nothing. The next reload's
              // re-attach settles it: a delivered cancel replays the cancelled
              // terminal, a reaped run 404s (silently dropped), and a run the
              // cancel never reached is recovered live.
              void cancel(runId).catch(() => undefined);
              if (retryableInterruption) {
                // Reconnection is exhausted: NodeAPI's own terminal error
                // event (a safe, server-authored message) is the outcome.
                applyOptimizationEvent(
                  optimizationId,
                  retryableInterruption.event,
                  { extra: { lastSeq, connectionState: null } },
                );
              } else {
                markOptimizationFailed(optimizationId, error, classified);
              }
              return;
          }
        }
      }
      // Aborted between attachments (e.g. while waiting to reconnect). The
      // stored entry is kept: only an explicit cancel forgets a live run.
      markOptimizationCancelled(optimizationId);
    },
    [
      applyOptimizationEvent,
      dropOptimizationRecord,
      markOptimizationCancelled,
      markOptimizationFailed,
      patchOptimization,
    ],
  );

  const createOptimization: OptimizationsContextValue["createOptimization"] =
    async (rawInput) => {
      if (!capability) {
        throw new Error("Optimization is unavailable");
      }

      const input = petrinautOptimizationInputSchema.parse(rawInput);
      const optimizationId = crypto.randomUUID();
      const abortController = new AbortController();

      abortControllersRef.current.set(optimizationId, abortController);
      setOptimizations((current) => [
        createOptimizationRecord(optimizationId, input),
        ...current,
      ]);
      setSelectedOptimizationId(optimizationId);

      const consumeRun = async () => {
        let runId: string;
        try {
          ({ runId } = await capability.createOptimizationRun(input, {
            signal: abortController.signal,
          }));
        } catch (error) {
          const classified = classifyError(error);
          if (
            isAbortFailure(error, classified, abortController.signal.aborted)
          ) {
            markOptimizationCancelled(optimizationId);
          } else {
            markOptimizationFailed(optimizationId, error, classified);
          }
          return;
        }

        if (abortController.signal.aborted) {
          // Cancelled while the run was being created: stop it server-side
          // too, since the cancel action couldn't know its id yet.
          void capability.cancelOptimizationRun(runId).catch(() => undefined);
          markOptimizationCancelled(optimizationId);
          return;
        }

        runIdsRef.current.set(optimizationId, runId);
        storeActiveRun(runId, input);
        patchOptimization(optimizationId, (current) => ({
          ...current,
          runId,
          // Creation only resolves once the study is running server-side,
          // and attachments emit no `started` event — without this a quiet
          // run would show "initializing" until its first trial.
          status: "running",
          connectionState: "streaming",
        }));

        await runAttachLoop({
          optimizationId,
          runId,
          attach: capability.attachOptimizationRun.bind(capability),
          cancel: capability.cancelOptimizationRun.bind(capability),
          abortController,
        });
      };

      void consumeRun().finally(() => {
        abortControllersRef.current.delete(optimizationId);
        runIdsRef.current.delete(optimizationId);
      });

      return optimizationId;
    };

  /**
   * Re-attach to the detached runs a previous document in this tab recorded
   * (sessionStorage survives reloads but not new tabs). Each restored run is
   * rebuilt from a full replay (cursor 0).
   *
   * The cleanup aborts the loops and drops the records this invocation
   * created, so a re-run (React StrictMode double-invokes effects; a swapped
   * capability) rebuilds them cleanly instead of duplicating records.
   * Aborting keeps the sessionStorage entries, so the re-run finds them
   * again.
   */
  useEffect(() => {
    if (!capability) {
      return;
    }

    // Snapshot the (provider-lifetime) maps so the cleanup below operates on
    // the same instances it registered into.
    const abortControllers = abortControllersRef.current;
    const runIds = runIdsRef.current;

    const startedIds: string[] = [];
    for (const [runId, storedRun] of Object.entries(readStoredActiveRuns())) {
      const parsedInput = petrinautOptimizationInputSchema.safeParse(
        storedRun.input,
      );
      if (!parsedInput.success) {
        removeStoredActiveRun(runId);
        continue;
      }

      const optimizationId = crypto.randomUUID();
      startedIds.push(optimizationId);
      const abortController = new AbortController();
      abortControllers.set(optimizationId, abortController);
      runIds.set(optimizationId, runId);
      setOptimizations((current) => [
        createOptimizationRecord(optimizationId, parsedInput.data, {
          createdAt: storedRun.createdAt,
          status: "running",
          runId,
          connectionState: "streaming",
        }),
        ...current,
      ]);

      void runAttachLoop({
        optimizationId,
        runId,
        attach: capability.attachOptimizationRun.bind(capability),
        cancel: capability.cancelOptimizationRun.bind(capability),
        abortController,
        dropRecordOnNotFound: true,
      }).finally(() => {
        abortControllers.delete(optimizationId);
        runIds.delete(optimizationId);
      });
    }

    return () => {
      for (const optimizationId of startedIds) {
        abortControllers.get(optimizationId)?.abort();
        abortControllers.delete(optimizationId);
        runIds.delete(optimizationId);
      }
      setOptimizations((current) =>
        current.filter((optimization) => !startedIds.includes(optimization.id)),
      );
    };
  }, [capability, runAttachLoop]);

  /**
   * The run id of a detached record: from the live-loop map while its attach
   * loop runs, falling back to the record itself once the loop has ended
   * (e.g. after a surfaced terminal error, when the run may still be live
   * server-side and an explicit cancel/remove must still DELETE it).
   */
  const resolveRunId = (optimizationId: string): string | undefined =>
    runIdsRef.current.get(optimizationId) ??
    optimizations.find((optimization) => optimization.id === optimizationId)
      ?.runId ??
    undefined;

  const cancelOptimization: OptimizationsContextValue["cancelOptimization"] = (
    optimizationId,
  ) => {
    const runId = resolveRunId(optimizationId);
    if (runId !== undefined) {
      runIdsRef.current.delete(optimizationId);
      removeStoredActiveRun(runId);
      // Stop the detached run server-side; aborting the local attachment
      // below only drops this tab's connection to it.
      void capability?.cancelOptimizationRun(runId).catch(() => undefined);
    }
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    markOptimizationCancelled(optimizationId);
  };

  const removeOptimization: OptimizationsContextValue["removeOptimization"] = (
    optimizationId,
  ) => {
    const runId = resolveRunId(optimizationId);
    if (runId !== undefined) {
      runIdsRef.current.delete(optimizationId);
      removeStoredActiveRun(runId);
      void capability?.cancelOptimizationRun(runId).catch(() => undefined);
    }
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    dropOptimizationRecord(optimizationId);
  };

  const retryOptimization: OptimizationsContextValue["retryOptimization"] =
    async (optimizationId) => {
      const existing = optimizations.find(
        (optimization) => optimization.id === optimizationId,
      );
      if (!existing) {
        return null;
      }
      return createOptimization(existing.input);
    };

  const selectedOptimization =
    optimizations.find(
      (optimization) => optimization.id === selectedOptimizationId,
    ) ?? null;

  const value: OptimizationsContextValue = {
    optimizations,
    selectedOptimizationId,
    selectedOptimization,
    setSelectedOptimizationId,
    createOptimization,
    cancelOptimization,
    removeOptimization,
    retryOptimization,
  };

  return <OptimizationsContext value={value}>{children}</OptimizationsContext>;
};
