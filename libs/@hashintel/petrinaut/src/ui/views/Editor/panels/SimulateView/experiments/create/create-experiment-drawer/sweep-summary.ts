import {
  type AdHocScenarioState,
  type AdHocSynthesisContext,
  type Scenario,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";

import {
  axisDisplayName,
  buildAdHocSweepAxes,
  buildParameterAxis,
  type ExperimentParameterAxis,
  type ExperimentParameterInput,
} from "../../../../../../../../react/experiments/parameter-grid";
import { hasAdHocIntervalToggle } from "./ad-hoc-interval-toggles";

export type SweepSummary = {
  /** The swept parameters in a sentence, or the first invalid interval. */
  readonly text: string;
  readonly error: boolean;
};

/**
 * The sweep the form's interval inputs define: a saved scenario's range
 * inputs, or the ad-hoc form's toggles when no scenario is selected. Null
 * when no parameter sweeps, which is a plain single-combination experiment.
 */
export const describeSweep = ({
  scenario,
  paramInputs,
  adHocState,
  context,
}: {
  scenario: Scenario | undefined;
  paramInputs: Readonly<Record<string, ExperimentParameterInput>>;
  adHocState: AdHocScenarioState | null;
  context: AdHocSynthesisContext;
}): SweepSummary | null => {
  const axes: ExperimentParameterAxis[] = [];
  for (const param of scenario?.scenarioParameters ?? []) {
    const input = paramInputs[param.identifier];
    if (!input || input.mode !== "range") {
      continue;
    }
    const outcome = buildParameterAxis(param, input);
    if (!outcome.ok) {
      return { text: outcome.error, error: true };
    }
    axes.push(outcome.axis);
  }
  if (scenario === undefined && adHocState) {
    // A definition that does not synthesize reports at its slots. While a
    // toggle is on, the summary carries its first error the way a saved
    // scenario's invalid interval does, so the Objective section and the
    // footer word hold their place while a bound is being edited.
    const synthesized = synthesizeAdHocOptimization(adHocState, context);
    if (synthesized.ok) {
      const outcome = buildAdHocSweepAxes(synthesized.output.optimizedFields);
      if (!outcome.ok) {
        return { text: outcome.error, error: true };
      }
      axes.push(...outcome.axes);
    } else if (hasAdHocIntervalToggle(adHocState)) {
      const firstError = synthesized.errors[0];
      if (firstError) {
        return { text: firstError.message, error: true };
      }
    }
  }
  if (axes.length === 0) {
    return null;
  }
  const names = axes.map(axisDisplayName).join(", ");
  const intervals =
    axes.length === 1 ? "over its interval" : "over their intervals";
  return { text: `${names} swept ${intervals}`, error: false };
};
