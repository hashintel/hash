import { createHirPredicateEvaluator } from "../../frames/hir-metric";

import type { SDCPN } from "../../../types/sdcpn";
import type {
  MonteCarloMetricRunStatus,
  MonteCarloPredicateSpec,
  MonteCarloUserDefinedPredicate,
  MonteCarloUserDefinedPredicateConfig,
  MonteCarloUserDefinedPredicateRunResult,
  MonteCarloUserDefinedPredicateSnapshot,
} from "./types";

/** Errored runs are never tested — they stay false in the results. */
function shouldTestPredicateRun(status: MonteCarloMetricRunStatus): boolean {
  return status !== "error";
}

function cloneResults(
  results: readonly MonteCarloUserDefinedPredicateRunResult[],
): MonteCarloUserDefinedPredicateRunResult[] {
  return results.map((result) => ({ ...result }));
}

function createSnapshot(args: {
  id: string;
  label: string;
  frameNumber: number;
  time: number;
  results: readonly MonteCarloUserDefinedPredicateRunResult[];
}): MonteCarloUserDefinedPredicateSnapshot {
  return {
    predicateId: args.id,
    label: args.label,
    frameNumber: args.frameNumber,
    time: args.time,
    runCount: args.results.length,
    trueRunCount: args.results.filter((result) => result.value).length,
    runResults: cloneResults(args.results),
  };
}

function createExpressionPredicateConfig(
  spec: MonteCarloPredicateSpec,
  sdcpn: SDCPN,
): MonteCarloUserDefinedPredicateConfig {
  // Expression predicates run exclusively as HIR-compiled buffer programs.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guards specs built before artifact threading (e.g. persisted configs)
  if (!spec.artifact) {
    throw new Error(
      `Predicate "${spec.label}" has no compiled artifact — expression predicates must be compiled through the HIR before starting an experiment.`,
    );
  }

  const evaluate = createHirPredicateEvaluator({
    predicateName: spec.label,
    artifact: spec.artifact,
    places: sdcpn.places,
  });

  return {
    id: spec.id,
    label: spec.label,
    test: ({ frame }) => evaluate(frame),
  };
}

export function createMonteCarloUserDefinedPredicateConfigsFromSpecs(
  specs: readonly MonteCarloPredicateSpec[],
  sdcpn: SDCPN,
): MonteCarloUserDefinedPredicateConfig[] {
  return specs.map((spec) => createExpressionPredicateConfig(spec, sdcpn));
}

export function createMonteCarloUserDefinedPredicate(
  config: MonteCarloUserDefinedPredicateConfig,
): MonteCarloUserDefinedPredicate {
  const label = config.label ?? config.id;
  let results: MonteCarloUserDefinedPredicateRunResult[] = [];
  let latestSnapshot: MonteCarloUserDefinedPredicateSnapshot | null = null;
  let version = 0;

  const ensureResults = (runCount: number) => {
    if (results.length === runCount) {
      return;
    }

    results = Array.from({ length: runCount }, (_, runIndex) => ({
      runIndex,
      value: false,
      trueAt: null,
    }));
    latestSnapshot = null;
    version = 0;
  };

  return {
    id: config.id,
    label,
    get version() {
      return version;
    },
    get results() {
      return results;
    },
    getLatestSnapshot: () => latestSnapshot,
    clear: () => {
      results = [];
      latestSnapshot = null;
      version = 0;
    },
    observeFrame: (context) => {
      ensureResults(context.runCount);

      let changed = latestSnapshot === null;

      context.forEachRunFrame((run) => {
        const result = results[run.runIndex];
        if (!result || result.value || !shouldTestPredicateRun(run.status)) {
          return;
        }

        if (
          config.test({
            runIndex: run.runIndex,
            status: run.status,
            frame: run.frame,
          })
        ) {
          result.value = true;
          result.trueAt = context.time;
          changed = true;
        }
      });

      if (!changed) {
        return;
      }

      latestSnapshot = createSnapshot({
        id: config.id,
        label,
        frameNumber: context.frameNumber,
        time: context.time,
        results,
      });
      version++;
    },
  };
}
