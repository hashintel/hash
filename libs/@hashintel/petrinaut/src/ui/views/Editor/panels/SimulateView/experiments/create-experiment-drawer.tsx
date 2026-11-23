import { use, useRef, useState } from "react";

import { Button, Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { runClockOf } from "@hashintel/petrinaut-core";

import { useSDCPNState } from "../../../../../../react/document/sdcpn-context";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { PetrinautOptimizationContext } from "../../../../../../react/optimizations/connected-optimizer-context";
import { OverlayScrollArea } from "../../../../../components/overlay-scroll-area";
import { SectionList } from "../../../../../components/section";
import { FocusControls } from "../../../../../worksheet/focus-controls";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { scenarioFormContext } from "../scenarios/use-ad-hoc-scenario-authoring";
import {
  overlayScrollDrawerBodyStyle,
  overlayScrollDrawerViewportStyle,
} from "../shared/overlay-scroll-drawer-styles";
import { SimulationPanel } from "../shared/simulation-panel";
import {
  type ConstraintDraftsState,
  EMPTY_CONSTRAINT_DRAFTS,
} from "./create-experiment-drawer/constraint-drafts";
import { summarizeConstraintLspErrors } from "./create-experiment-drawer/constraint-lsp";
import { ConstraintsSection } from "./create-experiment-drawer/constraints-section";
import { ExperimentSection } from "./create-experiment-drawer/experiment-section";
import {
  EMPTY_EXPERIMENT_SIMULATOR,
  experimentSimulatorError,
} from "./create-experiment-drawer/experiment-simulator-draft";
import { ExperimentSimulatorFields } from "./create-experiment-drawer/experiment-simulator-fields";
import {
  constraintPolicyFor,
  lowerConstraintDrafts,
  stateConstraintGateSpecs,
} from "./create-experiment-drawer/lower-constraint-drafts";
import {
  buildMetricSpecs,
  type ExperimentMetricDraft,
  summarizeMetricDraftLspErrors,
} from "./create-experiment-drawer/metric-drafts";
import { MetricsSection } from "./create-experiment-drawer/metrics-section";
import { ScenarioSection } from "./create-experiment-drawer/scenario-section";
import { resolveScenarioSelection } from "./create-experiment-drawer/scenario-selection";
import { describeSweep } from "./create-experiment-drawer/sweep-summary";
import { useExperimentSimulator } from "./create-experiment-drawer/use-experiment-simulator";
import { useCreateOptimizedExperiment } from "./create-optimized-experiment";
import {
  EMPTY_SWEEP_OBJECTIVE,
  resolveObjectiveMetricId,
  sweepObjectiveError,
  sweepObjectiveFor,
} from "./shared/sweep-objective";
import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "./sweep-optimizer";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type { ExperimentParameterInput } from "../../../../../../react/experiments/parameter-grid";
import type { ScenarioRunInput } from "./create-experiment-drawer/experiment-scenario-inputs";
import type { AdHocScenarioState, Scenario } from "@hashintel/petrinaut-core";

// -- Styles -------------------------------------------------------------------

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  marginRight: "auto",
  whiteSpace: "pre-wrap",
});

// -- Constants ----------------------------------------------------------------

const DEFAULT_EXPERIMENT_NAME = "Experiment";
const DEFAULT_RUN_COUNT = 1000;
// The form has no seed field: every experiment it creates draws from this one.
const experimentSeed = 1;
const DEFAULT_MAX_TIME = 180;
const EMPTY_SCENARIOS: readonly Scenario[] = [];

// -- Drawer -------------------------------------------------------------------

