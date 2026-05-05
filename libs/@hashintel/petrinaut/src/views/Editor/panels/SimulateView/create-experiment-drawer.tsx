import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { TbPlayerPlay } from "react-icons/tb";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import { Section, SectionList } from "../../../../components/section";
import { Select } from "../../../../components/select";
import { CodeEditor } from "../../../../monaco/code-editor";
import type { Scenario, ScenarioParameter } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";

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

const codeEditorWrapperStyle = css({
  minHeight: "[120px]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
});

// -- Constants ----------------------------------------------------------------

const DEFAULT_SCENARIO_VALUE = "__default__";

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
}

export const CreateExperimentDrawer = ({
  open,
  onClose,
}: CreateExperimentDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const scenarios = petriNetDefinition.scenarios ?? [];
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    DEFAULT_SCENARIO_VALUE,
  );
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [predicates, setPredicates] = useState("");

  const selectedScenario: Scenario | undefined =
    selectedScenarioId === DEFAULT_SCENARIO_VALUE
      ? undefined
      : scenarios.find((s) => s.id === selectedScenarioId);

  const scenarioOptions = [
    { value: DEFAULT_SCENARIO_VALUE, label: "(Default)" },
    ...scenarios.map((s) => ({ value: s.id, label: s.name })),
  ];

  const handleScenarioChange = (value: string) => {
    setSelectedScenarioId(value);
    setParamValues({});
  };

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Configure and run an experiment with a scenario and predicates">
          Create an experiment
        </Drawer.Header>
        <Drawer.Body>
          <SectionList>
            {/* -- Scenario Selection -------------------------------- */}
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

            {/* -- Predicates ------------------------------------------- */}
            <Section title="Predicates" collapsible defaultOpen>
              <div className={codeEditorWrapperStyle}>
                <CodeEditor
                  language="typescript"
                  value={predicates}
                  onChange={(v) => setPredicates(v ?? "")}
                  height="120px"
                />
              </div>
            </Section>
          </SectionList>
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        <Button
          variant="secondary"
          colorScheme="neutral"
          size="sm"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          colorScheme="neutral"
          size="sm"
          iconLeft={<TbPlayerPlay size={14} />}
        >
          Play
        </Button>
      </Drawer.Footer>
    </Drawer.Root>
  );
};
