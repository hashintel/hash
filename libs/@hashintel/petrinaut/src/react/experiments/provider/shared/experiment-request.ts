import type { CompileScenarioOutcome } from "@hashintel/petrinaut-core";
import type { ExperimentRequest } from "@hashintel/petrinaut-core/experiments";

/** Compiles the scenario at one concrete assignment of the swept parameters. */
export type SweptScenarioCompiler = {
  compileForValues: (
    swept: Readonly<Record<string, number>>,
  ) => Extract<CompileScenarioOutcome, { ok: true }>;
  /**
   * Numbers-only compile for per-run draws: skips the initial state, which
   * per-run translation never reads, and the string conversion, which
   * typed-array plans never want.
   */
  compileRunNumbers: (swept: Readonly<Record<string, number>>) => {
    parameters: Readonly<Record<string, number | boolean>>;
  };
};

/** Per-batch fields a sweep swaps out; a plain run passes none. */
export type ExperimentRequestOverride = Partial<
  Pick<
    ExperimentRequest,
    | "parameterValues"
    | "initialMarking"
    | "seed"
    | "runCount"
    | "runs"
    | "runPlan"
  >
>;

export type BuildExperimentRequest = (options: {
  needsHirTrees: boolean;
  override?: ExperimentRequestOverride;
}) => Promise<ExperimentRequest>;
