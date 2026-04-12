import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";

import { NumberInput } from "../../../../../components/number-input";
import { Select } from "../../../../../components/select";
import type { SubView } from "../../../../../components/sub-view/types";
import { InfoIconTooltip } from "../../../../../components/tooltip";
import { SimulationContext } from "../../../../../simulation/context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "8",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  flex: "[1]",
});

const sectionTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a80",
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

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel.
 * Split into two sections: Computation and Parameters.
 */
const SimulationSettingsContent: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
  } = use(SDCPNContext);
  const {
    state: simulationState,
    dt,
    setDt,
    parameterValues,
    setParameterValue,
  } = use(SimulationContext);

  // Local state for ODE solver (not used in simulation yet, but UI is ready)
  const [odeSolver, setOdeSolver] = useState("euler");

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div>
      <div className={containerStyle}>
        {/* Parameters Section */}
        <div className={sectionStyle}>
          <div className={sectionTitleStyle}>Parameters</div>
          {parameters.length > 0 ? (
            <div className={parametersListStyle}>
              {parameters.map((param) => (
                <div key={param.id} className={parameterRowStyle}>
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
            <div className={emptyMessageStyle}>No parameters defined</div>
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
                min={0.01}
                step={0.01}
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
