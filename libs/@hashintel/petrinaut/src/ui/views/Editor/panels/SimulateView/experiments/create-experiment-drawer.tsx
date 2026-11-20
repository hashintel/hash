import { use, useId, useRef, useState } from "react";

import {
  Button,
  Checkbox,
  Icon,
  LoadingSpinner,
  NumberInput,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  EMPTY_AD_HOC_STATE,
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
import { AdHocScenarioForm } from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import {
  OverlayScrollArea,
  overlayScrollDrawerBodyStyle,
  overlayScrollDrawerViewportStyle,
} from "../../../../../components/overlay-scroll-area";
import { Section, SectionList } from "../../../../../components/section";
import { FocusControls } from "../../../../../worksheet/focus-controls";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { summarizeMetricLspErrors } from "../metrics/metric-lsp";
import { createMetricKindGroups } from "../metrics/metric-picker-options";
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
  createDefaultMetricDraft,
  getMetricLabel,
  type ExperimentMetricDraft,
} from "./create-experiment-drawer/metric-drafts";
import {
  MetricObjectiveControl,
  OptimizationBudget,
} from "./create-experiment-drawer/metric-optimization";
import { ExperimentMetricRow } from "./create-experiment-drawer/metric-row";
import { describeSweep } from "./create-experiment-drawer/sweep-summary";
import { useCreateOptimizedExperiment } from "./create-optimized-experiment";
import { getExperimentMetricDiagnosticError } from "./experiment-metric-lsp-validation";
import { ExperimentScenarioRun } from "./experiment-scenario-run";
import {
  EMPTY_SWEEP_OBJECTIVE,
  resolveObjectiveMetricId,
  sweepObjectiveError,
  sweepObjectiveFor,
} from "./shared/sweep-objective";
import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "./sweep-optimizer";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type { ExperimentParameterInput } from "../../../../../../react/experiments/parameter-grid";
import type { AdHocScenarioState, Scenario } from "@hashintel/petrinaut-core";

// -- Styles -------------------------------------------------------------------

const sweepSummaryStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  "&[data-tone='error']": { color: "red.s100" },
});

const metricListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const metricHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const metricCountStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  marginRight: "auto",
  whiteSpace: "pre-wrap",
});

// -- Constants ----------------------------------------------------------------

const DEFAULT_EXPERIMENT_NAME = "Experiment";
const NO_SCENARIO_VALUE = "__none__";
const DEFAULT_RUN_COUNT = "1000";
// The form has no seed field: every experiment it creates draws from this one.
const experimentSeed = 1;
const DEFAULT_MAX_TIME = "180";
const EMPTY_SCENARIOS: readonly Scenario[] = [];

function getDefaultScenarioSelection(scenarios: readonly Scenario[]): string {
  return scenarios[0]?.id ?? NO_SCENARIO_VALUE;
}

function getEffectiveScenarioSelection(
  scenarios: readonly Scenario[],
  selectedScenarioId: string | null,
): string {
  if (
    selectedScenarioId &&
    (selectedScenarioId === NO_SCENARIO_VALUE ||
      scenarios.some((scenario) => scenario.id === selectedScenarioId))
  ) {
    return selectedScenarioId;
  }

  return getDefaultScenarioSelection(scenarios);
}

