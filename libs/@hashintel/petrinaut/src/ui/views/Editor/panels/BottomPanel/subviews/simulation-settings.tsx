import { use, useState } from "react";

import { Button, Icon, NumberInput, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { InfoIconTooltip } from "../../../../../components/info-icon-tooltip";
import { Slider } from "../../../../../components/slider";
import { Switch } from "../../../../../components/switch";
import { CreateScenarioDrawer } from "../../SimulateView/scenarios/create-scenario-drawer";
import { ViewScenarioDrawer } from "../../SimulateView/scenarios/view-scenario-drawer";

import type { SubView } from "../../../../../components/sub-view/types";

// -- Styles -------------------------------------------------------------------

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "[0]",
  gap: "3",
});

const scenarioRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
});

const scenarioLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
  flexShrink: 0,
});

const scenarioSelectStyle = css({
  width: "[200px]",
});

const containerStyle = css({
  display: "grid",
  gridTemplateColumns: "[1fr 1fr]",
  gap: "8",
  flex: "[1]",
  minHeight: "[0]",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  minHeight: "[0]",
});

const sectionTitleStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
  marginBottom: "1",
});

const settingsRowStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "6",
  flexWrap: "wrap",
});

const settingGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[120px]",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

const smallLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "normal",
});

const settingInputStyle = css({
  width: "[100px]",
});

const parametersListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  overflowY: "auto",
  minHeight: "[0]",
});

const parameterRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
  maxWidth: "[480px]",
  paddingY: "1.5",
  paddingX: "2.5",
  backgroundColor: "neutral.bg.min.active",
  borderRadius: "sm",
});

const parameterNameStyle = css({
  fontSize: "[13px]",
  color: "neutral.fg.heading",
});

const parameterVarNameStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  fontFamily: "mono",
});

const parameterInputStyle = css({
  width: "[80px]",
  textAlign: "right",
});

const ratioRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
});

const ratioSliderStyle = css({
  width: "[120px]",
  opacity: "[1]",
});

const emptyMessageStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  fontStyle: "italic",
});

// -- Component ----------------------------------------------------------------

const NO_SCENARIO = "__none__";

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel.
 * Includes a scenario picker, parameters section, and computation settings.
 */
