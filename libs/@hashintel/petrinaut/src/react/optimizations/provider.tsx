import { use, useEffect, useRef, useState } from "react";

import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { PetrinautOptimizationContext } from "../optimization-context";
import {
  type OptimizationErrorCategory,
  type OptimizationErrorDiagnostics,
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";

import type { PropsWithChildren } from "react";

const ERROR_CATEGORIES = new Set<OptimizationErrorCategory>([
  "network",
  "http",
  "protocol",
  "aborted",
]);

type ClassifiedError = {
  category: OptimizationErrorCategory;
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

export const OptimizationsProvider = ({ children }: PropsWithChildren) => {
  const capability = use(PetrinautOptimizationContext);
  const abortControllersRef = useRef(new Map<string, AbortController>());
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

  const createOptimization: OptimizationsContextValue["createOptimization"] =
    async (rawInput) => {
      if (!capability) {
        throw new Error("Optimization is unavailable");
      }

      const input = petrinautOptimizationInputSchema.parse(rawInput);
      const optimizationId = crypto.randomUUID();
      const abortController = new AbortController();
      const optimization: OptimizationRecord = {
        id: optimizationId,
        input,
        createdAt: Date.now(),
        status: "initializing",
        error: null,
        errorCategory: null,
        errorDiagnostics: null,
        requestedTrials: input.study.trials,
        completedTrials: 0,
        prunedTrials: 0,
        failedTrials: 0,
        trials: [],
        best: null,
      };

      abortControllersRef.current.set(optimizationId, abortController);
      setOptimizations((current) => [optimization, ...current]);
      setSelectedOptimizationId(optimizationId);

      const consumeEvents = async () => {
        try {
          for await (const event of capability.optimize(input, {
            signal: abortController.signal,
          })) {
            if (abortController.signal.aborted) {
              break;
            }

            switch (event.type) {
              case "started":
                patchOptimization(optimizationId, (current) => ({
                  ...current,
                  status: "running",
                  requestedTrials: event.requestedTrials,
                }));
                break;
              case "trial":
                patchOptimization(optimizationId, (current) => ({
                  ...current,
                  status: "running",
                  completedTrials:
                    current.completedTrials +
                    (event.state === "complete" ? 1 : 0),
                  prunedTrials:
                    current.prunedTrials + (event.state === "pruned" ? 1 : 0),
                  failedTrials:
                    current.failedTrials + (event.state === "failed" ? 1 : 0),
                  trials: [...current.trials, event],
                  best: event.best ?? current.best,
                }));
                break;
              case "complete":
                patchOptimization(optimizationId, (current) => ({
                  ...current,
                  status: "complete",
                  requestedTrials: event.requestedTrials,
                  completedTrials: event.completedTrials,
                  prunedTrials: event.prunedTrials,
                  failedTrials: event.failedTrials,
                  best: event.best,
                }));
                break;
              case "error":
                patchOptimization(optimizationId, (current) => ({
                  ...current,
                  status: "error",
                  error: event.message,
                }));
                break;
            }
          }
        } catch (error) {
          const classified = classifyError(error);
          const cancelled =
            abortController.signal.aborted ||
            isAbortError(error) ||
            classified?.category === "aborted";
          patchOptimization(optimizationId, (current) => {
            if (cancelled) {
              return {
                ...current,
                status: "cancelled",
                error: null,
                errorCategory: null,
                errorDiagnostics: null,
              };
            }
            return {
              ...current,
              status: "error",
              // A classified transport failure yields a safe, actionable
              // message and correlation ids; anything else keeps its message.
              error: classified
                ? buildErrorMessage(classified, current)
                : error instanceof Error
                  ? error.message
                  : String(error),
              errorCategory: classified?.category ?? null,
              errorDiagnostics: classified?.diagnostics ?? null,
            };
          });
        } finally {
          abortControllersRef.current.delete(optimizationId);
        }
      };

      void consumeEvents();
      return optimizationId;
    };

  const cancelOptimization: OptimizationsContextValue["cancelOptimization"] = (
    optimizationId,
  ) => {
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    patchOptimization(optimizationId, (current) => ({
      ...current,
      status: "cancelled",
      error: null,
    }));
  };

  const removeOptimization: OptimizationsContextValue["removeOptimization"] = (
    optimizationId,
  ) => {
    abortControllersRef.current.get(optimizationId)?.abort();
    abortControllersRef.current.delete(optimizationId);
    setOptimizations((current) =>
      current.filter((optimization) => optimization.id !== optimizationId),
    );
    setSelectedOptimizationId((current) =>
      current === optimizationId ? null : current,
    );
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
