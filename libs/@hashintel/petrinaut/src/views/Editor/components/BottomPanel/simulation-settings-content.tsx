import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { TbArrowRight } from "react-icons/tb";

import { useEditorStore } from "../../../../state/editor-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const settingsContainerStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "[24px]",
  flexWrap: "wrap",
});

const settingGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  minWidth: "[150px]",
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

const inputStyle = css({
  fontSize: "[14px]",
  padding: "[6px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  backgroundColor: "[white]",
  width: "[120px]",
});

const inputDisabledStyle = css({
  fontSize: "[14px]",
  padding: "[6px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  cursor: "not-allowed",
  width: "[120px]",
});

const selectStyle = css({
  fontSize: "[14px]",
  padding: "[6px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  width: "[120px]",
});

const selectDisabledStyle = css({
  fontSize: "[14px]",
  padding: "[6px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  cursor: "not-allowed",
  width: "[120px]",
});

const stateContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  padding: "[8px 12px]",
  backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  borderRadius: "[4px]",
});

const stateLabelStyle = css({
  fontSize: "[11px]",
  fontWeight: "[600]",
  textTransform: "uppercase",
  color: "[rgba(0, 0, 0, 0.5)]",
  letterSpacing: "[0.5px]",
});

const errorTextStyle = css({
  fontSize: "[11px]",
  color: "[#d32f2f]",
  marginTop: "[4px]",
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
 */
export const SimulationSettingsContent: React.FC = () => {
  const setGlobalMode = useEditorStore((state) => state.setGlobalMode);
  const simulationState = useSimulationStore((state) => state.state);
  const simulationError = useSimulationStore((state) => state.error);
  const errorItemId = useSimulationStore((state) => state.errorItemId);
  const dt = useSimulationStore((state) => state.dt);
  const setDt = useSimulationStore((state) => state.setDt);
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId
  );

  // Local state for ODE solver (not used in simulation yet, but UI is ready)
  const [odeSolver, setOdeSolver] = useState("euler");

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div className={sectionStyle}>
      {/* Settings Row */}
      <div className={settingsContainerStyle}>
        {/* Time Step Input */}
        <div className={settingGroupStyle}>
          <label htmlFor="time-step-input" className={labelStyle}>
            Time Step{" "}
            <span className={smallLabelStyle}>(seconds per frame)</span>
          </label>
          <input
            id="time-step-input"
            type="number"
            min="0.01"
            step="0.01"
            value={dt}
            onChange={(event) => {
              const value = Number.parseFloat(event.target.value);
              if (value > 0) {
                setDt(value);
              }
            }}
            disabled={isSimulationActive}
            className={isSimulationActive ? inputDisabledStyle : inputStyle}
          />
        </div>
        {/* ODE Solver Method Select */}
        <div className={settingGroupStyle}>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- it can't tell it's the same ID */}
          <label htmlFor="ode-solver-select" className={labelStyle}>
            ODE Solver Method
          </label>
          <select
            id="ode-solver-select"
            value={odeSolver}
            onChange={(event) => setOdeSolver(event.target.value)}
            disabled={isSimulationActive}
            className={isSimulationActive ? selectDisabledStyle : selectStyle}
          >
            <option value="euler">Euler</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {simulationState === "Error" && simulationError && (
        <div className={stateContainerStyle}>
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
