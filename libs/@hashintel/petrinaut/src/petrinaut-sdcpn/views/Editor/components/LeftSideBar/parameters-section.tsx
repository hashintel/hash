import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import { v4 as uuidv4 } from "uuid";

import { InfoIconTooltip } from "../../../../components/tooltip";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNStore } from "../../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";

export const ParametersSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const parameters = useSDCPNStore((state) => state.sdcpn.parameters);
  const addParameter = useSDCPNStore((state) => state.addParameter);
  const removeParameter = useSDCPNStore((state) => state.removeParameter);
  const globalMode = useEditorStore((state) => state.globalMode);
  const simulationState = useSimulationStore((state) => state.state);
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);
  const setSelectedItemIds = useEditorStore(
    (state) => state.setSelectedItemIds,
  );
  const parameterValues = useSimulationStore((state) => state.parameterValues);
  const setParameterValue = useSimulationStore(
    (state) => state.setParameterValue,
  );

  const isSimulationNotRun =
    globalMode === "simulate" && simulationState === "NotRun";
  const isSimulationMode = globalMode === "simulate";

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
          {isExpanded ? (
            <FaChevronDown size={10} />
          ) : (
            <FaChevronRight size={10} />
          )}
          <span>
            Global Parameters
            <InfoIconTooltip tooltip="Parameters are injected into functions which govern dynamics, transition firing rate, and transition results. You can use them to define important values which you can re-use in multiple functions." />
          </span>
        </button>
        {!isSimulationMode && (
          <button
            type="button"
            onClick={() => {
              const name = `param${parameters.length + 1}`;
              const id = uuidv4();
              addParameter({
                id,
                name: `Parameter ${parameters.length + 1}`,
                variableName: name,
                type: "real",
                defaultValue: "0",
              });
              setSelectedItemIds(new Set([id]));
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
        )}
      </div>
      {isExpanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {parameters.map((param) => {
            const isSelected = selectedItemIds.has(param.id);

            return (
              <div
                key={param.id}
                onClick={(event) => {
                  // Don't trigger selection if clicking the delete button or input
                  if (
                    event.target instanceof HTMLElement &&
                    (event.target.closest("button[aria-label^='Delete']") ||
                      event.target.closest("input"))
                  ) {
                    return;
                  }
                  setSelectedItemIds(new Set([param.id]));
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedItemIds(new Set([param.id]));
                  }
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 8px",
                  fontSize: 13,
                  borderRadius: 4,
                  backgroundColor: isSelected
                    ? "rgba(59, 130, 246, 0.15)"
                    : "#f9fafb",
                  cursor: "pointer",
                }}
                className={css({
                  _hover: {
                    backgroundColor: isSelected
                      ? "[rgba(59, 130, 246, 0.2)]"
                      : "[rgba(0, 0, 0, 0.05)]",
                  },
                })}
              >
                <div>
                  <div>{param.name}</div>
                  <pre>{param.variableName}</pre>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isSimulationMode ? (
                    <input
                      type="number"
                      value={
                        parameterValues[param.variableName] ??
                        param.defaultValue
                      }
                      onChange={(event) =>
                        setParameterValue(
                          param.variableName,
                          event.target.value,
                        )
                      }
                      placeholder={param.defaultValue}
                      readOnly={!isSimulationNotRun}
                      className={css({
                        padding: "[2px 6px]",
                        fontSize: "[12px]",
                        borderRadius: "radius.2",
                        border: "1px solid",
                        borderColor: "core.gray.30",
                        backgroundColor: "[white]",
                        width: "[80px]",
                        textAlign: "right",
                        _focus: {
                          outline: "none",
                          borderColor: "core.blue.50",
                        },
                      })}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          // eslint-disable-next-line no-alert
                          window.confirm(`Delete parameter "${param.name}"?`)
                        ) {
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
                  )}
                </div>
              </div>
            );
          })}
          {parameters.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9ca3af",
                padding: "spacing.4",
                textAlign: "center",
              }}
            >
              No global parameters yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
