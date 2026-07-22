import { useStore } from "@tanstack/react-form";
import { use, useState } from "react";

import {
  Button,
  Drawer,
  Icon,
  LoadingSpinner,
  NumberInput,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  PETRINAUT_DEFAULT_SEED,
  PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL,
  PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS,
  PETRINAUT_OPTIMIZATION_MAX_TRIALS,
  metricSchema,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Section, SectionList } from "../../../../../components/section";
import { SegmentGroup } from "../../../../../components/segment-group";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../../monaco/editor-paths";
import {
  type MetricFormInstance,
  useMetricForm,
  useMetricLspSession,
} from "../metrics/metric-form";
import { validateMetricCompiles } from "../metrics/metric-lsp";
import { buildMetricFromFormState } from "../metrics/metric-mapping";
import {
  createMetricKindGroups,
  CUSTOM_METRIC_VALUE,
  getMetricKindIcon,
  MODEL_METRIC_VALUE_PREFIX,
} from "../metrics/metric-picker-options";
import {
  createOptimizationParameterDraft,
  type OptimizationParameterDraft,
  OptimizationParameterRow,
} from "./optimization-parameter-row";

import type {
  Metric,
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
  Scenario,
  ScenarioParameter,
  SDCPN,
} from "@hashintel/petrinaut-core";

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
  minWidth: "0",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  lineHeight: "[1.4]",
});

const emptyStyle = css({
  paddingY: "4",
  fontSize: "sm",
  color: "neutral.s80",
});

const scenarioMenuLabelStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  minWidth: "0",
  "& > :first-child": {
    flexShrink: "0",
    whiteSpace: "nowrap",
  },
});

const scenarioSelectedLabelStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1 1 0]",
  alignItems: "stretch",
  width: "full",
  maxWidth: "full",
  minWidth: "0",
  overflow: "hidden",
  paddingY: "0.5",
  paddingRight: "1",
  lineHeight: "[1.25]",
  "& > :first-child": {
    maxWidth: "full",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const scenarioSelectStyle = css({
  width: "full",
  maxWidth: "full",
  minWidth: "0",
  "& > div": {
    width: "full",
    maxWidth: "full",
    minWidth: "0",
  },
  "& [data-part='trigger']": {
    width: "full",
    maxWidth: "full",
    minWidth: "0",
  },
});

const scenarioDescriptionStyle = css({
  maxWidth: "full",
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s80",
  fontSize: "xs",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3",
});

const optimizationGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "3",
});

const fullWidthGridItemStyle = css({
  gridColumn: "[1 / -1]",
});

const segmentControlStyle = css({
  "& [data-part='item']": {
    height: "6",
  },
});

const parameterListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  marginRight: "auto",
  whiteSpace: "pre-wrap",
});

type Direction = "maximize" | "minimize";
type MetricSource = "saved" | "custom";
type ParameterDrafts = Record<string, OptimizationParameterDraft>;

const directionOptions = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

const OPTIMIZATION_SAMPLER = "tpe" as const;
const DEFAULT_DT = 0.1;
const CUSTOM_OBJECTIVE_METRIC_NAME = "Custom objective";
const CUSTOM_OBJECTIVE_METRIC_FORM_STATE = {
  name: CUSTOM_OBJECTIVE_METRIC_NAME,
  description: "",
  code: "",
};

const ScenarioSelectLabel = ({
  scenario,
  selected = false,
}: {
  scenario: Scenario;
  selected?: boolean;
}) => {
  const description = scenario.description?.trim();

  return (
    <span
      className={selected ? scenarioSelectedLabelStyle : scenarioMenuLabelStyle}
    >
      <span>{scenario.name}</span>
      {description ? (
        <span className={scenarioDescriptionStyle}>{description}</span>
      ) : null}
    </span>
  );
};

