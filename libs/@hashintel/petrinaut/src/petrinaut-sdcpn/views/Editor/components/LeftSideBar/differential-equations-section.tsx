import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import { v4 as uuidv4 } from "uuid";

import { useSDCPNStore } from "../../../../state/sdcpn-provider";

export const DifferentialEquationsSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const differentialEquations = useSDCPNStore(
    (state) => state.sdcpn.differentialEquations,
  );
  const types = useSDCPNStore((state) => state.sdcpn.types);
  const addDifferentialEquation = useSDCPNStore(
    (state) => state.addDifferentialEquation,
  );
  const removeDifferentialEquation = useSDCPNStore(
    (state) => state.removeDifferentialEquation,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={css({
            display: "flex",
            alignItems: "center",
            fontWeight: 600,
            fontSize: "[13px]",
            color: "[#333]",
            paddingBottom: "[4px]",
            cursor: "pointer",
            background: "[transparent]",
            border: "none",
            padding: "spacing.1",
            borderRadius: "radius.4",
            _hover: {
              backgroundColor: "[rgba(0, 0, 0, 0.05)]",
            },
          })}
          style={{ gap: 6 }}
        >
          {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          Differential Equations
        </button>
        <button
          type="button"
          onClick={() => {
            const name = `Equation ${differentialEquations.length + 1}`;
            addDifferentialEquation({
              id: uuidv4(),
              name,
              typeId: types.length > 0 ? types[0]!.id : "",
              code: `// dx/dt = ...\nreturn 0;`,
            });
          }}
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "spacing.1",
            borderRadius: "radius.2",
            cursor: "pointer",
            fontSize: "[14px]",
            color: "core.gray.50",
            background: "[transparent]",
            border: "none",
            _hover: {
              backgroundColor: "[rgba(59, 130, 246, 0.1)]",
              color: "[#3b82f6]",
            },
          })}
          style={{ width: 20, height: 20 }}
          aria-label="Add differential equation"
        >
          +
        </button>
      </div>
      {isExpanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {differentialEquations.map((eq) => (
            <div
              key={eq.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
                fontSize: 13,
                borderRadius: 4,
                backgroundColor: "#f9fafb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{eq.name}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete equation "${eq.name}"? Any places referencing this equation will have their differential equation reset.`,
                    )
                  ) {
                    removeDifferentialEquation(eq.id);
                  }
                }}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "spacing.1",
                  borderRadius: "radius.2",
                  cursor: "pointer",
                  fontSize: "[14px]",
                  color: "core.gray.40",
                  _hover: {
                    backgroundColor: "[rgba(239, 68, 68, 0.1)]",
                    color: "core.red.60",
                  },
                })}
                style={{ width: 20, height: 20 }}
                aria-label={`Delete equation ${eq.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {differentialEquations.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "spacing.4",
                textAlign: "center",
              }}
            >
              No differential equations yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
