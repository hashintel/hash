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
  PETRINAUT_OPTIMIZATION_MAX_SEED,
  PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL,
  PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS,
  PETRINAUT_OPTIMIZATION_MAX_TRIALS,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core";

import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Section, SectionList } from "../../../../../components/section";
import { SegmentGroup } from "../../../../../components/segment-group";
import {
  createOptimizationParameterDraft,
  type OptimizationParameterDraft,
  OptimizationParameterRow,
} from "./optimization-parameter-row";

import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationVariable,
  Scenario,
  ScenarioParameter,
  SDCPN,
} from "@hashintel/petrinaut-core";

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
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

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3",
});

const settingsGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "3",
});

const parameterListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const scenarioSummaryStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
});

const scenarioSummaryTextStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
});

const scenarioNameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const scenarioDescriptionStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  marginRight: "auto",
  whiteSpace: "pre-wrap",
});

type Stage = "scenario" | "configure";
type Direction = "maximize" | "minimize";
type ParameterDrafts = Record<string, OptimizationParameterDraft>;

const directionOptions = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

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
  }

  return null;
}

function getConfigurationError({
  name,
  scenario,
  drafts,
  metricId,
  direction,
  trials,
  seed,
  dt,
  maxTime,
}: {
  name: string;
  scenario: Scenario;
  drafts: ParameterDrafts;
  metricId: string | null;
  direction: Direction | null;
  trials: number | null;
  seed: number | null;
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
  if (!metricId) {
    return "Select an objective metric";
  }
  if (!direction) {
    return "Choose whether to maximize or minimize the objective";
  }
  if (
    trials === null ||
    !Number.isInteger(trials) ||
    trials < 1 ||
    trials > PETRINAUT_OPTIMIZATION_MAX_TRIALS
  ) {
    return `Trials must be an integer between 1 and ${PETRINAUT_OPTIMIZATION_MAX_TRIALS.toLocaleString()}`;
  }
  if (
    seed === null ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > PETRINAUT_OPTIMIZATION_MAX_SEED
  ) {
    return `Seed must be an integer between 0 and ${PETRINAUT_OPTIMIZATION_MAX_SEED.toLocaleString()}`;
  }
  if (dt === null || !Number.isFinite(dt) || dt <= 0) {
    return "Time step must be a positive number";
  }
  if (maxTime === null || !Number.isFinite(maxTime) || maxTime <= 0) {
    return "Max time must be a positive number";
  }
  const stepsPerTrial = Math.ceil(maxTime / dt);
  if (
    !Number.isSafeInteger(stepsPerTrial) ||
    stepsPerTrial > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL
  ) {
    return `Use at most ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()} simulation steps per trial`;
  }
  if (stepsPerTrial * trials > PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS) {
    return `Use at most ${PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS.toLocaleString()} simulation steps across all trials`;
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
  metricId,
  direction,
  trials,
  seed,
  dt,
  maxTime,
  sampler,
}: {
  name: string;
  title: string;
  definition: SDCPN;
  scenario: Scenario;
  drafts: ParameterDrafts;
  metricId: string;
  direction: Direction;
  trials: number;
  seed: number;
  dt: number;
  maxTime: number;
  sampler: "tpe" | "random";
}): PetrinautOptimizationInput {
  const parameterValues = Object.fromEntries(
    scenario.scenarioParameters.map((parameter) => {
      const value = drafts[parameter.identifier]!.fixedValue!;
      return [parameter.identifier, value];
    }),
  );
  const variables: PetrinautOptimizationVariable[] = [];
  for (const parameter of scenario.scenarioParameters) {
    const draft = drafts[parameter.identifier]!;
    if (draft.mode !== "optimize") {
      continue;
    }
    if (parameter.type === "boolean") {
      variables.push({
        identifier: parameter.identifier,
        domain: { kind: "categorical", values: [false, true] },
      });
    } else if (parameter.type === "integer") {
      variables.push({
        identifier: parameter.identifier,
        domain: {
          kind: "integer",
          minimum: draft.minimum!,
          maximum: draft.maximum!,
          step: draft.step!,
        },
      });
    } else {
      variables.push({
        identifier: parameter.identifier,
        domain: {
          kind: "continuous",
          minimum: draft.minimum!,
          maximum: draft.maximum!,
          scale: draft.scale,
        },
      });
    }
  }

  return petrinautOptimizationInputSchema.parse({
    name,
    model: { title, definition },
    scenario: { id: scenario.id, parameterValues },
    searchSpace: { version: 1, variables },
    objective: { metricId, direction },
    execution: { seed, dt, maxTime },
    optimization: { trials, sampler },
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
  const { petriNetDefinition, title } = use(SDCPNContext);
  const { createOptimization } = use(OptimizationsContext);
  const scenarios = petriNetDefinition.scenarios ?? [];
  const metrics = petriNetDefinition.metrics ?? [];
  const [stage, setStage] = useState<Stage>("scenario");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("Optimization");
  const [drafts, setDrafts] = useState<ParameterDrafts>({});
  const [metricId, setMetricId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [trials, setTrials] = useState<number | null>(100);
  const [seed, setSeed] = useState<number | null>(1);
  const [dt, setDt] = useState<number | null>(1);
  const [maxTime, setMaxTime] = useState<number | null>(180);
  const [sampler, setSampler] = useState<"tpe" | "random">("tpe");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedScenario = scenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const scenarioOptions = scenarios.map((scenario) => ({
    value: scenario.id,
    text: scenario.name,
  }));
  const metricOptions = metrics.map((metric) => ({
    value: metric.id,
    text: metric.name,
  }));
  const configurationError = selectedScenario
    ? getConfigurationError({
        name,
        scenario: selectedScenario,
        drafts,
        metricId,
        direction,
        trials,
        seed,
        dt,
        maxTime,
      })
    : "Select a scenario";

  const reset = () => {
    setStage("scenario");
    setSelectedScenarioId(null);
    setName("Optimization");
    setDrafts({});
    setMetricId(null);
    setDirection(null);
    setTrials(100);
    setSeed(1);
    setDt(1);
    setMaxTime(180);
    setSampler("tpe");
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    reset();
    onClose();
  };

  const handleContinue = () => {
    if (!selectedScenario || selectedScenario.scenarioParameters.length === 0) {
      return;
    }
    setDrafts(createParameterDrafts(selectedScenario));
    setStage("configure");
    setError(null);
  };

  const handleSubmit = async () => {
    if (
      isSubmitting ||
      !selectedScenario ||
      configurationError ||
      metricId === null ||
      direction === null ||
      trials === null ||
      seed === null ||
      dt === null ||
      maxTime === null
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const input = buildPetrinautOptimizationInput({
        name,
        title,
        definition: petriNetDefinition,
        scenario: selectedScenario,
        drafts,
        metricId,
        direction,
        trials,
        seed,
        dt,
        maxTime,
        sampler,
      });
      const optimizationId = await createOptimization(input);
      reset();
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

  if (!open) {
    return null;
  }

  if (stage === "scenario") {
    const selectedScenarioHasParameters =
      selectedScenario && selectedScenario.scenarioParameters.length > 0;

    return (
      <Drawer size="xl" showBackdrop={false} onClose={handleClose}>
        <Drawer.Header
          title="Create an optimization"
          description="First choose the scenario whose parameters Optuna may vary"
        />
        <Drawer.Body className={css({ paddingTop: "[0]" })}>
          <SectionList>
            <Section title="Scenario" collapsible defaultOpen>
              <div className={fieldStyle}>
                <span className={labelStyle}>Scenario</span>
                <Select
                  placeholder="Select a scenario"
                  value={selectedScenarioId}
                  onChange={(scenarioId) => {
                    setSelectedScenarioId(scenarioId ?? null);
                    setError(null);
                  }}
                  items={scenarioOptions}
                  emptyState="Create a scenario before starting an optimization."
                  size="sm"
                />
              </div>
              {selectedScenario ? (
                selectedScenario.scenarioParameters.length > 0 ? (
                  <span className={hintStyle}>
                    {selectedScenario.scenarioParameters.length} scenario
                    parameter
                    {selectedScenario.scenarioParameters.length === 1
                      ? ""
                      : "s"}
                    available.
                  </span>
                ) : (
                  <span className={emptyStyle}>
                    This scenario has no parameters. Add at least one scenario
                    parameter before optimizing it.
                  </span>
                )
              ) : scenarios.length === 0 ? (
                <span className={emptyStyle}>
                  This model has no scenarios. Create one with user-tunable
                  parameters first.
                </span>
              ) : null}
            </Section>
          </SectionList>
        </Drawer.Body>
        <Drawer.Footer
          actions={
            <>
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                variant="solid"
                tone="neutral"
                size="sm"
                disabled={!selectedScenarioHasParameters}
                tooltip={
                  selectedScenario && !selectedScenarioHasParameters
                    ? "The selected scenario has no parameters"
                    : !selectedScenario
                      ? "Select a scenario"
                      : undefined
                }
                onClick={handleContinue}
              >
                Continue
              </Button>
            </>
          }
        />
      </Drawer>
    );
  }

  if (!selectedScenario) {
    return null;
  }

  return (
    <Drawer
      size="xl"
      shouldCloseOn={isSubmitting ? "none" : undefined}
      showBackdrop={false}
      onClose={handleClose}
    >
      <Drawer.Header
        title="Configure optimization"
        description="Choose a flat search space and one final-frame metric objective"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section title="Scenario" collapsible defaultOpen>
            <div className={scenarioSummaryStyle}>
              <div className={scenarioSummaryTextStyle}>
                <span className={scenarioNameStyle}>
                  {selectedScenario.name}
                </span>
                <span className={scenarioDescriptionStyle}>
                  {selectedScenario.description ??
                    `${selectedScenario.scenarioParameters.length} parameters`}
                </span>
              </div>
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  setStage("scenario");
                  setDrafts({});
                }}
              >
                Change
              </Button>
            </div>
          </Section>

          <Section title="Optimization" collapsible defaultOpen>
            <div className={gridStyle}>
              <div className={fieldStyle}>
                <span className={labelStyle}>Name</span>
                <TextInput size="sm" value={name} onChange={setName} />
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Sampler</span>
                <Select
                  required
                  size="sm"
                  value={sampler}
                  onChange={setSampler}
                  items={[
                    { value: "tpe", text: "TPE" },
                    { value: "random", text: "Random" },
                  ]}
                />
              </div>
            </div>
            <div className={settingsGridStyle}>
              <div className={fieldStyle}>
                <span className={labelStyle}>Trials</span>
                <NumberInput
                  size="sm"
                  min={1}
                  max={PETRINAUT_OPTIMIZATION_MAX_TRIALS}
                  step={1}
                  value={trials}
                  onChange={setTrials}
                />
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Seed</span>
                <NumberInput
                  size="sm"
                  min={0}
                  max={PETRINAUT_OPTIMIZATION_MAX_SEED}
                  step={1}
                  value={seed}
                  onChange={setSeed}
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
            title="Scenario parameters"
            tooltip="Only scenario parameters can be optimized. Optuna receives a flat list of identifiers."
            collapsible
            defaultOpen
          >
            <span className={hintStyle}>
              Parameters are fixed by default. Enable Optimize and define a
              domain for every value Optuna may vary.
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
              Choose one saved model metric. Its value at the final simulation
              frame is the Optuna objective.
            </span>
            <div className={gridStyle}>
              <div className={fieldStyle}>
                <span className={labelStyle}>Metric</span>
                <Select
                  placeholder="Select a metric"
                  value={metricId}
                  onChange={(value) => setMetricId(value ?? null)}
                  items={metricOptions}
                  emptyState="Create a model metric before running an optimization."
                  size="sm"
                />
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Direction</span>
                <SegmentGroup
                  size="sm"
                  value={direction ?? ""}
                  options={directionOptions}
                  onChange={(value) => setDirection(value as Direction)}
                />
              </div>
            </div>
          </Section>
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        secondaryActions={
          error || configurationError ? (
            <span className={errorStyle}>{error ?? configurationError}</span>
          ) : undefined
        }
        actions={
          <>
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
              disabled={isSubmitting || configurationError !== null}
              tooltip={configurationError ?? undefined}
              prefix={
                isSubmitting ? (
                  <LoadingSpinner size="sm" variant="bars" />
                ) : (
                  <Icon name="play" size="sm" />
                )
              }
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? "Starting" : "Run"}
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
