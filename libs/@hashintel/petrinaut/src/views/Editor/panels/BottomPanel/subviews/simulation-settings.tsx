import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { TbArrowRight } from "react-icons/tb";

import { NumberInput } from "../../../../../components/number-input";
import { Select } from "../../../../../components/select";
import type { SubView } from "../../../../../components/sub-view/types";
import { InfoIconTooltip } from "../../../../../components/tooltip";
import { SimulationContext } from "../../../../../simulation/context";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "[32px]",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
  flex: "[1]",
});

const sectionTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "[600]",
  textTransform: "uppercase",
  color: "[rgba(0, 0, 0, 0.5)]",
  letterSpacing: "[0.5px]",
  marginBottom: "[4px]",
});

const settingsRowStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "[24px]",
  flexWrap: "wrap",
});

const settingGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  minWidth: "[120px]",
});

const labelStyle = css({
  fontSize: "[12px]",
  fontWeight: "[500]",
  color: "[rgba(0, 0, 0, 0.7)]",
});

const smallLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "[400]",
});

const settingInputStyle = css({
  width: "[100px]",
});

const parametersListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const parameterRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "[6px 10px]",
  backgroundColor: "[rgba(0, 0, 0, 0.02)]",
  borderRadius: "[4px]",
});

const parameterNameStyle = css({
  fontSize: "[13px]",
  color: "[#333]",
});

const parameterVarNameStyle = css({
  fontSize: "[11px]",
  color: "[#6b7280]",
  fontFamily: "[monospace]",
});

const parameterInputStyle = css({
  width: "[80px]",
  textAlign: "right",
});

const emptyMessageStyle = css({
  fontSize: "[12px]",
  color: "[#9ca3af]",
  fontStyle: "italic",
});

const errorContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  padding: "[8px 12px]",
  backgroundColor: "[rgba(211, 47, 47, 0.05)]",
  borderRadius: "[4px]",
  marginTop: "[8px]",
});

const errorTextStyle = css({
  fontSize: "[11px]",
  color: "[#d32f2f]",
  maxWidth: "[400px]",
  wordWrap: "break-word",
  userSelect: "text",
  cursor: "text",
  textWrap: "wrap",
});

const editButtonStyle = css({
  fontSize: "[11px]",
  padding: "[4px 8px]",
  border: "[1px solid rgba(211, 47, 47, 0.3)]",
  borderRadius: "[4px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  color: "[#d32f2f]",
  display: "inline-flex",
  alignItems: "center",
  gap: "[4px]",
  marginTop: "[4px]",
  alignSelf: "flex-start",
});

const editButtonIconStyle = css({
  fontSize: "[12px]",
});

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel.
 * Split into two sections: Computation and Parameters.
 */
const SimulationSettingsContent: React.FC = () => {
  const { setGlobalMode, setSelectedResourceId } = use(EditorContext);
  const {
    state: simulationState,
    error: simulationError,
    errorItemId,
    dt,
    setDt,
    parameterValues,
    setParameterValue,
  } = use(SimulationContext);

  const {
    petriNetDefinition: { parameters },
  } = use(SDCPNContext);

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
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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

      {/* Error Display */}
      {simulationState === "Error" && simulationError && (
        <div className={errorContainerStyle}>
          <pre className={errorTextStyle}>{simulationError}</pre>
          {errorItemId && (
            <button
              type="button"
              onClick={() => {
                setGlobalMode("edit");
                setSelectedResourceId(errorItemId);
              }}
              className={editButtonStyle}
            >
              Edit Item
              <TbArrowRight className={editButtonIconStyle} />
            </button>
          )}
        </div>
      )}
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
