import { createHirMetricEvaluator } from "../../frames/hir-metric";

import type { SDCPN } from "../../../types/sdcpn";
import type {
  MonteCarloExpressionMetricSpec,
  MonteCarloMetricSpec,
  MonteCarloMetricSpecBase,
  MonteCarloNumericMetricSpec,
  MonteCarloPredicateSpec,
  MonteCarloUserDefinedMetricConfig,
} from "./types";

/**
 * Splits an experiment's combined `metricSpecs` list into numeric metric
 * specs and predicate specs. The two kinds share one channel (config field,
 * init message); runtimes split once at the point they build executables.
 */
export function splitMonteCarloMetricSpecs(
  specs: readonly MonteCarloMetricSpec[] | undefined,
): {
  metricSpecs: MonteCarloNumericMetricSpec[];
  predicateSpecs: MonteCarloPredicateSpec[];
} {
  const metricSpecs: MonteCarloNumericMetricSpec[] = [];
  const predicateSpecs: MonteCarloPredicateSpec[] = [];

  for (const spec of specs ?? []) {
    if (spec.type === "Predicate") {
      predicateSpecs.push(spec);
    } else {
      metricSpecs.push(spec);
    }
  }

  return { metricSpecs, predicateSpecs };
}

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
  spec: MonteCarloExpressionMetricSpec,
  sdcpn: SDCPN,
): MonteCarloUserDefinedMetricConfig {
  // Expression metrics run exclusively as HIR-compiled buffer programs.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guards specs built before artifact threading (e.g. persisted configs)
  if (!spec.artifact) {
    throw new Error(
      `Metric "${spec.label}" has no compiled artifact — expression metrics must be compiled through the HIR before starting an experiment.`,
    );
  }

  const evaluate = createHirMetricEvaluator({
    metricName: spec.label,
    artifact: spec.artifact,
    places: sdcpn.places,
  });

  return applyMetricSpecBase(spec, ({ frame }) => evaluate(frame));
}

export function createMonteCarloUserDefinedMetricConfigsFromSpecs(
  specs: readonly MonteCarloNumericMetricSpec[],
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
