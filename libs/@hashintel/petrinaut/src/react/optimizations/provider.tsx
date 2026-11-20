/**
 * @layerRoot react.optimizations
 * @role Tracks the studies driving parameter sweeps: connects the host's in-browser optimizer, folds each study's event stream into a record, and routes its trials to the sweep that evaluates them
 */
import { use, useEffect, useRef, useState } from "react";

import {
  petrinautOptimizationInputSchema,
  type PetrinautOptimizationEvent,
} from "@hashintel/petrinaut-core";

import { ExperimentsActionsContext } from "../experiments/context";
import { errorMessage } from "../experiments/shared/error-message";
import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { PetrinautOptimizationContext } from "../optimization-context";
import {
  type OptimizationBest,
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import {
  consumeOptimizationRun,
  isAbortError,
} from "./provider/consume-optimization-run";
import {
  createSweepTrialEvaluator,
  type SweepTrialEvaluator,
} from "./provider/create-sweep-trial-evaluator";
import {
  createOptimizationRecord,
  foldOptimizationEvent,
  isCancellationEvent,
} from "./provider/optimization-records";

import type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
} from "@hashintel/petrinaut-core/optimization";
import type { PropsWithChildren } from "react";

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
  const source = use(PetrinautOptimizationContext);
  const optimizationUnavailableReason =
    source === null ? "Optimization is unavailable" : null;
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

  const patchOptimization = (
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
  };

  const dropOptimizationRecord = (optimizationId: string) => {
    setOptimizations((current) =>
      current.filter((optimization) => optimization.id !== optimizationId),
    );
  };

  /** The study is over: the sweep parks on the best point, or on the last one tried. */
  const settleStudy = (
    optimizationId: string,
    best?: OptimizationBest | null,
  ) => {
    sweepEvaluatorsRef.current.get(optimizationId)?.settle(best);
  };

  const markOptimizationCancelled = (optimizationId: string) => {
    patchOptimization(optimizationId, (current) => ({
      ...current,
      status: "cancelled",
      error: null,
    }));
    settleStudy(optimizationId);
  };

  const markOptimizationFailed = (
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
  };

  /**
   * Folds one optimizer event into the record, in a single state update, and
   * settles the sweep on a terminal event. `best` is the best step the
   * attachment has folded so far, by the record's own fold: the record in
   * state may still be a render behind the trial before it.
   */
  const applyOptimizationEvent = (
    optimizationId: string,
    event: PetrinautOptimizationEvent,
    lastSeq: number,
    best: OptimizationBest | null,
  ) => {
    patchOptimization(optimizationId, (current) =>
      foldOptimizationEvent(current, event, lastSeq),
    );
    if (event.type === "complete") {
      settleStudy(optimizationId, event.best);
    } else if (event.type === "error") {
      // A cancellation settles exactly as a locally-driven stop does: the
      // sweep stays on the point it was trying. A failure parks it on the
      // best step.
      settleStudy(optimizationId, isCancellationEvent(event) ? null : best);
    }
  };

  /** The sweep evaluator behind an optimizer run id, or null when no study owns the run. */
  const resolveSweepEvaluator = (runId: string): SweepTrialEvaluator | null => {
    const entry = [...runIdsRef.current].find(
      ([, knownRunId]) => knownRunId === runId,
    );
    return entry ? (sweepEvaluatorsRef.current.get(entry[0]) ?? null) : null;
  };

  /**
   * The connection behind the source, made on first use and kept while the
   * source stays the same. Connecting happens on demand rather than in render
   * so a source never connects twice; the cleanup effect tears the
   * connection down, with the studies made through it, when the source
   * changes or the provider unmounts. Null without a source.
   */
  const resolveConnection = (): OptimizationConnection | null => {
    if (source === null) {
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
      const connection = resolveConnection();
      if (connection === null) {
        throw new Error("Optimization is unavailable");
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
          refineOnSettle: sweep.refineOnSettle,
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

        await consumeOptimizationRun({
          capability,
          runId,
          direction: input.objective.direction,
          signal: abortController.signal,
          onEvent: (event, lastSeq, best) =>
            applyOptimizationEvent(optimizationId, event, lastSeq, best),
          onCancelled: () => markOptimizationCancelled(optimizationId),
          onFailed: (error, best) =>
            markOptimizationFailed(optimizationId, error, best),
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
    optimizationUnavailableReason,
    createOptimization,
    cancelOptimization,
    removeOptimization,
  };

  return <OptimizationsContext value={value}>{children}</OptimizationsContext>;
};
