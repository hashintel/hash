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

// The computed state is a preview, not part of the form: a net with many
// places (or a coloured place with many token rows) would otherwise push
// Metrics and the drawer's own footer out of view. Parameters and initial
// state share one bounded region and scroll together, tinted so the preview
// reads as a panel the form writes into rather than more form. The left
// padding covers the 20px the place headers hang their chevron into, plus a
// gutter, so the hang is not clipped by the region's own overflow.
const computedStatePreviewStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  maxHeight: "[320px]",
  overflowY: "auto",
  backgroundColor: "neutral.s20",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  paddingY: "2",
  paddingRight: "2",
  paddingLeft: "[28px]",
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
  // `seededFrom` is the persisted scenario object the variables came from:
  // saving an edit to it replaces the object, so the drawer reseeds to the
  // new definition. `seed` keys the form so a reseed (or scenario switch)
  // remounts it, discarding an undo history from another definition.
  const [run, setRun] = useState<{
    scenarioId: string;
    seededFrom: Scenario;
    seed: number;
    variables: AdHocVariable[];
  } | null>(null);
  if (run?.scenarioId !== scenario.id || run.seededFrom !== scenario) {
    setRun({
      scenarioId: scenario.id,
      seededFrom: scenario,
      seed: (run?.seed ?? 0) + 1,
      variables: classicRunVariables(scenario, values),
    });
  }

  const onFormChange = (next: AdHocScenarioState) => {
    setRun((current) => current && { ...current, variables: next.variables });
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
      key={`${run?.scenarioId}:${run?.seed}`}
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
              <div className={computedStatePreviewStyle}>
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
              </div>
            ) : null}
          </Section>
        </FormLayoutColumn>
      )}
    />
  );
};