export const CreateExperimentDrawer = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const extensions = useSDCPNState((document) => document.extensions);
  // An untimed net's runs count steps: the form asks for a step to end at,
  // and shows no parameter of how a simulator advances time.
  const clock = runClockOf(petriNetDefinition, extensions);
  const createOptimizedExperiment = useCreateOptimizedExperiment();
  const { diagnosticsByUri, requestConstraint } = use(LanguageClientContext);
  const optimizationSource = use(PetrinautOptimizationContext);
  const scenarios = petriNetDefinition.scenarios ?? EMPTY_SCENARIOS;
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [paramInputs, setParamInputs] = useState<
    Record<string, ExperimentParameterInput>
  >({});
  const [adHocState, setAdHocState] = useState<AdHocScenarioState | null>(null);
  const [runCount, setRunCount] = useState<number | null>(DEFAULT_RUN_COUNT);
  const [simulatorDraft, setSimulatorDraft] = useState(
    EMPTY_EXPERIMENT_SIMULATOR,
  );
  const [maxTime, setMaxTime] = useState<number | null>(DEFAULT_MAX_TIME);
  const [metricDrafts, setMetricDrafts] = useState<ExperimentMetricDraft[]>([]);
  const [constraintDrafts, setConstraintDrafts] =
    useState<ConstraintDraftsState>(EMPTY_CONSTRAINT_DRAFTS);
  const [objectiveDraft, setObjectiveDraft] = useState(EMPTY_SWEEP_OBJECTIVE);
  const [startOptimizerImmediately, setStartOptimizerImmediately] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedScenario = resolveScenarioSelection(
    scenarios,
    selectedScenarioId,
  );

  // The net the ad-hoc form resolves names and types against, shared by the
  // form and by the sweep summary that reads its selections.
  const adHocFormContext = scenarioFormContext(extensions, petriNetDefinition);
  const sweepSummary = describeSweep({
    scenario: selectedScenario,
    paramInputs,
    adHocState,
    context: adHocFormContext,
  });

  const metricDiagnosticError = summarizeMetricDraftLspErrors(
    diagnosticsByUri,
    metricDrafts,
  );
  const metricFormError =
    metricDrafts.length === 0
      ? "Define at least one metric"
      : metricDiagnosticError;

  const adHocSweeping = selectedScenario === undefined;
  const optimizerConnected = optimizationSource !== null;

  // Constraints use a saved scenario's parameter names. Hidden drafts stay in
  // state and are lowered only when their section is enabled.
  const optimizationAvailable = optimizerConnected && sweepSummary !== null;
  const objectiveEnabled = optimizationAvailable && startOptimizerImmediately;
  const constraintsEnabled =
    optimizationAvailable && selectedScenario !== undefined;
  const constraintLspError = constraintsEnabled
    ? summarizeConstraintLspErrors(diagnosticsByUri, constraintDrafts.rows)
    : null;
  const objectiveMetricId = resolveObjectiveMetricId(
    objectiveDraft,
    metricDrafts,
  );
  // `null` while the drafts are incomplete: the GPU metric gate has nothing to
  // judge yet, and Run is disabled for the same reason. A drafted state
  // constraint rides along as the placeholder spec the gate refuses.
  let draftMetricSpecs: ExperimentMetricSpecInput[] | null = null;
  try {
    draftMetricSpecs = [
      ...buildMetricSpecs(metricDrafts, petriNetDefinition),
      ...(constraintsEnabled
        ? stateConstraintGateSpecs(
            constraintDrafts,
            petriNetDefinition.places[0]?.id,
          )
        : []),
    ];
  } catch {
    draftMetricSpecs = null;
  }

  const { resolved: experimentSimulator, refusals: simulatorRefusals } =
    useExperimentSimulator({
      draft: simulatorDraft,
      clock,
      metricSpecs: draftMetricSpecs,
    });

  const objectiveExecution = {
    dt: experimentSimulator.samplePeriod,
    maxTime: maxTime ?? 0,
    runsPerStep: SWEEP_OPTIMIZATION_RUNS_PER_STEP,
  };
  const objectiveError = objectiveEnabled
    ? sweepObjectiveError(objectiveDraft, objectiveMetricId, objectiveExecution)
    : null;

  const formError =
    metricFormError ??
    experimentSimulatorError(experimentSimulator) ??
    objectiveError ??
    constraintLspError ??
    (sweepSummary?.error ? sweepSummary.text : null);
  const footerError = error ?? formError;
  const canRun = !isSubmitting && formError === null;
  const submitLabel = objectiveEnabled
    ? isSubmitting
      ? "Starting"
      : "Optimize"
    : sweepSummary
      ? isSubmitting
        ? "Creating"
        : "Create sweep"
      : isSubmitting
        ? "Starting"
        : "Run";

  const resetForm = () => {
    setName(DEFAULT_EXPERIMENT_NAME);
    setSelectedScenarioId(null);
    setParamInputs({});
    setAdHocState(null);
    setRunCount(DEFAULT_RUN_COUNT);
    setSimulatorDraft(EMPTY_EXPERIMENT_SIMULATOR);
    setMaxTime(DEFAULT_MAX_TIME);
    setMetricDrafts([]);
    setConstraintDrafts(EMPTY_CONSTRAINT_DRAFTS);
    setObjectiveDraft(EMPTY_SWEEP_OBJECTIVE);
    setStartOptimizerImmediately(false);
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  };

  const handleScenarioChange = (value: string) => {
    setSelectedScenarioId(value);
    setParamInputs({});
    // The rows type-checked against the previous scenario's parameters.
    setConstraintDrafts(EMPTY_CONSTRAINT_DRAFTS);
    setError(null);
  };

  const handleParamInputsChange = (updates: ScenarioRunInput[]) => {
    setParamInputs((prev) => {
      const next = { ...prev };
      for (const update of updates) {
        next[update.identifier] = update.input;
      }
      return next;
    });
  };

  // Every change of the drafts is an edit, which clears the last submit's error.
  const handleMetricDraftsChange = (
    update: (drafts: ExperimentMetricDraft[]) => ExperimentMetricDraft[],
  ) => {
    setError(null);
    setMetricDrafts(update);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);

    if (metricDiagnosticError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const metricSpecs = buildMetricSpecs(metricDrafts, petriNetDefinition);
      // Lowered against the net at creation and never re-lowered; a row that
      // does not compile rejects with its label and lands in the footer.
      const constraints = constraintsEnabled
        ? await lowerConstraintDrafts({
            drafts: constraintDrafts,
            requestConstraint,
            context: {
              netParameters: adHocFormContext.netParameters,
              scenarioParameters: selectedScenario.scenarioParameters,
              sdcpn: petriNetDefinition,
              extensions,
            },
          })
        : [];
      // Create, start the study when there is an objective, then select:
      // the results drawer mounts with the study already in place, and a
      // study that cannot start leaves no experiment behind.
      await createOptimizedExperiment(
        {
          name,
          scenarioId: selectedScenario?.id ?? null,
          scenarioParameterValues: paramInputs,
          adHocScenario: adHocSweeping ? adHocState : null,
          adHocSweeps: adHocSweeping,
          runCount: runCount ?? 0,
          seed: experimentSeed,
          dt: experimentSimulator.samplePeriod,
          maxTime: maxTime ?? 0,
          metricSpecs,
          ...(experimentSimulator.selection
            ? { simulator: experimentSimulator.selection }
            : {}),
          constraints,
          constraintPolicy:
            constraints.length > 0
              ? constraintPolicyFor(constraintDrafts.passThresholdPercent)
              : undefined,
        },
        objectiveEnabled
          ? sweepObjectiveFor(
              objectiveDraft,
              objectiveMetricId,
              objectiveExecution,
            )
          : null,
      );
      // A no-op on the unmounted drawer once the selection navigated away.
      resetForm();
    } catch (submitError) {
      setIsSubmitting(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  return (
    <FocusRoot>
      <FocusStack axis="vertical">
        <SimulationPanel
          title="Create an experiment"
          layer="creation"
          closeDisabled={isSubmitting}
          onClose={handleClose}
          initialFocusRef={nameInputRef}
        >
          <FocusControls axis="horizontal">
            <SimulationPanel.Header description="Run a Monte Carlo experiment from the current model and scenario" />
          </FocusControls>
          <SimulationPanel.Body
            withPadding={false}
            scrollable={false}
            className={overlayScrollDrawerBodyStyle}
          >
            <OverlayScrollArea
              viewportClassName={overlayScrollDrawerViewportStyle}
            >
              <SectionList>
                <ExperimentSection
                  name={name}
                  onNameChange={setName}
                  nameInputRef={nameInputRef}
                  runCount={runCount}
                  onRunCountChange={setRunCount}
                  maxTime={maxTime}
                  onMaxTimeChange={setMaxTime}
                  sweeping={sweepSummary !== null}
                  clock={clock}
                >
                  <ExperimentSimulatorFields
                    draft={simulatorDraft}
                    resolved={experimentSimulator}
                    refusals={simulatorRefusals}
                    onChange={setSimulatorDraft}
                  />
                </ExperimentSection>

                <ScenarioSection
                  scenarios={scenarios}
                  scenario={selectedScenario}
                  onScenarioChange={handleScenarioChange}
                  paramInputs={paramInputs}
                  onParamInputsChange={handleParamInputsChange}
                  adHocState={adHocState}
                  onAdHocStateChange={setAdHocState}
                  context={adHocFormContext}
                  sweepSummary={sweepSummary}
                />

                <MetricsSection
                  drafts={metricDrafts}
                  onChange={handleMetricDraftsChange}
                  optimizationAvailable={optimizationAvailable}
                  startOptimizerImmediately={startOptimizerImmediately}
                  onStartOptimizerImmediatelyChange={
                    setStartOptimizerImmediately
                  }
                  objectiveDraft={objectiveDraft}
                  objectiveMetricId={objectiveMetricId}
                  objectiveError={objectiveError}
                  onObjectiveChange={setObjectiveDraft}
                  disabled={isSubmitting}
                />

                {constraintsEnabled ? (
                  <FocusControls>
                    <ConstraintsSection
                      drafts={constraintDrafts}
                      onChange={setConstraintDrafts}
                      scenarioParameters={selectedScenario.scenarioParameters}
                      placeNames={petriNetDefinition.places.map(
                        (place) => place.name,
                      )}
                      disabled={isSubmitting}
                    />
                  </FocusControls>
                ) : null}
              </SectionList>
            </OverlayScrollArea>
          </SimulationPanel.Body>
          <SimulationPanel.Footer
            secondaryActions={
              footerError ? (
                <span className={errorStyle}>{footerError}</span>
              ) : undefined
            }
            actions={
              <FocusControls axis="horizontal">
                <Button
                  variant="subtle"
                  tone="neutral"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  tone="neutral"
                  size="sm"
                  disabled={!canRun}
                  tooltip={formError ?? undefined}
                  prefix={
                    isSubmitting ? (
                      <LoadingSpinner size="sm" variant="bars" />
                    ) : objectiveEnabled ? (
                      <Icon name="sparkles" size="sm" />
                    ) : sweepSummary ? undefined : (
                      <Icon name="play" size="sm" />
                    )
                  }
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {submitLabel}
                </Button>
              </FocusControls>
            }
          />
        </SimulationPanel>
      </FocusStack>
    </FocusRoot>
  );
};
