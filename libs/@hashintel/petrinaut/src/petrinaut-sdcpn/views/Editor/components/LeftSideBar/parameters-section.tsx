import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import { v4 as uuidv4 } from "uuid";

import { useSDCPNStore } from "../../../../state/sdcpn-provider";

export const ParametersSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const parameters = useSDCPNStore((state) => state.sdcpn.parameters);
  const addParameter = useSDCPNStore((state) => state.addParameter);
  const removeParameter = useSDCPNStore((state) => state.removeParameter);

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
          Parameters
        </button>
        <button
          type="button"
          onClick={() => {
            const name = `param${parameters.length + 1}`;
            addParameter({
              id: uuidv4(),
              name: `Parameter ${parameters.length + 1}`,
              variableName: name,
              type: "real",
              defaultValue: "0",
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
          aria-label="Add parameter"
        >
          +
        </button>
      </div>
      {isExpanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {parameters.map((param) => (
            <div
              key={param.id}
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
                <span>
                  {param.name} ({param.variableName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete parameter "${param.name}"?`)) {
                    removeParameter(param.id);
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
                  color: "core.gray.50",
                  _hover: {
                    backgroundColor: "[rgba(255, 0, 0, 0.1)]",
                    color: "[#ef4444]",
                  },
                })}
                style={{ width: 20, height: 20 }}
                aria-label={`Delete ${param.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {parameters.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "spacing.4",
                textAlign: "center",
              }}
            >
              No parameters yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
