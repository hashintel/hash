/**
 * The experiment drawer's scenario body when a saved scenario is selected
 * (behind the ad-hoc scenarios setting): the scenario shows through the
 * ad-hoc form in run mode — its scenario parameters editable in worksheet
 * style — above a collapsed "Computed state" sub-section that materializes
 * the exact parameter values and initial tokens each run will start with.
 * The materialization (lowering, compiling, converting the marking to
 * literal rows) only happens while that sub-section is open, and recomputes
 * as the values above change.
 */

import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  classicRunParameterValues,
  classicRunVariables,
  classicScenarioRunState,
  compileScenario,
  createUserKeyedRecord,
} from "@hashintel/petrinaut-core";

import { useScenarioHir } from "../../../../../../react/simulation/use-scenario-hir";
import {
  AdHocScenarioForm,
  FormLayoutColumn,
} from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { Section } from "../../../../../components/section";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocVariable,
  Scenario,
} from "@hashintel/petrinaut-core";

const emptyMessageStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const groupTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s80",
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
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

export interface ExperimentScenarioRunProps {
  scenario: Scenario;
  /** The net the scenario compiles and renders against. */
  context: AdHocSynthesisContext;
  /** The experiment's scenario parameter values, keyed by identifier. */
  values: Readonly<Record<string, string>>;
  onValuesChange: (updates: { identifier: string; value: string }[]) => void;
}

export const ExperimentScenarioRun: React.FC<ExperimentScenarioRunProps> = ({
  scenario,
  context,
  values,
  onValuesChange,
}) => {
  const hirState = useScenarioHir(scenario, context);
  const [computedOpen, setComputedOpen] = useState(false);
  const [run, setRun] = useState<{
    scenarioId: string;
    variables: AdHocVariable[];
  } | null>(null);
  if (run?.scenarioId !== scenario.id) {
    setRun({
      scenarioId: scenario.id,
      variables: classicRunVariables(scenario, values),
    });
  }

  const onFormChange = (next: AdHocScenarioState) => {
    setRun({ scenarioId: scenario.id, variables: next.variables });
    const updates = classicRunParameterValues(next, scenario);
    if (updates.length > 0) {
      onValuesChange(updates);
    }
  };

  // The materialized preview, computed only while its sub-section is open.
  // "Computed parameters" are the RESOLVED values compilation produces
  // (defaults, overrides, and ad-hoc entries applied), not the raw override
  // expressions — every net parameter shows the concrete value the runs use.
  const computed = (() => {
    if (!computedOpen) {
      return null;
    }
    if (hirState.error !== null) {
      return {
        ready: false as const,
        notice: `The state preview could not be compiled: ${hirState.error}`,
      };
    }
    if (hirState.hir === null) {
      return { ready: false as const, notice: "Computing the state preview…" };
    }
    const numericValues = createUserKeyedRecord<number>();
    for (const [identifier, value] of Object.entries(values)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numericValues[identifier] = parsed;
      }
    }
    const outcome = compileScenario(
      scenario,
      hirState.hir,
      context.netParameters,
      context.places,
      context.types,
      { scenarioParameterValues: numericValues },
    );
    if (!outcome.ok) {
      return {
        ready: false as const,
        notice: `The state preview could not be computed: ${outcome.errors
          .map((error) => error.message)
          .join(" · ")}`,
      };
    }
    const materialized = classicScenarioRunState(
      scenario,
      outcome.result.initialState,
      { places: context.places, types: context.types },
      values,
    );
    return {
      ready: true as const,
      notice:
        materialized.truncated.length > 0
          ? `Preview truncated: ${materialized.truncated
              .map(
                (cut) =>
                  `${cut.placeName} shows ${cut.shown} of ${cut.total} rows`,
              )
              .join(" · ")}`
          : null,
      places: materialized.state.places,
      netParameters: context.netParameters.flatMap((parameter) => {
        const resolved = outcome.result.parameterValues[parameter.variableName];
        return resolved === undefined
          ? []
          : [
              {
                parameterId: parameter.id,
                expression: resolved,
                optimize: null,
              },
            ];
      }),
    };
  })();

  const renderState: AdHocScenarioState = {
    variables: run?.variables ?? [],
    netParameters: computed?.ready ? computed.netParameters : [],
    places: computed?.ready ? computed.places : {},
  };

  return (
    <AdHocScenarioForm
      state={renderState}
      onChange={onFormChange}
      context={context}
      selection="none"
      mode="run"
      renderLayout={({ variables, parameters, places }) => (
        <FormLayoutColumn>
          {variables ?? (
            <div className={emptyMessageStyle}>
              This scenario exposes no parameters
            </div>
          )}
          <Section
            title="Computed state"
            tooltip="The exact parameter values and initial tokens each run starts with, computed from the scenario with the values above."
            collapsible
            defaultOpen={false}
            onOpenChange={setComputedOpen}
            unmountOnCollapse
          >
            {computed === null || computed.notice === null ? null : (
              <div className={noticeStyle}>{computed.notice}</div>
            )}
            {computed?.ready ? (
              <>
                <div className={groupStyle}>
                  <div className={groupTitleStyle}>Parameters</div>
                  {parameters ?? (
                    <div className={emptyMessageStyle}>No parameters</div>
                  )}
                </div>
                <div className={groupStyle}>
                  <div className={groupTitleStyle}>Initial state</div>
                  {places}
                </div>
              </>
            ) : null}
          </Section>
        </FormLayoutColumn>
      )}
    />
  );
};
