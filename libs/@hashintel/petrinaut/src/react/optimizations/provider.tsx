/**
 * @layerRoot react.optimizations
 * @role Tracks the studies driving parameter sweeps: connects the host's in-browser optimizer, folds each study's event stream into a record, and routes its trials to the sweep that evaluates them
 */
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  petrinautOptimizationInputSchema,
  type PetrinautOptimization,
  type PetrinautOptimizationDirection,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";
import {
  isConnectedOptimization,
  type PetrinautConnectedOptimization,
  type PetrinautConnectedOptimizationCapability,
} from "@hashintel/petrinaut-core/optimization";

import { ExperimentsActionsContext } from "../experiments/context";
import { errorMessage } from "../experiments/shared/error-message";
import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import {
  foldBestTrial,
  type OptimizationBest,
  isOptimizationActive,
  type OptimizationOrigin,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import {
  createSweepTrialEvaluator,
  type SweepTrialEvaluator,
} from "./provider/create-sweep-trial-evaluator";
import { useOptimizationSource } from "./use-optimization-source";

import type { PropsWithChildren } from "react";

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

const createOptimizationRecord = (
  id: string,
  input: PetrinautOptimizationInput,
  origin: OptimizationOrigin,
): OptimizationRecord => ({
  id,
  input,
  createdAt: Date.now(),
  origin,
  status: "initializing",
  error: null,
  runId: null,
  lastSeq: 0,
  requestedTrials: input.study.trials,
  completedTrials: 0,
  prunedTrials: 0,
  failedTrials: 0,
  trials: [],
  best: null,
  importance: null,
});

/**
 * A connected source's capability, wired to the sweeps that evaluate its
 * trials. Dies with the connection.
 */
type OptimizationConnection = {
  source: PetrinautConnectedOptimization;
  capability: PetrinautConnectedOptimizationCapability;
  dispose: () => void;
};

const connectOptimizationSource = (
  source: PetrinautConnectedOptimization,
  resolveSweepEvaluator: (runId: string) => SweepTrialEvaluator | null,
): OptimizationConnection => {
  const capability = source.connect({
    evaluateTrial: (request) =>
      resolveSweepEvaluator(request.runId)?.evaluateTrial(request) ??
      Promise.reject(
        new Error(
          `No parameter sweep evaluates optimizer run ${request.runId}`,
        ),
      ),
  });
  return { source, capability, dispose: () => capability.dispose() };
};

export const OptimizationsProvider = ({ children }: PropsWithChildren) => {
  const source = useOptimizationSource();
  const experimentsActionsRef = useLatest(use(ExperimentsActionsContext));
  const connectionRef = useRef<OptimizationConnection | null>(null);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  /** The optimizer's run ids of the studies whose attachment runs, keyed by record id. */
  const runIdsRef = useRef(new Map<string, string>());
  /** The sweep behind each study, keyed by record id. */
  const sweepEvaluatorsRef = useRef(new Map<string, SweepTrialEvaluator>());
  const [optimizations, setOptimizations] = useState<OptimizationRecord[]>([]);

  useBlockWindowClose({
    shouldBlock: optimizations.some(isOptimizationActive),
  });

  /**
   * Everything the provider holds outside React ends with the source, and
   * with the provider: the connection to the source, the attachments
   * (aborting settles each record as cancelled) and the sweeps the studies
   * drove. Each sweep evaluator parks its sweep here: the cancel the aborted
   * loop settles lands after the map is cleared, so it would find no
   * evaluator to park.
   */
  useEffect(
    () => () => {
      connectionRef.current?.dispose();
      connectionRef.current = null;
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
      abortControllersRef.current.clear();
      runIdsRef.current.clear();
      for (const evaluator of sweepEvaluatorsRef.current.values()) {
        evaluator.settle(null);
      }
      sweepEvaluatorsRef.current.clear();
    },
    [source],
  );

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
  }, []);

  /** The study is over: the sweep parks on the best point, or on the last one tried. */
  const settleStudy = useCallback(
    (optimizationId: string, best?: OptimizationBest | null) => {
      sweepEvaluatorsRef.current.get(optimizationId)?.settle(best);
    },
    [],
  );

  const markOptimizationCancelled = useCallback(
    (optimizationId: string) => {
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "cancelled",
        error: null,
      }));
      settleStudy(optimizationId);
    },
    [patchOptimization, settleStudy],
  );

  const markOptimizationFailed = useCallback(
    (
      optimizationId: string,
      error: unknown,
      /** The best step the study tried before failing: the sweep parks there, not on the step that failed. */
      best: OptimizationBest | null,
    ) => {
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "error",
        error: errorMessage(error),
      }));
      settleStudy(optimizationId, best);
    },
    [patchOptimization, settleStudy],
  );

  /**
   * Fold one optimizer event into the record, causing a single state update
   * per event. `best` is the best step the attachment has folded so far, by
   * the record's own fold: a terminal event settles the sweep with it, since
   * the record in state may still be a render behind the trial before it.
   */
  const applyOptimizationEvent = useCallback(
    (
      optimizationId: string,
      event: PetrinautOptimizationEvent,
      lastSeq: number,
      best: OptimizationBest | null,
    ) => {
      switch (event.type) {
        case "started":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            lastSeq,
            status: "running",
            requestedTrials: event.requestedTrials,
          }));
          break;
        case "trial":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            lastSeq,
            // A trial that settled as the study was stopped still reports;
            // it does not revive the study.
            status: current.status === "cancelled" ? "cancelled" : "running",
            completedTrials:
              current.completedTrials + (event.state === "complete" ? 1 : 0),
            prunedTrials:
              current.prunedTrials + (event.state === "pruned" ? 1 : 0),
            failedTrials:
              current.failedTrials + (event.state === "failed" ? 1 : 0),
            trials: [...current.trials, event],
            best: foldBestTrial(
              current.input.objective.direction,
              current.best,
              event,
            ),
            importance: event.importances ?? current.importance,
          }));
          break;
        case "complete":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            lastSeq,
            status: "complete",
            // The complete event's requested-trial count is the true total,
            // but its completed/pruned/failed counts only cover the frames
            // this attachment observed, so the record's own accumulated
            // counters and running best stay authoritative.
            requestedTrials: event.requestedTrials,
            best: event.best ?? current.best,
            importance: event.importances ?? current.importance,
          }));
          settleStudy(optimizationId, event.best);
          break;
        case "error": {
          // A cancellation reaches us as an error event — the stream has no
          // type of its own for it. It is an outcome, not a failure, so it
          // settles exactly as a locally-driven stop does: the sweep stays on
          // the point it was trying. A failure parks it on the best step.
          const cancelled =
            event.code === PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE;
          patchOptimization(optimizationId, (current) => ({
            ...current,
            lastSeq,
            ...(cancelled
              ? { status: "cancelled" as const, error: null }
              : { status: "error" as const, error: event.message }),
          }));
          settleStudy(optimizationId, cancelled ? null : best);
          break;
        }
      }
    },
    [patchOptimization, settleStudy],
  );

  /**
   * Consume a run's event stream until its terminal event. Replayed events
   * at or below the last applied `seq` are skipped so trials are never
   * double-counted. Aborting the attachment before the terminal event
   * settles the record as cancelled; a thrown error fails it, and the sweep
   * parks on the best step tried so far.
   */
  const runAttachLoop = useCallback(
    async ({
      optimizationId,
      runId,
      direction,
      capability,
      abortController,
    }: {
      optimizationId: string;
      runId: string;
      /** The objective's direction, which decides the best step among the trials. */
      direction: PetrinautOptimizationDirection;
      capability: PetrinautOptimization;
      abortController: AbortController;
    }): Promise<void> => {
      const { signal } = abortController;
      // Read through a call so the abort flag is re-checked after each await
      // (a plain property read would be control-flow-narrowed to `false`).
      const isCancelled = () => signal.aborted;
      let lastSeq = 0;
      let best: OptimizationBest | null = null;
      let sawTerminalEvent = false;
      try {
        for await (const event of capability.attachOptimizationRun(runId, {
          cursor: lastSeq,
          signal,
        })) {
          if (isCancelled()) {
            break;
          }
          if (typeof event.seq === "number") {
            if (event.seq <= lastSeq) {
              continue;
            }
            lastSeq = event.seq;
          }
          if (event.type === "trial") {
            best = foldBestTrial(direction, best, event);
          }
          if (event.type === "complete" || event.type === "error") {
            sawTerminalEvent = true;
          }
          applyOptimizationEvent(optimizationId, event, lastSeq, best);
        }
        if (isCancelled() && !sawTerminalEvent) {
          markOptimizationCancelled(optimizationId);
        }
      } catch (error) {
        if (isCancelled() || isAbortError(error)) {
          markOptimizationCancelled(optimizationId);
          return;
        }
        if (sawTerminalEvent) {
          // The run already settled; a trailing hiccup changes nothing.
          return;
        }
        markOptimizationFailed(optimizationId, error, best);
      }
    },
    [applyOptimizationEvent, markOptimizationCancelled, markOptimizationFailed],
  );

  /** The sweep evaluator behind an optimizer run id, or null when no study owns the run. */
  const resolveSweepEvaluator = (runId: string): SweepTrialEvaluator | null => {
    const entry = [...runIdsRef.current].find(
      ([, knownRunId]) => knownRunId === runId,
    );
    return entry ? (sweepEvaluatorsRef.current.get(entry[0]) ?? null) : null;
  };

  /**
   * The connection behind a connected source, made on first use and kept
   * while the source stays the same. Connecting happens on demand rather
   * than in render so a source never connects twice; the cleanup effect
   * tears the connection down, with the studies made through it, when the
   * source changes or the provider unmounts. Null for a remote source,
   * whose runs no sweep can evaluate.
   */
  const resolveConnection = (): OptimizationConnection | null => {
    if (source === null || !isConnectedOptimization(source)) {
      return null;
    }
    const current = connectionRef.current;
    if (current?.source === source) {
      return current;
    }
    current?.dispose();
    const connection = connectOptimizationSource(source, resolveSweepEvaluator);
    connectionRef.current = connection;
    return connection;
  };

  const createOptimization: OptimizationsContextValue["createOptimization"] =
    async (rawInput, { sweep }) => {
      if (source === null) {
        throw new Error("Optimization is unavailable");
      }
      const connection = resolveConnection();
      if (connection === null) {
        throw new Error("A sweep can only be optimized in the browser");
      }
      const { capability } = connection;
      const input = petrinautOptimizationInputSchema.parse(rawInput);
      const optimizationId = crypto.randomUUID();
      const abortController = new AbortController();
      sweepEvaluatorsRef.current.set(
        optimizationId,
        createSweepTrialEvaluator({
          experimentId: sweep.experimentId,
          axes: sweep.axes,
          metricId: sweep.metricId,
          navigateSweep: (experimentId, selection, navigateOptions) =>
            experimentsActionsRef.current.navigateSweep(
              experimentId,
              selection,
              navigateOptions,
            ),
        }),
      );
      abortControllersRef.current.set(optimizationId, abortController);
      setOptimizations((current) => [
        createOptimizationRecord(optimizationId, input, {
          kind: "sweep",
          experimentId: sweep.experimentId,
        }),
        ...current,
      ]);

      const consumeRun = async () => {
        let runId: string;
        try {
          // A sweep computes one point at a time.
          ({ runId } = await capability.createOptimizationRun(input, {
            signal: abortController.signal,
            parallelism: 1,
          }));
        } catch (error) {
          if (abortController.signal.aborted || isAbortError(error)) {
            markOptimizationCancelled(optimizationId);
          } else {
            markOptimizationFailed(optimizationId, error, null);
          }
          return;
        }

        if (abortController.signal.aborted) {
          // Stopped while the run was being created: stop it in the worker
          // too, since the stop could not know its id yet.
          void capability.cancelOptimizationRun(runId).catch(() => undefined);
          markOptimizationCancelled(optimizationId);
          return;
        }

        runIdsRef.current.set(optimizationId, runId);
        patchOptimization(optimizationId, (current) => ({
          ...current,
          runId,
          // Creation only resolves once the study is running, and
          // attachments emit no `started` event — without this a quiet run
          // would show "initializing" until its first trial.
          status: "running",
        }));

        await runAttachLoop({
          optimizationId,
          runId,
          direction: input.objective.direction,
          capability,
          abortController,
        });
      };

      void consumeRun().finally(() => {
        if (
          abortControllersRef.current.get(optimizationId) === abortController
        ) {
          abortControllersRef.current.delete(optimizationId);
          runIdsRef.current.delete(optimizationId);
        }
      });

      return optimizationId;
    };

  /**
   * The run id of a study: from the live map while its attachment runs,
   * falling back to the record once the attachment has ended (a stopped
   * study's run stays with the worker until released).
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
    if (runId === undefined) {
      // Stop before the run has an id: creation is still in flight and
      // cancels the run it obtains once it finds this signal aborted.
      abortControllersRef.current.get(optimizationId)?.abort();
    } else {
      void connectionRef.current?.capability
        .cancelOptimizationRun(runId)
        .catch(() => undefined);
    }
    // The segment ends with a terminal event once the worker has resolved
    // the step in flight, which is told failed without an event. The
    // attachment stays to apply that terminal event; the status settles
    // here without waiting, and the sweep parks on the point it was trying.
    markOptimizationCancelled(optimizationId);
  };

  const removeOptimization: OptimizationsContextValue["removeOptimization"] = (
    optimizationId,
  ) => {
    const runId = resolveRunId(optimizationId);
    if (runId !== undefined) {
      runIdsRef.current.delete(optimizationId);
      // The worker keeps a study's sampler until it is released.
      void connectionRef.current?.capability
        .releaseOptimizationRun(runId)
        .catch(() => undefined);
    }
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    sweepEvaluatorsRef.current.delete(optimizationId);
    dropOptimizationRecord(optimizationId);
  };

  const value: OptimizationsContextValue = {
    optimizations,
    createOptimization,
    cancelOptimization,
    removeOptimization,
  };

  return <OptimizationsContext value={value}>{children}</OptimizationsContext>;
};
