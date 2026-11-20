import { use, useRef, useState } from "react";

import {
  Button,
  Icon,
  LoadingSpinner,
  NumberInput,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  runClockOf,
  WEBGPU_FIXED_STEP_SIMULATOR_ID,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import {
  findSimulator,
  SimulatorsContext,
} from "../../../../../../react/simulators/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useExecutableDefinition } from "../../../../../../react/state/use-executable-definition";
import {
  OverlayScrollArea,
  overlayScrollDrawerBodyStyle,
  overlayScrollDrawerViewportStyle,
} from "../../../../../components/overlay-scroll-area";
import { Section, SectionList } from "../../../../../components/section";
import { FocusControls } from "../../../../../worksheet/focus-controls";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { summarizeMetricLspErrors } from "../metrics/metric-lsp";
import { SimulationPanel } from "../shared/simulation-panel";
import { useGpuAvailability } from "../shared/use-gpu-availability";
import {
  type ConstraintDraftsState,
  EMPTY_CONSTRAINT_DRAFTS,
} from "./create-experiment-drawer/constraint-drafts";
import { summarizeConstraintLspErrors } from "./create-experiment-drawer/constraint-lsp";
import { ConstraintsSection } from "./create-experiment-drawer/constraints-section";
import {
  EMPTY_EXPERIMENT_SIMULATOR,
  resolveExperimentSimulator,
  experimentSimulatorError,
  simulatorRefusalsFor,
} from "./create-experiment-drawer/experiment-simulator-draft";
import { ExperimentSimulatorFields } from "./create-experiment-drawer/experiment-simulator-fields";
import {
  fieldStyle,
  gridStyle,
  labelStyle,
} from "./create-experiment-drawer/form-field-styles";
import {
  constraintPolicyFor,
  lowerConstraintDrafts,
  stateConstraintGateSpecs,
} from "./create-experiment-drawer/lower-constraint-drafts";
import {
  buildMetricSpecs,
  type ExperimentMetricDraft,
} from "./create-experiment-drawer/metric-drafts";
import { MetricsSection } from "./create-experiment-drawer/metrics-section";
import { ScenarioSection } from "./create-experiment-drawer/scenario-section";
import { resolveScenarioSelection } from "./create-experiment-drawer/scenario-selection";
import { describeSweep } from "./create-experiment-drawer/sweep-summary";
import { useCreateOptimizedExperiment } from "./create-optimized-experiment";
import { getExperimentMetricDiagnosticError } from "./experiment-metric-lsp-validation";
import {
  EMPTY_SWEEP_OBJECTIVE,
  resolveObjectiveMetricId,
  sweepObjectiveError,
  sweepObjectiveFor,
} from "./shared/sweep-objective";
import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "./sweep-optimizer";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type { ExperimentParameterInput } from "../../../../../../react/experiments/parameter-grid";
import type { ScenarioRunInput } from "./experiment-scenario-inputs";
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
const DEFAULT_RUN_COUNT = "1000";
// The form has no seed field: every experiment it creates draws from this one.
const experimentSeed = 1;
const DEFAULT_MAX_TIME = "180";
const EMPTY_SCENARIOS: readonly Scenario[] = [];

// -- Drawer -------------------------------------------------------------------

export const CreateExperimentDrawer = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  const executableDefinition = useExecutableDefinition();
  // An untimed net's runs count steps: the form asks for a step to end at,
  // and shows no parameter of how a simulator advances time.
  const clock = runClockOf(petriNetDefinition, extensions);
  const inSteps = clock === "steps";
  const createOptimizedExperiment = useCreateOptimizedExperiment();
  const { diagnosticsByUri, requestConstraint } = use(LanguageClientContext);
  const optimizationSource = use(PetrinautOptimizationContext);
  const simulators = use(SimulatorsContext);
  const scenarios = petriNetDefinition.scenarios ?? EMPTY_SCENARIOS;
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [paramInputs, setParamInputs] = useState<
    Record<string, ExperimentParameterInput>
  >({});
  const [adHocState, setAdHocState] = useState<AdHocScenarioState | null>(null);
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  const [simulatorDraft, setSimulatorDraft] = useState(
    EMPTY_EXPERIMENT_SIMULATOR,
  );
  const [maxTime, setMaxTime] = useState(DEFAULT_MAX_TIME);
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
  const adHocFormContext = {
    netParameters: extensions.parameters ? petriNetDefinition.parameters : [],
    places: petriNetDefinition.places,
    types: extensions.colors ? petriNetDefinition.types : [],
  };
  const sweepSummary = describeSweep({
    scenario: selectedScenario,
    paramInputs,
    adHocState,
    context: adHocFormContext,
  });

  // Each custom-code metric's errors, as the language client reports them now.
  const metricDiagnosticError = getExperimentMetricDiagnosticError(
    metricDrafts.map((draft) => ({
      kind: draft.kind,
      label: draft.label,
      lspDiagnostics: summarizeMetricLspErrors(
        diagnosticsByUri,
        draft.metricSessionId,
      ),
    })),
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

  const webGpuSimulator = findSimulator(
    simulators.registrations,
    WEBGPU_FIXED_STEP_SIMULATOR_ID,
  );
  const gpu = useGpuAvailability({
    enabled: webGpuSimulator?.isAvailable() === true,
    sdcpn: executableDefinition,
    extensions,
    metricSpecs: draftMetricSpecs,
  });
  const simulatorRefusals = simulatorRefusalsFor(simulators.registrations, gpu);
  // Derived rather than stored, so a net edited into ineligibility after a
  // simulator was picked neither shows it as chosen nor submits it. The
  // picker's own value and the submitted simulator read the same result, so
  // they cannot disagree.
  const experimentSimulator = resolveExperimentSimulator(
    simulatorDraft,
    simulators,
    simulatorRefusals,
    clock,
  );

  const objectiveExecution = {
    dt: experimentSimulator.samplePeriod,
    maxTime: Number(maxTime),
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
          runCount: Number(runCount),
          seed: experimentSeed,
          dt: experimentSimulator.samplePeriod,
          maxTime: Number(maxTime),
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
                <Section title="Experiment" collapsible defaultOpen>
                  <FocusControls>
                    <div className={fieldStyle}>
                      <label className={labelStyle} htmlFor="experiment-name">
                        Name
                      </label>
                      <TextInput
                        htmlForId="experiment-name"
                        inputRef={nameInputRef}
                        aria-label="Experiment name"
                        size="sm"
                        value={name}
                        onChange={setName}
                      />
                    </div>
                  </FocusControls>
                  <FocusControls axis="horizontal">
                    <div className={gridStyle}>
                      <div className={fieldStyle}>
                        {/* A sweep refines each selection progressively (8, 25, 100,
                    ... 1000, 5000, ...) up to this budget, so for sweeps this
                    is a ceiling, not a batch size — 100,000 is a reasonable
                    value on the GPU. */}
                        <label className={labelStyle} htmlFor="experiment-runs">
                          {sweepSummary ? "Max runs per selection" : "Runs"}
                        </label>
                        <NumberInput
                          htmlForId="experiment-runs"
                          size="sm"
                          min={1}
                          value={runCount === "" ? null : Number(runCount)}
                          onChange={(nextRunCount) =>
                            setRunCount(
                              nextRunCount === null ? "" : String(nextRunCount),
                            )
                          }
                        />
                      </div>
                      <div className={fieldStyle}>
                        <label
                          className={labelStyle}
                          htmlFor="experiment-max-time"
                          title={
                            inSteps
                              ? "This net is untimed: its runs are fired step by step, and every step is sampled."
                              : undefined
                          }
                        >
                          {inSteps ? "End at step" : "Max time (s)"}
                        </label>
                        <NumberInput
                          htmlForId="experiment-max-time"
                          aria-label={
                            inSteps
                              ? "Step the runs end at"
                              : "Max time (seconds)"
                          }
                          size="sm"
                          min={inSteps ? 1 : 0}
                          step={inSteps ? 1 : "any"}
                          value={maxTime === "" ? null : Number(maxTime)}
                          onChange={(nextMaxTime) =>
                            setMaxTime(
                              nextMaxTime === null ? "" : String(nextMaxTime),
                            )
                          }
                        />
                      </div>
                      {/* Cells of the same grid as Runs and Max time: what
                  computes the runs is a property of the experiment like
                  the rest. */}
                      <ExperimentSimulatorFields
                        draft={simulatorDraft}
                        resolved={experimentSimulator}
                        refusals={simulatorRefusals}
                        onChange={setSimulatorDraft}
                      />
                    </div>
                  </FocusControls>
                </Section>

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
