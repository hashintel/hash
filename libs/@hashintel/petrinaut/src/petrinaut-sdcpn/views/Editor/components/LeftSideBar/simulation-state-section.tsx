import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { TbArrowRight } from "react-icons/tb";

import { useEditorStore } from "../../../../state/editor-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";

export const SimulationStateSection: React.FC = () => {
  const simulationState = useSimulationStore((state) => state.state);
  const simulationError = useSimulationStore((state) => state.error);
  const errorItemId = useSimulationStore((state) => state.errorItemId);
  const reset = useSimulationStore((state) => state.reset);
  const dt = useSimulationStore((state) => state.dt);
  const setDt = useSimulationStore((state) => state.setDt);
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  // Local state for ODE solver (not used in simulation yet, but UI is ready)
  const [odeSolver, setOdeSolver] = useState("euler");

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        paddingBottom: 16,
        borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "8px 12px",
          backgroundColor: "rgba(0, 0, 0, 0.03)",
          borderRadius: 4,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "rgba(0, 0, 0, 0.5)",
              letterSpacing: 0.5,
            }}
          >
            Simulation State
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color:
                simulationState === "Running"
                  ? "#1976d2"
                  : simulationState === "Complete"
                    ? "#2e7d32"
                    : simulationState === "Error"
                      ? "#d32f2f"
                      : simulationState === "Paused"
                        ? "#ed6c02"
                        : "rgba(0, 0, 0, 0.7)",
            }}
          >
            {simulationState === "NotRun" ? "Not Started" : simulationState}
          </span>
          {simulationState === "Error" && simulationError && (
            <>
              <pre
                style={{
                  fontSize: 11,
                  color: "#d32f2f",
                  marginTop: 4,
                  maxWidth: 250,
                  wordWrap: "break-word",
                  userSelect: "text",
                  cursor: "text",
                  textWrap: "wrap",
                }}
              >
                {simulationError}
              </pre>
              {errorItemId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResourceId(errorItemId);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    border: "1px solid rgba(211, 47, 47, 0.3)",
                    borderRadius: 4,
                    backgroundColor: "white",
                    cursor: "pointer",
                    color: "#d32f2f",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 4,
                    alignSelf: "flex-start",
                  }}
                >
                  Jump to Item
                  <TbArrowRight style={{ fontSize: 12 }} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Time Step Input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- it can't tell it's the same ID */}
          <label
            htmlFor="time-step-input"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(0, 0, 0, 0.7)",
            }}
          >
            Time Step{" "}
            <span style={{ fontSize: 10, fontWeight: 400 }}>
              (seconds per frame)
            </span>
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
            style={{
              fontSize: 14,
              padding: "6px 8px",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              backgroundColor: isSimulationActive
                ? "rgba(0, 0, 0, 0.05)"
                : "white",
              cursor: isSimulationActive ? "not-allowed" : "text",
            }}
          />
        </div>

        {/* ODE Solver Method Select */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- it can't tell it's the same ID */}
          <label
            htmlFor="ode-solver-select"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(0, 0, 0, 0.7)",
            }}
          >
            ODE Solver Method
          </label>
          <select
            id="ode-solver-select"
            value={odeSolver}
            onChange={(event) => setOdeSolver(event.target.value)}
            disabled={isSimulationActive}
            style={{
              fontSize: 14,
              padding: "6px 8px",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              backgroundColor: isSimulationActive
                ? "rgba(0, 0, 0, 0.05)"
                : "white",
              cursor: isSimulationActive ? "not-allowed" : "pointer",
            }}
          >
            <option value="euler">Euler</option>
          </select>
        </div>
      </div>

      {simulationState !== "NotRun" && (
        <button
          type="button"
          onClick={() => {
            reset();
          }}
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "[transparent]",
            border: "1px solid",
            borderColor: "core.gray.30",
            borderRadius: "radius.4",
            cursor: "pointer",
            color: "core.gray.70",
            fontSize: "[12px]",
            fontWeight: "[500]",
            padding: "[4px 8px]",
            _hover: {
              backgroundColor: "core.gray.10",
              borderColor: "core.gray.40",
            },
          })}
        >
          Reset
        </button>
      )}
    </div>
  );
};