function createScenarioOptions(scenarios: readonly Scenario[]) {
  return [
    ...scenarios.map((scenario) => ({
      value: scenario.id,
      text: scenario.name,
    })),
    { value: NO_SCENARIO_VALUE, text: "No scenario" },
  ];
}

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
  const objectiveGroupName = useId();
  const [metricLabelFocusId, setMetricLabelFocusId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const addMetricButtonRef = useRef<HTMLButtonElement>(null);
  // Held in state, not in a ref: a handler that reads a ref's map is left
  // uncached by the compiler, and every row with it.
  const [metricTriggers] = useState(() => new Map<string, HTMLButtonElement>());

  const effectiveSelectedScenarioId = getEffectiveScenarioSelection(
    scenarios,
    selectedScenarioId,
  );

  const selectedScenario: Scenario | undefined =
    effectiveSelectedScenarioId === NO_SCENARIO_VALUE
      ? undefined
      : scenarios.find((s) => s.id === effectiveSelectedScenarioId);

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

  const scenarioOptions = createScenarioOptions(scenarios);
  const metricKindGroups = createMetricKindGroups(petriNetDefinition);
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

  // Shown under whichever scenario body is on screen: the form, or a saved
  // scenario shown through it.
  const sweepSummaryLine = sweepSummary ? (
    <span
      className={sweepSummaryStyle}
      data-tone={sweepSummary.error ? "error" : "neutral"}
    >
      {sweepSummary.text}
    </span>
  ) : null;

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
    setMetricLabelFocusId(null);
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

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setParamInputs({});
    // The rows type-checked against the previous scenario's parameters.
    setConstraintDrafts(EMPTY_CONSTRAINT_DRAFTS);
    setError(null);
  };

  const handleAddMetric = () => {
    const nextMetric = createDefaultMetricDraft(petriNetDefinition);

    setError(null);
    setMetricLabelFocusId(nextMetric.id);
    setMetricDrafts((prev) => [
      ...prev.map((metric) => ({ ...metric, expanded: false })),
      nextMetric,
    ]);
  };

  const handleMetricChange = (
    metricId: string,
    patch: Partial<ExperimentMetricDraft>,
  ) => {
    setError(null);
    setMetricDrafts((prev) =>
      prev.map((metric) =>
        metric.id === metricId ? { ...metric, ...patch } : metric,
      ),
    );
  };

  const handleMetricRemove = (metricId: string) => {
    const index = metricDrafts.findIndex((metric) => metric.id === metricId);
    const nextMetric = metricDrafts[index + 1] ?? metricDrafts[index - 1];
    setError(null);
    setMetricDrafts((prev) => prev.filter((metric) => metric.id !== metricId));
    if (nextMetric) {
      metricTriggers.get(nextMetric.id)?.focus();
    } else {
      addMetricButtonRef.current?.focus();
    }
  };

  const registerMetricTrigger = (
    metricId: string,
    element: HTMLButtonElement | null,
  ) => {
    if (element) {
      metricTriggers.set(metricId, element);
    } else {
      metricTriggers.delete(metricId);
    }
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

                <Section title="Scenario" collapsible defaultOpen>
                  <FocusControls>
                    <div className={fieldStyle}>
                      <Select
                        required
                        aria-label="Scenario"
                        value={effectiveSelectedScenarioId}
                        onChange={handleScenarioChange}
                        items={scenarioOptions}
                        size="sm"
                        renderItem={(value) => {
                          const option = scenarioOptions.find(
                            (opt) => opt.value === value,
                          );
                          return (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {value === NO_SCENARIO_VALUE && (
                                <Icon
                                  name="dash"
                                  size="xs"
                                  className={css({ opacity: "[0.4]" })}
                                />
                              )}
                              {option?.text}
                            </span>
                          );
                        }}
                      />
                    </div>
                  </FocusControls>

                  {selectedScenario ? (
                    // The selected scenario shows through the form in run mode:
                    // scenario parameters editable in worksheet style, and a
                    // collapsed "Computed state" preview of the exact values and
                    // tokens each run starts with.
                    <>
                      <ExperimentScenarioRun
                        scenario={selectedScenario}
                        context={adHocFormContext}
                        inputs={paramInputs}
                        selection="sweep"
                        onInputsChange={(updates) =>
                          setParamInputs((prev) => {
                            const next = { ...prev };
                            for (const update of updates) {
                              next[update.identifier] = update.input;
                            }
                            return next;
                          })
                        }
                      />
                      {sweepSummaryLine}
                    </>
                  ) : (
                    // With no scenario, the experiment's Initial State + Parameters
                    // are defined inline and compile through a scenario generated
                    // at experiment start, never persisted. Left untouched, the
                    // experiment runs from the model's own initial marking.
                    <>
                      <AdHocScenarioForm
                        state={adHocState ?? EMPTY_AD_HOC_STATE}
                        onChange={setAdHocState}
                        context={adHocFormContext}
                        selection="sweep"
                      />
                      {sweepSummaryLine}
                    </>
                  )}
                </Section>

                <Section
                  title={objectiveEnabled ? "Metrics & objective" : "Metrics"}
                  collapsible
                  defaultOpen
                >
                  <FocusControls>
                    <div className={metricListStyle}>
                      {optimizationAvailable ? (
                        <Checkbox
                          size="sm"
                          label="Start optimizer immediately"
                          value={startOptimizerImmediately}
                          onChange={setStartOptimizerImmediately}
                          disabled={isSubmitting}
                        />
                      ) : null}
                      <div className={metricHeaderStyle}>
                        <span className={metricCountStyle}>
                          {metricDrafts.length === 0
                            ? objectiveEnabled
                              ? "Add a metric to optimize"
                              : "No experiment metrics"
                            : `${metricDrafts.length} experiment metric${
                                metricDrafts.length === 1 ? "" : "s"
                              }`}
                        </span>
                        <Button
                          variant="subtle"
                          tone="neutral"
                          size="sm"
                          prefix={<Icon name="plus" size="sm" />}
                          onClick={handleAddMetric}
                          ref={addMetricButtonRef}
                        >
                          Add metric
                        </Button>
                      </div>

                      {metricDrafts.map((metric) => (
                        <ExperimentMetricRow
                          key={metric.id}
                          metric={metric}
                          sdcpn={petriNetDefinition}
                          kindGroups={metricKindGroups}
                          autoFocusLabel={metric.id === metricLabelFocusId}
                          isObjective={
                            objectiveEnabled && metric.id === objectiveMetricId
                          }
                          onChange={handleMetricChange}
                          onRemove={handleMetricRemove}
                          registerTrigger={registerMetricTrigger}
                          footer={
                            objectiveEnabled ? (
                              <MetricObjectiveControl
                                metricId={metric.id}
                                metricLabel={getMetricLabel(
                                  metric,
                                  petriNetDefinition,
                                )}
                                groupName={objectiveGroupName}
                                direction={
                                  metric.id === objectiveMetricId
                                    ? objectiveDraft.direction
                                    : null
                                }
                                disabled={isSubmitting}
                                onSelect={() =>
                                  setObjectiveDraft((draft) => ({
                                    ...draft,
                                    metricId: metric.id,
                                  }))
                                }
                                onDirectionChange={(direction) =>
                                  setObjectiveDraft((draft) => ({
                                    ...draft,
                                    direction,
                                  }))
                                }
                              />
                            ) : undefined
                          }
                        />
                      ))}

                      {objectiveEnabled && metricDrafts.length > 0 ? (
                        <OptimizationBudget
                          steps={objectiveDraft.steps}
                          error={objectiveError}
                          onChange={(steps) =>
                            setObjectiveDraft((draft) => ({ ...draft, steps }))
                          }
                          disabled={isSubmitting}
                        />
                      ) : null}
                    </div>
                  </FocusControls>
                </Section>

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
