/**
 * @layerRoot react.ai-experiments
 * @role Runs bounded host requests over experiments and their optimizer
 */
import { use, useEffect, useRef, useState } from "react";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { ExperimentsContext } from "../experiments/context";
import { useStableCallback } from "../hooks/use-stable-callback";
import { PetrinautInstanceContext } from "../instance-context";
import { LanguageClientContext } from "../lsp/context";
import { NotificationsContext } from "../notifications/context";
import { OptimizationsContext } from "../optimizations/context";
import { SDCPNContext } from "../state/sdcpn-context";
import { AiExperimentsContext } from "./context";
import { runExperiment } from "./run-experiment";

import type { ExperimentRecord } from "../experiments/context";
import type { OptimizationRecord } from "../optimizations/context";
import type { PetrinautExperimentHost } from "@hashintel/petrinaut-core/ai";
import type { PropsWithChildren } from "react";

export const AiExperimentsProvider = ({ children }: PropsWithChildren) => {
  const { petriNetDefinition, extensions, title } = use(SDCPNContext);
  const instance = use(PetrinautInstanceContext);
  const experimentsContext = use(ExperimentsContext);
  const optimizationsContext = use(OptimizationsContext);
  const languageClient = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const [experiments] = useState(() =>
    createReadableStore<readonly ExperimentRecord[]>([]),
  );
  const [optimizations] = useState(() =>
    createReadableStore<readonly OptimizationRecord[]>([]),
  );
  const controllers = useRef(new Set<AbortController>());
  useEffect(
    () => experiments.set(experimentsContext.experiments),
    [experiments, experimentsContext.experiments],
  );
  useEffect(
    () => optimizations.set(optimizationsContext.optimizations),
    [optimizations, optimizationsContext.optimizations],
  );
  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active) {
        controller.abort();
      }
      active.clear();
    };
  }, []);
  const createExperiment: PetrinautExperimentHost["createExperiment"] =
    useStableCallback(async (request, options) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      options?.signal?.addEventListener("abort", cancel, { once: true });
      if (options?.signal?.aborted) {
        cancel();
      }
      controllers.current.add(controller);
      try {
        const result = await runExperiment(
          {
            definition: instance?.definition.get() ?? petriNetDefinition,
            extensions: instance?.extensions ?? extensions,
            title,
            experiments,
            optimizations,
            actions: {
              createExperiment: experimentsContext.createExperiment,
              navigateSweep: experimentsContext.navigateSweep,
              cancelExperiment: experimentsContext.cancelExperiment,
              createOptimization: optimizationsContext.createOptimization,
              cancelOptimization: optimizationsContext.cancelOptimization,
            },
            validate: async (definition, settings) => {
              const diagnostics = await languageClient.requestDiagnostics(
                definition,
                settings,
              );
              if (diagnostics.errorCount > 0) {
                throw new Error(
                  [...diagnostics.byUri.values()]
                    .flat()
                    .filter((diagnostic) => diagnostic.severity === 1)
                    .map((diagnostic) => diagnostic.message)
                    .join("\n"),
                );
              }
            },
          },
          request,
          { ...options, signal: controller.signal },
        );
        addNotification({
          message:
            result.status === "complete"
              ? `${result.name} complete`
              : (result.message ?? `${result.name} stopped`),
          tone:
            result.status === "complete"
              ? "success"
              : result.status === "error"
                ? "error"
                : "neutral",
        });
        return result;
      } finally {
        options?.signal?.removeEventListener("abort", cancel);
        controllers.current.delete(controller);
      }
    });
  const [value] = useState<PetrinautExperimentHost>(() => ({
    createExperiment,
  }));
  return (
    <AiExperimentsContext.Provider value={value}>
      {children}
    </AiExperimentsContext.Provider>
  );
};