const SimulationSettingsContent: React.FC = () => {
  const { setGlobalMode } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { parameters, scenarios },
  } = use(SDCPNContext);
  const globalParameters = extensions.parameters ? parameters : [];
  const {
    state: simulationState,
    dt,
    setDt,
    parameterValues,
    setParameterValue,
    selectedScenarioId: contextScenarioId,
    setSelectedScenarioId: setContextScenarioId,
    scenarioParameterValues,
    setScenarioParameterValue,
  } = use(SimulationContext);

  const selectedScenarioId = contextScenarioId ?? NO_SCENARIO;
  const [odeSolver, setOdeSolver] = useState("euler");
  const [isCreateScenarioOpen, setIsCreateScenarioOpen] = useState(false);
  const [isViewScenarioOpen, setIsViewScenarioOpen] = useState(false);

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  const selectedScenario = scenarios?.find((s) => s.id === selectedScenarioId);

  // When a scenario is selected, show its scenario parameters + overridden net params.
  // When no scenario, show net-level parameters.
  const displayParams: Array<{
    key: string;
    name: string;
    variableName: string;
    type: "real" | "integer" | "boolean" | "ratio";
    defaultValue: string;
  }> = selectedScenario
    ? selectedScenario.scenarioParameters.map((sp) => ({
        key: `sp-${sp.identifier}`,
        name: sp.identifier,
        variableName: sp.identifier,
        type: sp.type,
        defaultValue: String(sp.default),
      }))
    : globalParameters.map((p) => ({
        key: p.id,
        name: p.name,
        variableName: p.variableName,
        type: p.type,
        defaultValue: p.defaultValue,
      }));

  const scenarioOptions = [
    ...(scenarios ?? []).map((s) => ({ value: s.id, text: s.name })),
    { value: NO_SCENARIO, text: "No scenario" },
  ];

  return (
    <div className={rootStyle}>
      {/* Scenario Picker */}
      <div className={scenarioRowStyle}>
        <span className={scenarioLabelStyle}>Scenario</span>
        <Select
          required
          value={selectedScenarioId}
          onChange={(value) =>
            setContextScenarioId(value === NO_SCENARIO ? null : value)
          }
          items={scenarioOptions}
          size="xs"
          disabled={isSimulationActive}
          className={scenarioSelectStyle}
          renderItem={(value) => {
            const option = scenarioOptions.find((opt) => opt.value === value);
            return (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {value === NO_SCENARIO && (
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
        <div style={{ display: "flex" }}>
          {selectedScenario && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Edit scenario"
              tooltip="Edit Scenario"
              iconName="pencil"
              onClick={() => setIsViewScenarioOpen(true)}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label="Create scenario"
            tooltip="Create Scenario"
            iconName="plus"
            onClick={() => setIsCreateScenarioOpen(true)}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label="Manage scenarios"
            tooltip="Manage Scenarios"
            iconName="list"
            onClick={() => setGlobalMode("simulate")}
          />
        </div>
      </div>
      <CreateScenarioDrawer
        open={isCreateScenarioOpen}
        onClose={() => setIsCreateScenarioOpen(false)}
      />
      <ViewScenarioDrawer
        open={isViewScenarioOpen}
        onClose={() => setIsViewScenarioOpen(false)}
        scenario={selectedScenario}
      />

      <div className={containerStyle}>
        {/* Parameters Section */}
        <div className={sectionStyle}>
          <div className={sectionTitleStyle}>
            {selectedScenario ? "Scenario Parameters" : "Parameters"}
          </div>
          {displayParams.length > 0 ? (
            <div className={parametersListStyle}>
              {displayParams.map((param) => (
                <div key={param.key} className={parameterRowStyle}>
                  <div>
                    <div className={parameterNameStyle}>{param.name}</div>
                    <div className={parameterVarNameStyle}>
                      {param.variableName}
                    </div>
                  </div>
                  {param.type === "boolean" && selectedScenario ? (
                    <Switch
                      checked={
                        (scenarioParameterValues[param.variableName] ??
                          param.defaultValue) !== "0"
                      }
                      onCheckedChange={(checked) =>
                        setScenarioParameterValue(
                          param.variableName,
                          checked ? "1" : "0",
                        )
                      }
                      disabled={isSimulationActive}
                    />
                  ) : param.type === "ratio" && selectedScenario ? (
                    <div className={ratioRowStyle}>
                      <Slider
                        className={ratioSliderStyle}
                        min={0}
                        max={1}
                        step={0.00001}
                        value={Number(
                          scenarioParameterValues[param.variableName] ??
                            param.defaultValue,
                        )}
                        onChange={(e) =>
                          setScenarioParameterValue(
                            param.variableName,
                            e.target.value,
                          )
                        }
                        disabled={isSimulationActive}
                      />
                      <NumberInput
                        type="float"
                        size="xs"
                        min={0}
                        max={1}
                        step={0.00001}
                        align="right"
                        value={Number(
                          scenarioParameterValues[param.variableName] ??
                            param.defaultValue,
                        )}
                        onChange={(value) =>
                          setScenarioParameterValue(
                            param.variableName,
                            value === null ? "" : String(value),
                          )
                        }
                        disabled={isSimulationActive}
                      />
                    </div>
                  ) : (
                    <NumberInput
                      type={param.type === "integer" ? "integer" : "float"}
                      size="xs"
                      align="right"
                      max={Number.MAX_SAFE_INTEGER}
                      value={Number(
                        selectedScenario
                          ? (scenarioParameterValues[param.variableName] ??
                              param.defaultValue)
                          : (parameterValues[param.variableName] ??
                              param.defaultValue),
                      )}
                      onChange={(value) => {
                        const val = value === null ? "" : String(value);
                        if (selectedScenario) {
                          setScenarioParameterValue(param.variableName, val);
                        } else {
                          setParameterValue(param.variableName, val);
                        }
                      }}
                      placeholder={param.defaultValue}
                      disabled={isSimulationActive}
                      className={parameterInputStyle}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={emptyMessageStyle}>
              {selectedScenario
                ? "No scenario parameters defined"
                : "No parameters defined"}
            </div>
          )}
        </div>

        {/* Computation Section */}
        <div className={sectionStyle}>
          <div className={sectionTitleStyle}>Computation</div>
          <div className={settingsRowStyle}>
            {/* Time Step Input */}
            <div className={settingGroupStyle}>
              <label htmlFor="time-step-input" className={labelStyle}>
                Time Step <span className={smallLabelStyle}>(sec/frame)</span>
                <InfoIconTooltip tooltip="Controls the resolution of the ODE solver. Smaller steps yield finer approximations but take longer to compute." />
              </label>
              <NumberInput
                type="float"
                htmlForId="time-step-input"
                size="xs"
                min={0.001}
                step={0.001}
                value={dt}
                onChange={(value) => {
                  if (value !== null && value > 0) {
                    setDt(value);
                  }
                }}
                disabled={isSimulationActive}
                className={settingInputStyle}
              />
            </div>
            {/* ODE Solver Method Select */}
            <div className={settingGroupStyle}>
              <label htmlFor="ode-solver-select" className={labelStyle}>
                ODE Solver
              </label>
              <Select<string>
                required
                value={odeSolver}
                onChange={(value) => setOdeSolver(value)}
                items={[{ value: "euler", text: "Euler" }]}
                size="xs"
                disabled={isSimulationActive}
                className={settingInputStyle}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * SubView definition for Simulation Settings tab.
 */
export const simulationSettingsSubView: SubView = {
  id: "simulation-settings",
  title: "Simulation Settings",
  tooltip:
    "Configure simulation parameters including time step and ODE solver method.",
  component: SimulationSettingsContent,
};
