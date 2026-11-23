/**
 * The experiment drawer's scenario body when a saved scenario is selected:
 * the scenario shows through the form in run mode — its scenario parameters
 * editable in worksheet style — above a collapsed "Computed state"
 * sub-section that materializes the exact parameter values and initial
 * tokens each run will start with. The materialization (lowering, compiling,
 * converting the marking to literal rows) only happens while that
 * sub-section is open, and recomputes as the values above change.
 */

import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useScenarioHir } from "../../../../../../../react/simulation/use-scenario-hir";
import {
  AdHocScenarioForm,
  FormLayoutColumn,
  FormSectionHeader,
} from "../../../../../../ad-hoc-scenario-form/ad-hoc-scenario-form";
import { OverlayScrollArea } from "../../../../../../shared/overlay-scroll-area";
import { Section } from "../../../../../../shared/section";
import { StackedSections } from "../../../../../../shared/stacked-sections";
import { scenarioExpressions } from "../../../../../shared/scenario-expressions";
import { useScenarioRun } from "../../shared/use-scenario-run";
import {
  scenarioRunInputs,
  seedRunVariables,
} from "./experiment-scenario-inputs";
import { computedStatePreview } from "./experiment-scenario-run/computed-state-preview";

import type { ExperimentParameterInput } from "../../../../../../../react/experiments/parameter-grid";
import type { ScenarioRunInput } from "./experiment-scenario-inputs";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

const emptyMessageStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const groupStyle = css({ display: "contents" });

const computedStatePreviewStyle = css({
  display: "flex",
  flexDirection: "column",
  maxHeight: "[320px]",
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
});

const noticeStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  backgroundColor: "[rgb(217 119 6 / 0.08)]",
  border: "1px solid",
  borderColor: "[rgb(217 119 6 / 0.35)]",
  borderRadius: "sm",
  paddingX: "2",
  paddingY: "1.5",
});

interface ExperimentScenarioRunProps {
  scenario: Scenario;
  /** The net the scenario compiles and renders against. */
  context: AdHocSynthesisContext;
  /**
   * The experiment's scenario parameter inputs, keyed by identifier: a fixed
   * value, or the range of a swept parameter.
   */
  inputs: Readonly<Record<string, ExperimentParameterInput>>;
  onInputsChange: (updates: ScenarioRunInput[]) => void;
}

export const ExperimentScenarioRun: React.FC<ExperimentScenarioRunProps> = ({
  scenario,
  context,
  inputs,
  onInputsChange,
}) => {
  const hirState = useScenarioHir(scenario, { adHocContext: context });
  const [computedOpen, setComputedOpen] = useState(false);
  const run = useScenarioRun(scenario, (seeded) =>
    seedRunVariables(seeded, inputs),
  );

  const onFormChange = (next: AdHocScenarioState) => {
    run?.setState(next.variables);
    const updates = scenarioRunInputs(next, scenario, context);
    if (updates.length > 0) {
      onInputsChange(updates);
    }
  };

  const computed = computedOpen
    ? computedStatePreview({ hirState, scenario, inputs, context })
    : null;

  const renderState: AdHocScenarioState = {
    variables: run?.state ?? [],
    netParameters: computed?.ready ? computed.netParameters : [],
    places: computed?.ready ? computed.places : {},
  };
  // The run form's rows render only the exposed Variables, so a scenario
  // exposing none leaves the group empty rather than absent.
  const exposesParameters = renderState.variables.some(
    (variable) => variable.exposed,
  );

  return (
    <AdHocScenarioForm
      key={run?.key}
      state={renderState}
      onChange={onFormChange}
      context={context}
      selection="sweep"
      mode="run"
      expressionFor={scenarioExpressions(scenario, context)}
      renderLayout={({
        variables,
        parameters,
        places,
        placesVisibilityControl,
      }) => (
        <FormLayoutColumn>
          {exposesParameters ? (
            variables
          ) : (
            <div className={emptyMessageStyle}>
              This scenario exposes no parameters
            </div>
          )}
          <Section
            title="Computed state"
            tooltip="The exact parameter values and initial tokens each run starts with, computed from the scenario with the values above. A swept parameter shows at the start of its range."
            collapsible
            defaultOpen={false}
            onOpenChange={setComputedOpen}
            unmountOnCollapse
          >
            {computed === null || computed.notice === null ? null : (
              <div className={noticeStyle}>{computed.notice}</div>
            )}
            {computed?.ready ? (
              <OverlayScrollArea
                className={computedStatePreviewStyle}
                viewportClassName={css({ padding: "3" })}
              >
                <StackedSections>
                  <div className={groupStyle}>
                    <FormSectionHeader title="Parameters" />
                    {parameters ?? (
                      <div className={emptyMessageStyle}>No parameters</div>
                    )}
                  </div>
                  <div className={groupStyle}>
                    <FormSectionHeader
                      title="Initial state"
                      spaceBefore
                      titleAction={placesVisibilityControl}
                    />
                    {places}
                  </div>
                </StackedSections>
              </OverlayScrollArea>
            ) : null}
          </Section>
        </FormLayoutColumn>
      )}
    />
  );
};
