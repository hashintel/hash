import { css } from "@hashintel/ds-helpers/css";
import { v4 as uuidv4 } from "uuid";

import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[12px]",
});

const titleStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontWeight: 600,
  fontSize: "[13px]",
  color: "[#333]",
});

const addButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "spacing.1",
  borderRadius: "radius.2",
  cursor: "pointer",
  fontSize: "[18px]",
  color: "core.gray.60",
  background: "[transparent]",
  border: "none",
  width: "[24px]",
  height: "[24px]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
    color: "core.gray.90",
  },
});

const parameterRowStyle = css({
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  },
});

const parameterRowSelectedStyle = css({
  _hover: {
    backgroundColor: "[rgba(59, 130, 246, 0.2)]",
  },
});

const inputStyle = css({
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
});

const deleteButtonStyle = css({
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
  width: "[20px]",
  height: "[20px]",
  _hover: {
    backgroundColor: "[rgba(255, 0, 0, 0.1)]",
    color: "[#ef4444]",
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
  padding: "spacing.4",
  textAlign: "center",
});

/**
 * ParametersContent displays global parameters in the BottomPanel.
 */
export const ParametersContent: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
    addParameter,
    removeParameter,
  } = useSDCPNContext();
  const globalMode = useEditorStore((state) => state.globalMode);
  const simulationState = useSimulationStore((state) => state.state);
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId
  );
  const parameterValues = useSimulationStore((state) => state.parameterValues);
  const setParameterValue = useSimulationStore(
    (state) => state.setParameterValue
  );

  const isSimulationNotRun =
    globalMode === "simulate" && simulationState === "NotRun";
  const isSimulationMode = globalMode === "simulate";

  const handleAddParameter = () => {
    const name = `param${parameters.length + 1}`;
    const id = uuidv4();
    addParameter({
      id,
      name: `Parameter ${parameters.length + 1}`,
      variableName: name,
      type: "real",
      defaultValue: "0",
    });
    setSelectedResourceId(id);
  };

  return (
    <div>
      <div className={headerStyle}>
        <div className={titleStyle}>
          Parameters are injected into dynamics, lambda, and kernel functions.
        </div>
        {!isSimulationMode && (
          <button
            type="button"
            onClick={handleAddParameter}
            className={addButtonStyle}
            aria-label="Add parameter"
          >
            +
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {parameters.map((param) => {
          const isSelected = selectedResourceId === param.id;

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
                setSelectedResourceId(param.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setSelectedResourceId(param.id);
                }
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 2px 4px 8px",
                fontSize: 13,
                borderRadius: 4,
                backgroundColor: isSelected
                  ? "rgba(59, 130, 246, 0.15)"
                  : "#f9fafb",
                cursor: "pointer",
              }}
              className={
                isSelected ? parameterRowSelectedStyle : parameterRowStyle
              }
            >
              <div>
                <div>{param.name}</div>
                <pre style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
                  {param.variableName}
                </pre>
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
                      parameterValues[param.variableName] ?? param.defaultValue
                    }
                    onChange={(event) =>
                      setParameterValue(param.variableName, event.target.value)
                    }
                    placeholder={param.defaultValue}
                    readOnly={!isSimulationNotRun}
                    className={inputStyle}
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
                    className={deleteButtonStyle}
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
          <div className={emptyMessageStyle}>No global parameters yet</div>
        )}
      </div>
    </div>
  );
};