const InlineObjectiveMetricForm = ({ form }: { form: MetricFormInstance }) => {
  const values = useStore(form.store, (state) => state.values);
  const metricSessionId = useMetricLspSession(values.code);

  return (
    <CodeEditor
      language="typescript"
      path={getMetricDocumentUri(metricSessionId)}
      value={values.code}
      onChange={(code) => form.setFieldValue("code", code ?? "")}
      height="240px"
    />
  );
};

function createParameterDrafts(scenario: Scenario): ParameterDrafts {
  return Object.fromEntries(
    scenario.scenarioParameters.map((parameter) => [
      parameter.identifier,
      createOptimizationParameterDraft(parameter),
    ]),
  );
}

export function validateOptimizationParameterDraft(
  parameter: ScenarioParameter,
  draft: OptimizationParameterDraft | undefined,
): string | null {
  if (!draft) {
    return `${parameter.identifier} is not configured`;
  }

  if (draft.fixedValue === null) {
    return `${parameter.identifier} needs a value`;
  }
  if (parameter.type === "boolean" && typeof draft.fixedValue !== "boolean") {
    return `${parameter.identifier} needs a boolean value`;
  }
  if (
    parameter.type !== "boolean" &&
    (typeof draft.fixedValue !== "number" || !Number.isFinite(draft.fixedValue))
  ) {
    return `${parameter.identifier} needs a finite number`;
  }
  if (
    parameter.type === "integer" &&
    (typeof draft.fixedValue !== "number" ||
      !Number.isInteger(draft.fixedValue))
  ) {
    return `${parameter.identifier} needs an integer value`;
  }
  if (
    parameter.type === "ratio" &&
    (typeof draft.fixedValue !== "number" ||
      draft.fixedValue < 0 ||
      draft.fixedValue > 1)
  ) {
    return `${parameter.identifier} must be between 0 and 1`;
  }

  if (draft.mode === "fixed" || parameter.type === "boolean") {
    return null;
  }

  if (draft.minimum === null || draft.maximum === null) {
    return `${parameter.identifier} needs minimum and maximum values`;
  }
  if (!Number.isFinite(draft.minimum) || !Number.isFinite(draft.maximum)) {
    return `${parameter.identifier} needs finite bounds`;
  }
  if (draft.minimum >= draft.maximum) {
    return `${parameter.identifier} maximum must be greater than its minimum`;
  }
  if (parameter.type === "ratio" && (draft.minimum < 0 || draft.maximum > 1)) {
    return `${parameter.identifier} range must stay between 0 and 1`;
  }
  if (draft.scale === "log" && draft.minimum <= 0) {
    return `${parameter.identifier} logarithmic range needs a positive minimum`;
  }
  if (parameter.type === "integer") {
    if (
      !Number.isInteger(draft.minimum) ||
      !Number.isInteger(draft.maximum) ||
      draft.step === null ||
      !Number.isInteger(draft.step) ||
      draft.step <= 0
    ) {
      return `${parameter.identifier} needs integer bounds and a positive integer step`;
    }
    if ((draft.maximum - draft.minimum) % draft.step !== 0) {
      return `${parameter.identifier} step must divide its range exactly so the maximum is reachable`;
    }
    if (draft.scale === "log" && draft.step !== 1) {
      return `${parameter.identifier} logarithmic integer ranges require a step of 1`;
    }
  }

  return null;
}

