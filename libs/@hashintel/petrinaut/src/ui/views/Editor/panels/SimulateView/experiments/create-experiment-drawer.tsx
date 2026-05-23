import { use, useState } from "react";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Button } from "../../../../../components/button";
import { Drawer } from "../../../../../components/drawer";
import { Input } from "../../../../../components/input";
import { NumberInput } from "../../../../../components/number-input";
import { Section, SectionList } from "../../../../../components/section";
import { Select } from "../../../../../components/select";
import { CodeEditor } from "../../../../../monaco/code-editor";

import type { Scenario, ScenarioParameter } from "@hashintel/petrinaut-core";

// -- Styles -------------------------------------------------------------------

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

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "3",
});

const paramRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const paramNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const paramTypeStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  width: "[60px]",
  flexShrink: 0,
});

const scenarioSectionStyle = css({
  position: "relative",
  zIndex: 1,
});

const emptyParamsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  paddingY: "[16px]",
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
const DEFAULT_SCENARIO_VALUE = "__default__";
const DEFAULT_RUN_COUNT = "1000";
const DEFAULT_SEED = "1";
const DEFAULT_DT = "1";
const DEFAULT_MAX_TIME = "180";

// -- Component ----------------------------------------------------------------

const ScenarioParameterRow = ({
  param,
  value,
  onChange,
}: {
  param: ScenarioParameter;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className={paramRowStyle}>
    <span className={paramNameStyle}>{param.identifier}</span>
    <span className={paramTypeStyle}>{param.type}</span>
    <CodeEditor
      singleLine
      language="typescript"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      placeholder={String(param.default)}
    />
  </div>
);

// -- Drawer -------------------------------------------------------------------

interface CreateExperimentDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (experimentId: string) => void;
}

export const CreateExperimentDrawer = ({
  open,
  onClose,
  onCreated,
}: CreateExperimentDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { createExperiment } = use(ExperimentsContext);
  const scenarios = petriNetDefinition.scenarios ?? [];
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    DEFAULT_SCENARIO_VALUE,
  );
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [dt, setDt] = useState(DEFAULT_DT);
  const [maxTime, setMaxTime] = useState(DEFAULT_MAX_TIME);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedScenario: Scenario | undefined =
    selectedScenarioId === DEFAULT_SCENARIO_VALUE
      ? undefined
      : scenarios.find((s) => s.id === selectedScenarioId);

  const scenarioOptions = [
    { value: DEFAULT_SCENARIO_VALUE, label: "(Default)" },
    ...scenarios.map((s) => ({ value: s.id, label: s.name })),
  ];

  const resetForm = () => {
    setName(DEFAULT_EXPERIMENT_NAME);
    setSelectedScenarioId(DEFAULT_SCENARIO_VALUE);
    setParamValues({});
    setRunCount(DEFAULT_RUN_COUNT);
    setSeed(DEFAULT_SEED);
    setDt(DEFAULT_DT);
    setMaxTime(DEFAULT_MAX_TIME);
    setError(null);
    setIsSubmitting(false);
  };

  const handleScenarioChange = (value: string) => {
    setSelectedScenarioId(value);
    setParamValues({});
    setError(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const experimentId = await createExperiment({
        name,
        scenarioId:
          selectedScenarioId === DEFAULT_SCENARIO_VALUE
            ? null
            : selectedScenarioId,
        scenarioParameterValues: paramValues,
        runCount: Number(runCount),
        seed: Number(seed),
        dt: Number(dt),
        maxTime: Number(maxTime),
      });
      resetForm();
      onCreated?.(experimentId);
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
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Run a Monte Carlo experiment from the current model and scenario">
          Create an experiment
        </Drawer.Header>
        <Drawer.Body>
          <SectionList>
            <Section title="Experiment" collapsible defaultOpen>
              <div className={fieldStyle}>
                <span className={labelStyle}>Name</span>
                <Input
                  size="md"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </div>
              <div className={gridStyle}>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Runs</span>
                  <NumberInput
                    size="md"
                    min={1}
                    step={1}
                    value={runCount}
                    onChange={(event) => setRunCount(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Seed</span>
                  <NumberInput
                    size="md"
                    step={1}
                    value={seed}
                    onChange={(event) => setSeed(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Time step</span>
                  <NumberInput
                    size="md"
                    min={0}
                    step="any"
                    value={dt}
                    onChange={(event) => setDt(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Max time</span>
                  <NumberInput
                    size="md"
                    min={0}
                    step="any"
                    value={maxTime}
                    onChange={(event) => setMaxTime(event.currentTarget.value)}
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Scenario"
              collapsible
              defaultOpen
              className={scenarioSectionStyle}
            >
              <div className={fieldStyle}>
                <span className={labelStyle}>Scenario</span>
                <Select
                  value={selectedScenarioId}
                  onValueChange={handleScenarioChange}
                  options={scenarioOptions}
                  size="md"
                  portal={false}
                />
              </div>

              {selectedScenario ? (
                selectedScenario.scenarioParameters.length === 0 ? (
                  <div className={emptyParamsStyle}>No scenario parameters</div>
                ) : (
                  selectedScenario.scenarioParameters.map((param) => (
                    <ScenarioParameterRow
                      key={param.identifier}
                      param={param}
                      value={paramValues[param.identifier] ?? ""}
                      onChange={(v) =>
                        setParamValues((prev) => ({
                          ...prev,
                          [param.identifier]: v,
                        }))
                      }
                    />
                  ))
                )
              ) : null}
            </Section>
          </SectionList>
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        {error ? <span className={errorStyle}>{error}</span> : null}
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          disabled={isSubmitting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          disabled={isSubmitting}
          prefix={
            isSubmitting ? (
              <LoadingSpinner size="sm" variant="bars" />
            ) : (
              <Icon name="play" size="sm" />
            )
          }
          onClick={() => {
            void handleSubmit();
          }}
        >
          {isSubmitting ? "Starting" : "Run"}
        </Button>
      </Drawer.Footer>
    </Drawer.Root>
  );
};
