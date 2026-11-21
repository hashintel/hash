import { Icon, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { EMPTY_AD_HOC_STATE } from "@hashintel/petrinaut-core";

import { AdHocScenarioForm } from "../../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { Section } from "../../../../../../components/section";
import { FocusControls } from "../../../../../../worksheet/focus-controls";
import { ExperimentScenarioRun } from "./experiment-scenario-run";
import { fieldStyle } from "./form-field-styles";
import { NO_SCENARIO_VALUE } from "./scenario-selection";

import type { ExperimentParameterInput } from "../../../../../../../react/experiments/parameter-grid";
import type { ScenarioRunInput } from "./experiment-scenario-inputs";
import type { SweepSummary } from "./sweep-summary";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

const sweepSummaryStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  "&[data-tone='error']": { color: "red.s100" },
});

const noScenarioIconStyle = css({ opacity: "[0.4]" });

/**
 * What every run starts from: a saved scenario with its parameters, or, with
 * "No scenario", an initial state and parameters defined in place.
 */
export const ScenarioSection = ({
  scenarios,
  scenario,
  onScenarioChange,
  paramInputs,
  onParamInputsChange,
  adHocState,
  onAdHocStateChange,
  context,
  sweepSummary,
}: {
  scenarios: readonly Scenario[];
  /** The selected scenario; undefined for "No scenario". */
  scenario: Scenario | undefined;
  /** Called with a scenario's id, or the "No scenario" value. */
  onScenarioChange: (value: string) => void;
  paramInputs: Readonly<Record<string, ExperimentParameterInput>>;
  onParamInputsChange: (updates: ScenarioRunInput[]) => void;
  adHocState: AdHocScenarioState | null;
  onAdHocStateChange: (state: AdHocScenarioState) => void;
  /** The net both scenario bodies resolve names and types against. */
  context: AdHocSynthesisContext;
  sweepSummary: SweepSummary | null;
}) => {
  const options = [
    ...scenarios.map(({ id, name }) => ({ value: id, text: name })),
    { value: NO_SCENARIO_VALUE, text: "No scenario" },
  ];

  return (
    <Section title="Scenario" collapsible defaultOpen>
      <FocusControls>
        <div className={fieldStyle}>
          <Select
            required
            aria-label="Scenario"
            value={scenario?.id ?? NO_SCENARIO_VALUE}
            onChange={onScenarioChange}
            items={options}
            size="sm"
            renderItem={(value) => (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {value === NO_SCENARIO_VALUE && (
                  <Icon name="dash" size="xs" className={noScenarioIconStyle} />
                )}
                {options.find((option) => option.value === value)?.text}
              </span>
            )}
          />
        </div>
      </FocusControls>

      {scenario ? (
        // The selected scenario shows through the form in run mode: scenario
        // parameters editable in worksheet style, and a collapsed "Computed
        // state" preview of the exact values and tokens each run starts with.
        <ExperimentScenarioRun
          scenario={scenario}
          context={context}
          inputs={paramInputs}
          onInputsChange={onParamInputsChange}
        />
      ) : (
        // With no scenario, the experiment's Initial State + Parameters are
        // defined inline and compile through a scenario generated at
        // experiment start, never persisted. Left untouched, the experiment
        // runs from the model's own initial marking.
        <AdHocScenarioForm
          state={adHocState ?? EMPTY_AD_HOC_STATE}
          onChange={onAdHocStateChange}
          context={context}
          selection="sweep"
        />
      )}
      {sweepSummary ? (
        <span
          className={sweepSummaryStyle}
          data-tone={sweepSummary.error ? "error" : "neutral"}
        >
          {sweepSummary.text}
        </span>
      ) : null}
    </Section>
  );
};
