/**
 * @layerRoot react.optimizations
 * @role Tracks optimization runs, folds their event streams into records, and drives a connected study's navigation and live selection
 */
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  petrinautOptimizationInputSchema,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";
import {
  isConnectedOptimization,
  type PetrinautConnectedOptimization,
  type PetrinautConnectedOptimizationCapability,
} from "@hashintel/petrinaut-core/optimization";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
} from "../experiments/context";
import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import {
  openPetrinautSimulationResource,
  usePetrinautNavigation,
} from "../navigation";
import {
  createOptimizationChannel,
  type OptimizationChannelStudy,
} from "./channel/create-optimization-channel";
import {
  type OptimizationBest,
  type OptimizationErrorCategory,
  type OptimizationErrorDiagnostics,
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import {
  type ConnectedStudy,
  type ConnectedStudyOutcome,
  createConnectedStudy,
} from "./provider/connected-study";
import { buildOptimizationSurfaceAxes } from "./surface-grid";
import { useOptimizationSource } from "./use-optimization-source";

import type { PropsWithChildren } from "react";

const ERROR_CATEGORIES = new Set<OptimizationErrorCategory>([
  "network",
  "http",
  "protocol",
  "aborted",
]);

/** First reconnect delay after a dropped detached-run event stream. */
const RECONNECT_BASE_DELAY_MS = 1_000;
/** Ceiling for the exponential reconnect backoff. */
const RECONNECT_MAX_DELAY_MS = 30_000;
/**
 * Consecutive failed attachments (no event received in between) after which
 * reconnecting stops and the classified failure is surfaced instead.
 */
const MAX_CONSECUTIVE_RECONNECT_FAILURES = 8;

/**
 * Gateway statuses a re-attach may transiently hit while the service
 * restarts or deploys; they reconnect within the same failure cap. Every
 * other http status (404 unknown run, other 4xx) is definitive.
 */
const RECONNECTABLE_HTTP_STATUSES = new Set([502, 503, 504]);

/** Exponential backoff: 1s, 2s, 4s, ... capped at 30s. */
const reconnectDelayMs = (consecutiveFailures: number): number =>
  Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (consecutiveFailures - 1),
    RECONNECT_MAX_DELAY_MS,
  );

/** Resolve after `ms`, or immediately once `signal` aborts. */
const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    // The listener stays attached when the delay elapses normally: at most a
    // handful accumulate per run, and they die with the run's controller.
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * sessionStorage key recording the detached runs this tab may re-attach to
 * after a reload: a JSON object mapping run id to its manifest and creation
 * time. Session-scoped on purpose — a run belongs to the tab that started it.
 *
 * When storage is unavailable (e.g. Petrinaut runs in a sandboxed iframe with
 * an opaque origin) every helper degrades to a no-op: reload re-attachment is
 * lost, while in-page reconnection keeps working.
 */
const ACTIVE_RUNS_STORAGE_KEY = "petrinaut:active-optimization-runs";

type StoredActiveRun = { input: unknown; createdAt: number };