function getConfigurationError({
  name,
  scenario,
  drafts,
  objectiveMetricReady,
  missingObjectiveMessage,
  direction,
  optimizationSteps,
  dt,
  maxTime,
}: {
  name: string;
  scenario: Scenario;
  drafts: ParameterDrafts;
  objectiveMetricReady: boolean;
  missingObjectiveMessage: string;
  direction: Direction | null;
  optimizationSteps: number | null;
  dt: number | null;
  maxTime: number | null;
}): string | null {
  if (name.trim() === "") {
    return "Optimization name is required";
  }
  if (scenario.scenarioParameters.length === 0) {
    return "The selected scenario has no parameters to optimize";
  }
  if (
    !scenario.scenarioParameters.some(
      (parameter) => drafts[parameter.identifier]?.mode === "optimize",
    )
  ) {
    return "Choose at least one scenario parameter to optimize";
  }
  for (const parameter of scenario.scenarioParameters) {
    const error = validateOptimizationParameterDraft(
      parameter,
      drafts[parameter.identifier],
    );
    if (error) {
      return error;
    }
  }
  if (!objectiveMetricReady) {
    return missingObjectiveMessage;
  }
  if (!direction) {
    return "Choose whether to maximize or minimize the objective";
  }
  if (
    optimizationSteps === null ||
    !Number.isInteger(optimizationSteps) ||
    optimizationSteps < 1 ||
    optimizationSteps > PETRINAUT_OPTIMIZATION_MAX_TRIALS
  ) {
    return `Optimization steps must be an integer between 1 and ${PETRINAUT_OPTIMIZATION_MAX_TRIALS.toLocaleString()}`;
  }
  if (dt === null || !Number.isFinite(dt) || dt <= 0) {
    return "Time step must be a positive number";
  }
  if (maxTime === null || !Number.isFinite(maxTime) || maxTime <= 0) {
    return "Max time must be a positive number";
  }
  const simulationStepsPerOptimization = Math.ceil(maxTime / dt);
  if (
    !Number.isSafeInteger(simulationStepsPerOptimization) ||
    simulationStepsPerOptimization > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL
  ) {
    return `Use at most ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()} simulation steps per optimization step`;
  }
  if (
    simulationStepsPerOptimization * optimizationSteps >
    PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS
  ) {
    return `Use at most ${PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS.toLocaleString()} simulation steps across the optimization`;
  }
  return null;
}

/** Build the exact immutable snapshot sent to the host optimizer capability. */
export function buildPetrinautOptimizationInput({
  name,
  title,
  definition,
  scenario,
  drafts,
  metric,
  direction,
  optimizationSteps,
  dt,
  maxTime,
}: {
  name: string;
  title: string;
  definition: SDCPN;
  scenario: Scenario;
  drafts: ParameterDrafts;
  metric: Metric;
  direction: Direction;
  optimizationSteps: number;
  dt: number;
  maxTime: number;
}): PetrinautOptimizationInput {
  const parameterBindings: Record<
    string,
    PetrinautOptimizationParameterBinding
  > = {};
  for (const parameter of scenario.scenarioParameters) {
    const draft = drafts[parameter.identifier]!;
    if (draft.mode === "fixed") {
      parameterBindings[parameter.identifier] = {
        kind: "fixed",
        value: draft.fixedValue!,
      };
      continue;
    }
    if (parameter.type === "boolean") {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: { kind: "boolean" },
      };
    } else if (parameter.type === "integer") {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "integer",
          minimum: draft.minimum!,
          maximum: draft.maximum!,
          step: draft.step!,
          scale: draft.scale,
        },
      };
    } else {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: draft.minimum!,
          maximum: draft.maximum!,
          scale: draft.scale,
        },
      };
    }
  }

  return petrinautOptimizationInputSchema.parse({
    kind: "petrinaut-optimization",
    version: 1,
    name,
    model: {
      title,
      definition: {
        ...definition,
        scenarios: [scenario],
        metrics: [metric],
      },
    },
    scenario: { id: scenario.id, parameterBindings },
    objective: { metricId: metric.id, direction },
    execution: { seed: PETRINAUT_DEFAULT_SEED, dt, maxTime },
    study: { trials: optimizationSteps, sampler: OPTIMIZATION_SAMPLER },
  });
}

