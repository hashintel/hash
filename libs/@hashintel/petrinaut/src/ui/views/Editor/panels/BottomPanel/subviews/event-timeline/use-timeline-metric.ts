import { use, useEffect, useState } from "react";

import {
  createHirMetricEvaluator,
  resolveNetParameterValues,
  sanitizeSDCPNForExtensions,
  type Metric,
  type MetricShape,
} from "@hashintel/petrinaut-core";
import { fingerprintHirCompilationInput } from "@hashintel/petrinaut-core/hir-runtime";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";

import type { TimelineMetricEvaluator } from "../simulation-timeline/series-config/metric";

type TimelineMetricState = {
  /** Identity of the compiled metric (id + code), null when none. */
  key: string | null;
  evaluate: TimelineMetricEvaluator | null;
  /** How the metric moves over a run, inferred from its code; null until compiled. */
  shape: MetricShape | null;
  error: string | null;
};

const EMPTY_TIMELINE_METRIC_STATE: TimelineMetricState = {
  key: null,
  evaluate: null,
  shape: null,
  error: null,
};

/**
 * Compiles the selected timeline metric through the HIR (in the language
 * worker) and binds the resulting buffer program to frame readers. The
 * compile is asynchronous — while it is in flight the extractor plots gaps.
 */
export function useTimelineMetric(metric: Metric | null): TimelineMetricState {
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { parameterValues } = use(SimulationContext);
  const [state, setState] = useState<TimelineMetricState>(
    EMPTY_TIMELINE_METRIC_STATE,
  );
  // Resolved net parameter values bound to ambient `parameters.<name>` reads
  // in the metric. They can change between runs (including scenario
  // overrides), so they participate in the metric key to rebind the evaluator.
  const netParameterValues = resolveNetParameterValues(
    petriNetDefinition.parameters,
    parameterValues,
    extensions.parameters,
  );
  const compilationFingerprint = fingerprintHirCompilationInput(
    sanitizeSDCPNForExtensions(petriNetDefinition, extensions),
    extensions,
  );
  const key = metric
    ? `${compilationFingerprint}\u0000${metric.id}\u0000${metric.code}\u0000${JSON.stringify(netParameterValues)}`
    : null;

  useEffect(() => {
    if (!metric || !key) {
      return;
    }

    let cancelled = false;
    requestHirArtifacts(
      { ...petriNetDefinition, metrics: [metric] },
      extensions,
    )
      .then(({ artifacts, failures }) => {
        if (cancelled) {
          return;
        }
        const artifact = artifacts.metrics[metric.id];
        if (!artifact) {
          const message = failures
            .filter(
              (failure) =>
                failure.itemType === "metric" && failure.itemId === metric.id,
            )
            .flatMap((failure) =>
              failure.diagnostics.map((diagnostic) => diagnostic.message),
            )
            .join("; ");
          setState({
            key,
            evaluate: null,
            shape: null,
            error: message || `Metric "${metric.name}" did not compile`,
          });
          return;
        }
        setState({
          key,
          evaluate: createHirMetricEvaluator({
            metricName: metric.name,
            artifact,
            places: petriNetDefinition.places,
            parameterValues: netParameterValues,
          }),
          shape: artifact.shape,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            key,
            evaluate: null,
            shape: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    metric,
    key,
    extensions,
    petriNetDefinition,
    requestHirArtifacts,
    netParameterValues,
  ]);

  // Effects run after render. Hide a previous evaluator/error synchronously
  // whenever the metric, schema, code, or extension settings change.
  return state.key === key ? state : EMPTY_TIMELINE_METRIC_STATE;
}
