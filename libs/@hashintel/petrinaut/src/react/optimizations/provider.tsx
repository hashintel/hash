import { use, useEffect, useRef, useState } from "react";

import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { PetrinautOptimizationContext } from "../optimization-context";
import {
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";

import type { PropsWithChildren } from "react";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
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
          patchOptimization(optimizationId, (current) => ({
            ...current,
            status:
              abortController.signal.aborted || isAbortError(error)
                ? "cancelled"
                : "error",
            error:
              abortController.signal.aborted || isAbortError(error)
                ? null
                : error instanceof Error
                  ? error.message
                  : String(error),
          }));
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
  };

  return <OptimizationsContext value={value}>{children}</OptimizationsContext>;
};