export const CreateOptimizationDrawer = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (optimizationId: string) => void;
}) => {
  const { extensions, petriNetDefinition, title } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { createOptimization } = use(OptimizationsContext);
  const scenarios = petriNetDefinition.scenarios ?? [];
  const metrics = petriNetDefinition.metrics ?? [];
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("Optimization");
  const [drafts, setDrafts] = useState<ParameterDrafts>({});
  const [metricSource, setMetricSource] = useState<MetricSource>("saved");
  const [savedMetricId, setSavedMetricId] = useState<string | null>(null);
  const [customMetricId, setCustomMetricId] = useState(() =>
    crypto.randomUUID(),
  );
  const [direction, setDirection] = useState<Direction | null>(null);
  const [optimizationSteps, setOptimizationSteps] = useState<number | null>(
    100,
  );
  const [dt, setDt] = useState<number | null>(DEFAULT_DT);
  const [maxTime, setMaxTime] = useState<number | null>(180);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedScenario = scenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const selectedSavedMetric = metrics.find(
    (metric) => metric.id === savedMetricId,
  );
  const scenarioOptions = scenarios.map((scenario) => ({
    value: scenario.id,
    text: scenario.name,
  }));
  const metricKindGroups = createMetricKindGroups(petriNetDefinition, {
    includeBuiltIn: false,
  });
  const metricPickerValue =
    metricSource === "custom"
      ? CUSTOM_METRIC_VALUE
      : savedMetricId
        ? `${MODEL_METRIC_VALUE_PREFIX}${savedMetricId}`
        : "";
  const renderMetricOption = (value: string) => {
    const icon = getMetricKindIcon(value);
    const text =
      metricKindGroups
        .flatMap(({ items }) => items)
        .find((item) => item.value === value)?.text ?? value;

    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon ? <Icon name={icon} size="xs" /> : null}
        {text}
      </span>
    );
  };
  const renderScenarioLabel = (scenarioId: string, selected = false) => {
    const scenario = scenarios.find(({ id }) => id === scenarioId);
    return scenario ? (
      <ScenarioSelectLabel scenario={scenario} selected={selected} />
    ) : (
      scenarioId
    );
  };

  const resetConfigurationState = (scenario?: Scenario) => {
    setName("Optimization");
    setDrafts(scenario ? createParameterDrafts(scenario) : {});
    setMetricSource("saved");
    setSavedMetricId(null);
    setCustomMetricId(crypto.randomUUID());
    setDirection(null);
    setOptimizationSteps(100);
    setDt(DEFAULT_DT);
    setMaxTime(180);
    setError(null);
    setIsSubmitting(false);
  };

  const resetState = () => {
    setSelectedScenarioId(null);
    resetConfigurationState();
  };

  const submitOptimization = async (
    metric: Metric,
    resetMetricForm: () => void,
    metricAlreadyValidated = false,
  ) => {
    const validationError = selectedScenario
      ? getConfigurationError({
          name,
          scenario: selectedScenario,
          drafts,
          objectiveMetricReady: true,
          missingObjectiveMessage: "Select an objective metric",
          direction,
          optimizationSteps,
          dt,
          maxTime,
        })
      : "Select a scenario";
    if (
      isSubmitting ||
      !selectedScenario ||
      validationError ||
      direction === null ||
      optimizationSteps === null ||
      dt === null ||
      maxTime === null
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (!metricAlreadyValidated) {
        const metricError = await validateMetricCompiles({
          requestHirArtifacts,
          sdcpn: {
            ...petriNetDefinition,
            scenarios: [selectedScenario],
          },
          extensions,
          metric,
        });
        if (metricError) {
          setIsSubmitting(false);
          setError(metricError);
          return;
        }
      }

      const input = buildPetrinautOptimizationInput({
        name,
        title,
        definition: petriNetDefinition,
        scenario: selectedScenario,
        drafts,
        metric,
        direction,
        optimizationSteps,
        dt,
        maxTime,
      });
      const optimizationId = await createOptimization(input);
      resetState();
      resetMetricForm();
      onCreated?.(optimizationId);
    } catch (submitError) {
      setIsSubmitting(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  const customMetricForm = useMetricForm(
    CUSTOM_OBJECTIVE_METRIC_FORM_STATE,
    async (value, context) => {
      const parsedMetric = metricSchema.safeParse(
        buildMetricFromFormState(value, customMetricId),
      );
      if (!parsedMetric.success) {
        setError(parsedMetric.error.issues[0]?.message ?? "Invalid metric");
        return;
      }
      await submitOptimization(parsedMetric.data, context.reset, true);
    },
    {
      validateOnSubmit: async (value) => {
        if (!selectedScenario) {
          return "Select a scenario";
        }
        return await validateMetricCompiles({
          requestHirArtifacts,
          sdcpn: {
            ...petriNetDefinition,
            scenarios: [selectedScenario],
          },
          extensions,
          metric: buildMetricFromFormState(value, customMetricId),
        });
      },
    },
  );
  const customMetricValues = useStore(
    customMetricForm.store,
    (state) => state.values,
  );
  const customMetricErrors = useStore(
    customMetricForm.store,
    (state) => state.errors,
  );
  const customMetricIsSubmitting = useStore(
    customMetricForm.store,
    (state) => state.isSubmitting,
  );
  const submissionInProgress = isSubmitting || customMetricIsSubmitting;
  const customMetricFormError = customMetricErrors.find(
    (formError) => typeof formError === "string",
  ) as string | undefined;
  const customMetricReady = customMetricValues.code.trim() !== "";
  const objectiveMetricReady =
    metricSource === "saved"
      ? selectedSavedMetric !== undefined
      : customMetricReady;
  const visibleCustomMetricError =
    metricSource === "custom" ? customMetricFormError : undefined;
  const configurationError = selectedScenario
    ? getConfigurationError({
        name,
        scenario: selectedScenario,
        drafts,
        objectiveMetricReady,
        missingObjectiveMessage:
          metricSource === "saved"
            ? "Select an objective metric"
            : "Define the custom objective metric",
        direction,
        optimizationSteps,
        dt,
        maxTime,
      })
    : "Select a scenario";

  const handleClose = () => {
    if (submissionInProgress) {
      return;
    }
    resetState();
    customMetricForm.reset();
    onClose();
  };

  const handleScenarioChange = (scenarioId: string) => {
    if (scenarioId === selectedScenarioId) {
      return;
    }
    const scenario = scenarios.find(({ id }) => id === scenarioId);
    setSelectedScenarioId(scenario?.id ?? null);
    resetConfigurationState(scenario);
    customMetricForm.reset();
  };

  const handleMetricChange = (value: string | null) => {
    setError(null);

    if (value === CUSTOM_METRIC_VALUE) {
      setMetricSource("custom");
      setSavedMetricId(null);
      return;
    }

    if (value?.startsWith(MODEL_METRIC_VALUE_PREFIX)) {
      const metricId = value.slice(MODEL_METRIC_VALUE_PREFIX.length);
      if (metrics.some((metric) => metric.id === metricId)) {
        setMetricSource("saved");
        setSavedMetricId(metricId);
        return;
      }
    }

    setMetricSource("saved");
    setSavedMetricId(null);
  };

  const handleSubmit = () => {
    if (metricSource === "custom") {
      void customMetricForm.handleSubmit();
    } else if (selectedSavedMetric) {
      void submitOptimization(selectedSavedMetric, () =>
        customMetricForm.reset(),
      );
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Drawer
      size="lg"
      shouldCloseOn={submissionInProgress ? "none" : undefined}
      showBackdrop={false}
      onClose={handleClose}
    >
      <Drawer.Header
        title="Create an optimization"
        description="Choose a scenario, a search space, and a metric objective"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section title="Scenario" collapsible defaultOpen>
            <div className={fieldStyle}>
              <Select
                required
                className={scenarioSelectStyle}
                placeholder="Select a scenario"
                value={selectedScenarioId ?? ""}
                onChange={handleScenarioChange}
                items={scenarioOptions}
                renderItem={renderScenarioLabel}
                renderSelectedItem={(scenarioId) =>
                  renderScenarioLabel(scenarioId, true)
                }
                emptyState="Create a scenario before starting an optimization."
                size="sm"
                disabled={submissionInProgress}
              />
            </div>
            {selectedScenario ? (
              selectedScenario.scenarioParameters.length === 0 ? (
                <span className={emptyStyle}>
                  No configurable parameters. Add at least one before creating
                  an optimization.
                </span>
              ) : null
            ) : scenarios.length === 0 ? (
              <span className={emptyStyle}>
                Create a scenario with configurable parameters before starting
                an optimization.
              </span>
            ) : null}
          </Section>

          {selectedScenario ? (
            <>
              <Section title="Optimization" collapsible defaultOpen>
                <div className={optimizationGridStyle}>
                  <div className={`${fieldStyle} ${fullWidthGridItemStyle}`}>
                    <span className={labelStyle}>Name</span>
                    <TextInput size="sm" value={name} onChange={setName} />
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Optimization steps</span>
                    <NumberInput
                      size="sm"
                      min={1}
                      max={PETRINAUT_OPTIMIZATION_MAX_TRIALS}
                      step={1}
                      value={optimizationSteps}
                      onChange={setOptimizationSteps}
                    />
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Time step</span>
                    <NumberInput
                      size="sm"
                      min={0}
                      step="any"
                      value={dt}
                      onChange={setDt}
                    />
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Max time</span>
                    <NumberInput
                      size="sm"
                      min={0}
                      step="any"
                      value={maxTime}
                      onChange={setMaxTime}
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="Parameters"
                tooltip="Only scenario parameters can be optimized. The optimizer receives a flat list of identifiers."
                collapsible
                defaultOpen
              >
                <span className={hintStyle}>
                  Parameters are fixed by default.
                  <br />
                  Enable Optimize and define a domain for every value the
                  optimizer may vary.
                </span>
                <div className={parameterListStyle}>
                  {selectedScenario.scenarioParameters.map((parameter) => (
                    <OptimizationParameterRow
                      key={parameter.identifier}
                      parameter={parameter}
                      draft={drafts[parameter.identifier]!}
                      onChange={(draft) =>
                        setDrafts((current) => ({
                          ...current,
                          [parameter.identifier]: draft,
                        }))
                      }
                    />
                  ))}
                </div>
              </Section>

              <Section title="Objective" collapsible defaultOpen>
                <span className={hintStyle}>
                  Choose a saved metric or write custom code for this run.
                  <br />
                  Its final simulation value will be maximized or minimized.
                </span>
                <div className={gridStyle}>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Metric</span>
                    <Select
                      required
                      size="sm"
                      placeholder="Select a metric"
                      value={metricPickerValue}
                      items={metricKindGroups}
                      renderItem={renderMetricOption}
                      renderSelectedItem={renderMetricOption}
                      onChange={handleMetricChange}
                    />
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Direction</span>
                    <div className={segmentControlStyle}>
                      <SegmentGroup
                        size="sm"
                        value={direction ?? ""}
                        options={directionOptions}
                        onChange={(value) => setDirection(value as Direction)}
                      />
                    </div>
                  </div>
                </div>
                {metricSource === "custom" ? (
                  <InlineObjectiveMetricForm form={customMetricForm} />
                ) : null}
              </Section>
            </>
          ) : null}
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        secondaryActions={
          error ||
          (selectedScenario ? configurationError : null) ||
          visibleCustomMetricError ? (
            <span className={errorStyle}>
              {error ??
                (selectedScenario ? configurationError : null) ??
                visibleCustomMetricError}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              disabled={submissionInProgress}
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              disabled={
                submissionInProgress ||
                configurationError !== null ||
                visibleCustomMetricError !== undefined
              }
              tooltip={configurationError ?? visibleCustomMetricError}
              prefix={
                submissionInProgress ? (
                  <LoadingSpinner size="sm" variant="bars" />
                ) : (
                  <Icon name="play" size="sm" />
                )
              }
              onClick={handleSubmit}
            >
              {submissionInProgress ? "Starting" : "Run"}
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
