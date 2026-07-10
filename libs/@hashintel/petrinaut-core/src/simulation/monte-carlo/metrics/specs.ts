import { compileMetric } from "../../authoring/metric/compile-metric";
import { buildMetricState } from "../../frames/metric-state";

import type { Metric, SDCPN } from "../../../types/sdcpn";
import type {
  MonteCarloMetricSpec,
  MonteCarloMetricSpecBase,
  MonteCarloUserDefinedMetricConfig,
} from "./types";

function applyMetricSpecBase(
  spec: MonteCarloMetricSpecBase,
  measure: MonteCarloUserDefinedMetricConfig["measure"],
): MonteCarloUserDefinedMetricConfig {
  return {
    id: spec.id,
    label: spec.label,
    measure,
    ...(spec.sampleRuns !== undefined ? { sampleRuns: spec.sampleRuns } : {}),
    ...(spec.runOutput !== undefined ? { runOutput: spec.runOutput } : {}),
    ...(spec.aggregateRuns !== undefined
      ? { aggregateRuns: spec.aggregateRuns }
      : {}),
    ...(spec.aggregateTime !== undefined
      ? { aggregateTime: spec.aggregateTime }
      : {}),
  };
}

function createExpressionMetricConfig(
  spec: Extract<MonteCarloMetricSpec, { kind: "expression" }>,
  sdcpn: SDCPN,
): MonteCarloUserDefinedMetricConfig {
  const metric: Metric = {
    id: spec.id,
    name: spec.label,
    code: spec.code,
  };
  const compiled = compileMetric(metric);

  if (!compiled.ok) {
    throw new Error(compiled.error);
  }

  return applyMetricSpecBase(spec, ({ frame }) =>
    compiled.fn(buildMetricState(frame, sdcpn.places)),
  );
}

export function createMonteCarloUserDefinedMetricConfigsFromSpecs(
  specs: readonly MonteCarloMetricSpec[],
  sdcpn: SDCPN,
): MonteCarloUserDefinedMetricConfig[] {
  return specs.flatMap((spec) => {
    switch (spec.kind) {
      case "expression":
        return [createExpressionMetricConfig(spec, sdcpn)];
      case "placeTokenCountMean":
        return [
          applyMetricSpecBase(spec, ({ frame }) =>
            frame.getPlaceTokenCount(spec.placeId),
          ),
        ];
      case "transitionFiringCount":
        return [
          applyMetricSpecBase(spec, ({ frame }) => {
            const state = frame.getTransitionState(spec.transitionId);

            if (!state) {
              return null;
            }

            return spec.mode === "cumulative"
              ? state.firingCount
              : state.firedInThisFrame
                ? 1
                : 0;
          }),
        ];
      default: {
        const exhaustive: never = spec;
        throw new Error(`Unsupported metric spec: ${String(exhaustive)}`);
      }
    }
  });
}