const readStoredActiveRuns = (): Record<string, StoredActiveRun> => {
  try {
    const raw = sessionStorage.getItem(ACTIVE_RUNS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const runs: Record<string, StoredActiveRun> = {};
    for (const [runId, value] of Object.entries(parsed)) {
      if (typeof value === "object" && value !== null && "input" in value) {
        const createdAt = (value as { createdAt?: unknown }).createdAt;
        runs[runId] = {
          input: (value as { input: unknown }).input,
          createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
        };
      }
    }
    return runs;
  } catch {
    // Unavailable or corrupted storage; see ACTIVE_RUNS_STORAGE_KEY.
    return {};
  }
};

const writeStoredActiveRuns = (runs: Record<string, StoredActiveRun>): void => {
  try {
    sessionStorage.setItem(ACTIVE_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Unavailable storage or exceeded quota; see ACTIVE_RUNS_STORAGE_KEY.
  }
};

const storeActiveRun = (
  runId: string,
  input: PetrinautOptimizationInput,
): void => {
  const runs = readStoredActiveRuns();
  runs[runId] = { input, createdAt: Date.now() };
  writeStoredActiveRuns(runs);
};

const removeStoredActiveRun = (runId: string): void => {
  const runs = readStoredActiveRuns();
  if (runId in runs) {
    delete runs[runId];
    writeStoredActiveRuns(runs);
  }
};

type ClassifiedError = {
  category: OptimizationErrorCategory;
  /** Seconds from a `Retry-After` header, when the service sent one (429). */
  retryAfter: number | null;
  diagnostics: OptimizationErrorDiagnostics;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Read the structured fields off a classified transport error without
 * depending on the host bridge's class: the error crosses from the app into
 * this library, so it is duck-typed rather than matched with `instanceof`.
 */
function classifyError(error: unknown): ClassifiedError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as Record<string, unknown>;
  if (
    typeof candidate.category !== "string" ||
    !ERROR_CATEGORIES.has(candidate.category as OptimizationErrorCategory)
  ) {
    return null;
  }
  return {
    category: candidate.category as OptimizationErrorCategory,
    retryAfter:
      typeof candidate.retryAfter === "number" ? candidate.retryAfter : null,
    diagnostics: {
      hashRequestId:
        typeof candidate.hashRequestId === "string"
          ? candidate.hashRequestId
          : null,
      optimizationRunId:
        typeof candidate.optimizationRunId === "string"
          ? candidate.optimizationRunId
          : null,
      httpStatus:
        typeof candidate.httpStatus === "number" ? candidate.httpStatus : null,
    },
  };
}

/** Build a safe, actionable message from a classified failure. */
function buildErrorMessage(
  classified: ClassifiedError,
  progress: { completedTrials: number; requestedTrials: number },
): string {
  const after = `after ${progress.completedTrials} of ${progress.requestedTrials} trials`;
  const { httpStatus, optimizationRunId, hashRequestId } =
    classified.diagnostics;
  const diagnosticId = optimizationRunId ?? hashRequestId;
  const diagnostic = diagnosticId ? ` (diagnostic id: ${diagnosticId})` : "";

  switch (classified.category) {
    case "http":
      if (httpStatus === 429) {
        return `The optimization service is busy — another optimization may already be running for your account.${
          classified.retryAfter === null
            ? ""
            : ` Try again in ~${classified.retryAfter}s.`
        }${diagnostic}`;
      }
      return `The optimization service rejected the request${
        httpStatus === null ? "" : ` (status ${httpStatus})`
      } ${after}. Retry the optimization.${diagnostic}`;
    case "protocol":
      return `The optimization stream ended unexpectedly ${after}. Retry the optimization.${diagnostic}`;
    case "aborted":
      return "The optimization was cancelled.";
    case "network":
    default:
      return `Connection to the optimization service was interrupted ${after}. Retry the optimization.${diagnostic}`;
  }
}

/**
 * Fold a completed trial into the running best. Attachments deliver
 * `best: null` (the service no longer knows the objective direction after
 * the creating request ends), so the provider maintains the best itself from
 * every trial it applies; `event.best` is still preferred when present.
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
  resumable: false,
  parallelism: 1,
  computeBackend: "cpu",
  computeBackendFallbackReason: null,
  axes: buildOptimizationSurfaceAxes(input),
  navigation: null,
  selection: null,
  activity: [],
  inFlight: [],
  ...overrides,
});

/**
 * A connected source's capability together with the channel it evaluates
 * trials through. Both die with the connection.
 */
type OptimizationConnection = {
  source: PetrinautConnectedOptimization;
  capability: PetrinautConnectedOptimizationCapability;
  dispose: () => void;
};

const connectOptimizationSource = (
  source: PetrinautConnectedOptimization,
  experimentsActions: React.RefObject<ExperimentsActionsValue>,
  resolveStudy: (runId: string) => OptimizationChannelStudy | null,
): OptimizationConnection => {
  const channel = createOptimizationChannel({
    runDetachedObjective: (request) =>
      experimentsActions.current.runDetachedObjective(request),
    resolveStudy,
  });
  const capability = source.connect(channel);
  return {
    source,
    capability,
    dispose: () => {
      capability.dispose();
      channel.dispose();
    },
  };
};

export const OptimizationsProvider = ({ children }: PropsWithChildren) => {
  const source = useOptimizationSource();
  const experimentsActionsRef = useLatest(use(ExperimentsActionsContext));
  const connectionRef = useRef<OptimizationConnection | null>(null);
  const navigation = usePetrinautNavigation();
  const abortControllersRef = useRef(new Map<string, AbortController>());
  /** Server run ids of active detached runs, keyed by record id. */
  const runIdsRef = useRef(new Map<string, string>());
  /** The local machinery behind each connected study, keyed by record id. */
  const studiesRef = useRef(new Map<string, ConnectedStudy>());
  const [optimizations, setOptimizations] = useState<OptimizationRecord[]>([]);
  const selectedOptimizationId =
    navigation.state.simulateResource?.type === "optimization"
      ? navigation.state.simulateResource.id
      : null;
  const setSelectedOptimizationId: OptimizationsContextValue["setSelectedOptimizationId"] =
    (optimizationId) => {
      navigation.navigate(
        optimizationId
          ? openPetrinautSimulationResource({
              type: "optimization",
              id: optimizationId,
            })
          : { simulateResource: null },
        { cause: "user", action: "simulation-resource" },
      );
    };

  useBlockWindowClose({
    shouldBlock: optimizations.some(isOptimizationActive),
  });

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    const studies = studiesRef.current;
    return () => {
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
      for (const study of studies.values()) {
        study.dispose();
      }
      studies.clear();
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
  }, []);

  useEffect(() => {
    if (
      selectedOptimizationId &&
      !optimizations.some(({ id }) => id === selectedOptimizationId)
    ) {
      navigation.navigate(
        { simulateResource: null },
        { cause: "normalization", action: "simulation-resource" },
      );
    }
  }, [navigation, optimizations, selectedOptimizationId]);

  const settleStudy = (
    optimizationId: string,
    outcome: ConnectedStudyOutcome,
    best?: OptimizationBest | null,
  ) => {
    studiesRef.current.get(optimizationId)?.settle(outcome, best);
  };

  const disposeStudy = (optimizationId: string) => {
    studiesRef.current.get(optimizationId)?.dispose();
    studiesRef.current.delete(optimizationId);
  };

  /**
   * Whether a settled record can run more steps: a connected study whose
   * local machinery is still here. The machinery goes when the study is
   * removed or its connection is disposed, and with it the kept sampler.
   */
  const resumableAfterSettling = (
    optimizationId: string,
    current: OptimizationRecord,
  ): boolean =>
    current.navigation !== null && studiesRef.current.has(optimizationId);

  const markOptimizationCancelled = useCallback(
    (optimizationId: string) => {
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "cancelled",
        // The segment's terminal event, not this mark, makes a connected
        // study resumable: a stop lands here while its steps in flight are
        // still being pruned, and the core refuses to extend it until then.
        resumable: false,
        error: null,
        errorCategory: null,
        errorDiagnostics: null,
        connectionState: null,
      }));
      settleStudy(optimizationId, "cancelled");
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
        resumable: false,
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
      settleStudy(optimizationId, "error");
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
            resumable: false,
            requestedTrials: event.requestedTrials,
          }));
          break;
        case "trial":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            // A stopped study's pruned steps still report; they do not
            // revive it.
            status: current.status === "cancelled" ? "cancelled" : "running",
            completedTrials:
              current.completedTrials + (event.state === "complete" ? 1 : 0),
            prunedTrials:
              current.prunedTrials + (event.state === "pruned" ? 1 : 0),
            failedTrials:
              current.failedTrials + (event.state === "failed" ? 1 : 0),
            trials: [...current.trials, event],
            best: event.best ?? computeRunningBest(current, event),
          }));
          studiesRef.current.get(optimizationId)?.trialReported(event);
          break;
        case "complete":
          patchOptimization(optimizationId, (current) => ({
            ...current,
            ...extra,
            status: "complete",
            resumable: resumableAfterSettling(optimizationId, current),
            connectionState: null,
            // The complete event's requested-trial count is the true total,
            // but its completed/pruned/failed counts only cover the frames
            // this attachment observed (everything past its cursor), so the
            // record's own accumulated counters and running best stay
            // authoritative.
            requestedTrials: event.requestedTrials,
            best: event.best ?? current.best,
          }));
          settleStudy(optimizationId, "complete", event.best);
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
                  resumable: resumableAfterSettling(optimizationId, current),
                  error: null,
                  errorCategory: null,
                  errorDiagnostics: null,
                }
              : {
                  status: "error" as const,
                  resumable: false,
                  error: event.message,
                }),
          }));
          settleStudy(
            optimizationId,
            event.code === PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE
              ? "cancelled"
              : "error",
          );
          break;
      }
    },
    [patchOptimization],
  );

  /**
   * Consume a detached run's event stream, re-attaching with exponential
   * backoff when the connection drops. Every reconnect resumes from the last
   * applied `seq`, and replayed events at or below that cursor are skipped so
   * trials are never double-counted. Reconnecting stops after
   * {@link MAX_CONSECUTIVE_RECONNECT_FAILURES} attachments in a row that
   * failed before yielding an event; the classified failure is surfaced then.
   *
   * Four kinds of interruption reconnect, all sharing the failure cap:
   * `network` failures, `protocol` failures (a proxy tearing an idle
   * connection down cleanly surfaces as a `protocol` "stream ended without a
   * terminal event"), NodeAPI-authored `retryable: true` error events (its
   * per-attachment window died while the run continues), and gateway
   * `http` statuses (502/503/504 — NodeAPI restarting or deploying).
   * Resuming from the cursor is safe in every case because replayed events
   * are deduplicated. Every other `http` failure (404 unknown run, other
   * 4xx) is definitive and fails immediately, as do `retryable: false`
   * error events.
   *
   * On every give-up path the run — which may still be live server-side —
   * is cancelled fire-and-forget: releasing NodeAPI's per-account ownership
   * slot means a follow-up run (e.g. the drawer's Retry) isn't rejected as
   * busy for the rest of the ownership TTL.
   */
  const runAttachLoop = useCallback(
    async ({
      optimizationId,
      runId,
      attach,
      cancel,
      abortController,
      cursor = 0,
      dropRecordOnNotFound = false,
    }: {
      optimizationId: string;
      runId: string;
      attach: PetrinautOptimization["attachOptimizationRun"];
      cancel: PetrinautOptimization["cancelOptimizationRun"];
      abortController: AbortController;
      /** The record's last applied `seq`, when it already holds earlier events. */
      cursor?: number;
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
      let lastSeq = cursor;
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
          if (
            isCancelled() ||
            isAbortError(error) ||
            classified?.category === "aborted"
          ) {
            markOptimizationCancelled(optimizationId);
            return;
          }
          if (sawTerminalEvent) {
            // The run already settled; a trailing transport hiccup after the
            // terminal event changes nothing.
            removeStoredActiveRun(runId);
            return;
          }
          if (
            dropRecordOnNotFound &&
            !receivedAnyEvent &&
            classified?.category === "http" &&
            classified.diagnostics.httpStatus === 404
          ) {
            removeStoredActiveRun(runId);
            dropOptimizationRecord(optimizationId);
            return;
          }
          consecutiveFailures += 1;
          const reconnectable =
            retryableInterruption !== null ||
            classified?.category === "network" ||
            classified?.category === "protocol" ||
            (classified?.category === "http" &&
              classified.diagnostics.httpStatus !== null &&
              RECONNECTABLE_HTTP_STATUSES.has(
                classified.diagnostics.httpStatus,
              ));
          if (
            reconnectable &&
            consecutiveFailures < MAX_CONSECUTIVE_RECONNECT_FAILURES
          ) {
            patchOptimization(optimizationId, (current) => ({
              ...current,
              connectionState: "reconnecting",
            }));
            await abortableDelay(reconnectDelayMs(consecutiveFailures), signal);
            if (isCancelled()) {
              markOptimizationCancelled(optimizationId);
              return;
            }
            continue;
          }
          // Give up. The run may still be live server-side; cancelling it
          // frees the account's single-flight so a fresh run (e.g. the
          // drawer's Retry) isn't rejected as busy. The stored entry is
          // deliberately kept — some hosts' cancel resolves before the
          // server acted, so resolution proves nothing. The next reload's
          // re-attach settles it: a delivered cancel replays the cancelled
          // terminal, a reaped run 404s (silently dropped), and a run the
          // cancel never reached is recovered live.
          void cancel(runId).catch(() => undefined);
          if (retryableInterruption) {
            // Reconnection is exhausted: NodeAPI's own terminal error event
            // (a safe, server-authored message) becomes the run's outcome.
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

  /**
   * The study behind an optimizer run id, for the channel: its requested
   * backend, and the hooks that follow its trials. The first trial that ran
   * elsewhere than asked records where, and why, on the record.
   */
  const resolveChannelStudy = useCallback(
    (runId: string): OptimizationChannelStudy | null => {
      const entry = [...runIdsRef.current].find(
        ([, knownRunId]) => knownRunId === runId,
      );
      const study = entry ? studiesRef.current.get(entry[0]) : undefined;
      if (!entry || !study) {
        return null;
      }
      const [optimizationId] = entry;
      return {
        computeBackend: study.computeBackend,
        trialStarted: study.trialStarted,
        trialSettled: (trial, outcome) => {
          study.trialSettled(trial, outcome);
          if (outcome.ok && outcome.computeBackendFallbackReason !== null) {
            const { computeBackend, computeBackendFallbackReason } = outcome;
            patchOptimization(optimizationId, (current) =>
              current.computeBackendFallbackReason === null
                ? { ...current, computeBackend, computeBackendFallbackReason }
                : current,
            );
          }
        },
      };
    },
    [patchOptimization],
  );

  /**
   * The capability behind the source: the remote one as given, or a connected
   * one wired to the experiments backend on first use and kept while the
   * source stays the same. Connecting happens on demand rather than in render
   * so a source never connects twice, and the cleanup below tears the
   * connection down, with the runs made through it, when the source changes
   * or the provider unmounts.
   */
  const resolveCapability = useCallback((): PetrinautOptimization | null => {
    if (source === null || !isConnectedOptimization(source)) {
      return source;
    }
    const current = connectionRef.current;
    if (current?.source === source) {
      return current.capability;
    }
    current?.dispose();
    const connection = connectOptimizationSource(
      source,
      experimentsActionsRef,
      resolveChannelStudy,
    );
    connectionRef.current = connection;
    return connection.capability;
  }, [experimentsActionsRef, resolveChannelStudy, source]);

  useEffect(
    () => () => {
      const connection = connectionRef.current;
      if (connection?.source === source) {
        connection.dispose();
        connectionRef.current = null;
        // A connected capability's runs end with its connection: aborting
        // their attach loops settles each record as cancelled, and the
        // studies' own batches stop with them.
        for (const controller of abortControllersRef.current.values()) {
          controller.abort();
        }
        for (const study of studiesRef.current.values()) {
          study.dispose();
        }
        studiesRef.current.clear();
      }
    },
    [source],
  );

  const createOptimization: OptimizationsContextValue["createOptimization"] =
    async (rawInput, options) => {
      const capability = resolveCapability();
      if (!capability) {
        throw new Error("Optimization is unavailable");
      }

      const input = petrinautOptimizationInputSchema.parse(rawInput);
      const optimizationId = crypto.randomUUID();
      const abortController = new AbortController();
      const connection =
        connectionRef.current?.capability === capability
          ? connectionRef.current
          : null;
      const connected = connection !== null;
      const computeBackend = connected
        ? (options?.computeBackend ?? "cpu")
        : "cpu";
      const parallelism = connected ? (options?.parallelism ?? 1) : 1;
      const study = connected
        ? createConnectedStudy({
            optimizationId,
            input,
            axes: buildOptimizationSurfaceAxes(input),
            computeBackend,
            runDetachedObjective: (request) =>
              experimentsActionsRef.current.runDetachedObjective(request),
            onUpdate: (update) => {
              patchOptimization(optimizationId, (current) => ({
                ...current,
                ...update,
              }));
            },
          })
        : null;
      if (study) {
        studiesRef.current.set(optimizationId, study);
      }

      abortControllersRef.current.set(optimizationId, abortController);
      setOptimizations((current) => [
        createOptimizationRecord(optimizationId, input, {
          computeBackend,
          parallelism,
          navigation: study?.initialNavigation ?? null,
        }),
        ...current,
      ]);
      setSelectedOptimizationId(optimizationId);

      const consumeRun = async () => {
        let runId: string;
        try {
          ({ runId } = await (connection
            ? connection.capability.createOptimizationRun(input, {
                signal: abortController.signal,
                parallelism,
              })
            : capability.createOptimizationRun(input, {
                signal: abortController.signal,
              })));
        } catch (error) {
          const classified = classifyError(error);
          if (
            abortController.signal.aborted ||
            isAbortError(error) ||
            classified?.category === "aborted"
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
        if (!connected) {
          // A connected study's run lives in this page; a reload cannot
          // re-attach to it.
          storeActiveRun(runId, input);
        }
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
        // A continuation may have taken the entries over by now.
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
    if (source !== null && isConnectedOptimization(source)) {
      return;
    }
    const storedRuns = Object.entries(readStoredActiveRuns());
    if (storedRuns.length === 0) {
      return;
    }
    const capability = resolveCapability();
    if (!capability) {
      return;
    }

    // Snapshot the (provider-lifetime) maps so the cleanup below operates on
    // the same instances it registered into.
    const abortControllers = abortControllersRef.current;
    const runIds = runIdsRef.current;

    const startedIds: string[] = [];
    for (const [runId, storedRun] of storedRuns) {
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
  }, [resolveCapability, runAttachLoop, source]);

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
    const connected = studiesRef.current.has(optimizationId);
    if (runId !== undefined) {
      removeStoredActiveRun(runId);
      // Stop the detached run server-side; aborting the local attachment
      // below only drops this tab's connection to it.
      void resolveCapability()
        ?.cancelOptimizationRun(runId)
        .catch(() => undefined);
    }
    if (connected) {
      // The study's segment ends with a terminal event once its steps in
      // flight are pruned. The attachment stays to apply it, so the record's
      // cursor covers the whole segment and a continuation resumes right
      // after it; the status settles here without waiting, and the terminal
      // event offers the continuation.
      markOptimizationCancelled(optimizationId);
      return;
    }
    if (runId !== undefined) {
      runIdsRef.current.delete(optimizationId);
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
      const connection = connectionRef.current;
      // A connected study keeps its sampler until it is released; a remote
      // run is stopped server-side.
      void (
        connection && studiesRef.current.has(optimizationId)
          ? connection.capability.releaseOptimizationRun(runId)
          : (resolveCapability()?.cancelOptimizationRun(runId) ??
            Promise.resolve())
      ).catch(() => undefined);
    }
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    disposeStudy(optimizationId);
    dropOptimizationRecord(optimizationId);
  };

  const extendOptimization: OptimizationsContextValue["extendOptimization"] =
    async (optimizationId, trials) => {
      const existing = optimizations.find(
        (optimization) => optimization.id === optimizationId,
      );
      const connection = connectionRef.current;
      const study = studiesRef.current.get(optimizationId);
      if (
        !existing?.resumable ||
        existing.runId === null ||
        !connection ||
        !study
      ) {
        throw new Error("This optimization cannot be continued");
      }
      const { runId } = existing;
      try {
        await connection.capability.extendOptimizationRun(runId, trials, {
          parallelism: existing.parallelism,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        patchOptimization(optimizationId, (current) => ({
          ...current,
          error: message,
        }));
        throw error;
      }
      const abortController = new AbortController();
      abortControllersRef.current.set(optimizationId, abortController);
      runIdsRef.current.set(optimizationId, runId);
      study.resume();
      patchOptimization(optimizationId, (current) => ({
        ...current,
        status: "running",
        resumable: false,
        error: null,
        errorCategory: null,
        errorDiagnostics: null,
        connectionState: "streaming",
      }));
      void runAttachLoop({
        optimizationId,
        runId,
        attach: connection.capability.attachOptimizationRun.bind(
          connection.capability,
        ),
        cancel: connection.capability.cancelOptimizationRun.bind(
          connection.capability,
        ),
        abortController,
        cursor: existing.lastSeq,
      }).finally(() => {
        if (
          abortControllersRef.current.get(optimizationId) === abortController
        ) {
          abortControllersRef.current.delete(optimizationId);
          runIdsRef.current.delete(optimizationId);
        }
      });
    };

  const setOptimizationNavigation: OptimizationsContextValue["setOptimizationNavigation"] =
    (optimizationId, patch) => {
      studiesRef.current.get(optimizationId)?.setNavigation(patch);
    };

  const retryOptimization: OptimizationsContextValue["retryOptimization"] =
    async (optimizationId) => {
      const existing = optimizations.find(
        (optimization) => optimization.id === optimizationId,
      );
      if (!existing) {
        return null;
      }
      return createOptimization(existing.input, {
        computeBackend: existing.computeBackend,
        parallelism: existing.parallelism,
      });
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
    extendOptimization,
    setOptimizationNavigation,
    retryOptimization,
  };

  return <OptimizationsContext value={value}>{children}</OptimizationsContext>;
};
