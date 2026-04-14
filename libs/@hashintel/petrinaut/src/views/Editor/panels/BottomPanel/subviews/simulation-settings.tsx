import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { TbPlus } from "react-icons/tb";

import { IconButton } from "../../../../../components/icon-button";
import { NumberInput } from "../../../../../components/number-input";
import { Select } from "../../../../../components/select";
import type { SubView } from "../../../../../components/sub-view/types";
import { InfoIconTooltip } from "../../../../../components/tooltip";
import { SimulationContext } from "../../../../../simulation/context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";

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
  gap: "3",
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

const emptyMessageStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  fontStyle: "italic",
});

const sectionTitleRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "1",
});

// -- Component ----------------------------------------------------------------

const NO_SCENARIO = "__none__";

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel.
 * Includes a scenario picker, parameters section, and computation settings.
 */
const SimulationSettingsContent: React.FC = () => {
  const {
    petriNetDefinition: { parameters, scenarios },
  } = use(SDCPNContext);
  const {
    state: simulationState,
    dt,
    setDt,
    parameterValues,
    setParameterValue,
    selectedScenarioId: contextScenarioId,
    setSelectedScenarioId: setContextScenarioId,
  } = use(SimulationContext);

  const selectedScenarioId = contextScenarioId ?? NO_SCENARIO;
  const [odeSolver, setOdeSolver] = useState("euler");

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  const selectedScenario = scenarios?.find((s) => s.id === selectedScenarioId);

  // When a scenario is selected, show its scenario parameters + overridden net params.
  // When no scenario, show net-level parameters.
  const displayParams = selectedScenario
    ? selectedScenario.scenarioParameters.map((sp) => ({
        key: `sp-${sp.identifier}`,
        name: sp.identifier,
        variableName: sp.identifier,
        type: sp.type,
        defaultValue: String(sp.default),
      }))
    : parameters.map((p) => ({
        key: p.id,
        name: p.name,
        variableName: p.variableName,
        type: p.type,
        defaultValue: p.defaultValue,
      }));

  const scenarioOptions = [
    { value: NO_SCENARIO, label: "No scenario" },
    ...(scenarios ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className={rootStyle}>
      {/* Scenario Picker */}
      <div className={scenarioRowStyle}>
        <span className={scenarioLabelStyle}>Scenario</span>
        <Select
          value={selectedScenarioId}
          onValueChange={(value) =>
            setContextScenarioId(value === NO_SCENARIO ? null : value)
          }
          options={scenarioOptions}
          size="xs"
          className={scenarioSelectStyle}
        />
      </div>

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
                  <NumberInput
                    size="xs"
                    value={
                      parameterValues[param.variableName] ?? param.defaultValue
                    }
                    onChange={(event) =>
                      setParameterValue(
                        param.variableName,
                        (event.target as HTMLInputElement).value,
                      )
                    }
                    placeholder={param.defaultValue}
                    disabled={isSimulationActive}
                    className={parameterInputStyle}
                  />
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
                id="time-step-input"
                size="xs"
                min={0.001}
                step={0.001}
                value={dt}
                onChange={(event) => {
                  const value = Number.parseFloat(
                    (event.target as HTMLInputElement).value,
                  );
                  if (value > 0) {
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
              <Select
                value={odeSolver}
                onValueChange={(value) => setOdeSolver(value)}
                options={[{ value: "euler", label: "Euler" }]}
                size="xs"
                disabled={isSimulationActive}
                className={settingInputStyle}
              />
            </div>
          </div>

          {/* Metrics Section */}
          <div className={sectionTitleRowStyle}>
            <div className={sectionTitleStyle}>Metrics</div>
            <IconButton size="xs" variant="ghost" aria-label="Add metric">
              <TbPlus size={12} />
            </IconButton>
          </div>
          <div className={emptyMessageStyle}>No metrics defined</div>
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
