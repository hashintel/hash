import { css } from "@hashintel/ds-helpers/css";
import { TbPlayerPlay } from "react-icons/tb";

import { useSDCPNStore } from "../../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";

export const SimulationStateSection: React.FC = () => {
  const simulationState = useSimulationStore((state) => state.state);
  const simulationError = useSimulationStore((state) => state.error);
  const initialize = useSimulationStore((state) => state.initialize);
  const step = useSimulationStore((state) => state.step);
  const sdcpn = useSDCPNStore((state) => state.sdcpn);

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
          justifyContent: "space-between",
          alignItems: "center",
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
            <span
              style={{
                fontSize: 11,
                color: "#d32f2f",
                marginTop: 4,
                maxWidth: 250,
                wordWrap: "break-word",
              }}
            >
              {simulationError}
            </span>
          )}
        </div>
        {simulationState === "NotRun" && (
          <button
            type="button"
            onClick={() => {
              // Build initial marking from places
              // TODO: Get actual initial state from InitialStateEditor data
              const initialMarking = new Map<
                string,
                { values: Float64Array; count: number }
              >();
              for (const place of sdcpn.places) {
                // Default to empty marking for now
                initialMarking.set(place.id, {
                  values: new Float64Array(0),
                  count: 0,
                });
              }
              initialize({
                initialMarking,
                seed: Date.now(),
                dt: 0.01,
              });
            }}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "[6px]",
              background: "[#1976d2]",
              border: "none",
              borderRadius: "[4px]",
              cursor: "pointer",
              color: "[white]",
              fontSize: "[13px]",
              fontWeight: "[500]",
              _hover: {
                background: "[#1565c0]",
              },
            })}
            style={{
              padding: "6px 12px",
            }}
          >
            <TbPlayerPlay size={16} />
            Play
          </button>
        )}
        {simulationState === "Paused" && (
          <button
            type="button"
            onClick={() => {
              step();
            }}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "[6px]",
              padding: "[6px_12px]",
              background: "[#1976d2]",
              border: "none",
              borderRadius: "[4px]",
              cursor: "pointer",
              color: "[white]",
              fontSize: "[13px]",
              fontWeight: "[500]",
              _hover: {
                background: "[#1565c0]",
              },
            })}
          >
            <TbPlayerPlay size={16} />
            Continue
          </button>
        )}
      </div>
    </div>
  );
};
