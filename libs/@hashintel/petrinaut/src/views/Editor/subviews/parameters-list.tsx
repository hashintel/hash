import { css, cva } from "@hashintel/ds-helpers/css";
import { v4 as uuidv4 } from "uuid";

import type { SubView } from "../../../components/sub-view/types";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNContext } from "../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../state/simulation-provider";

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
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.4]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "core.gray.60",
    },
  },
});

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
});

const parameterRowStyle = cva({
  base: {
    width: "[100%]",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "[4px 2px 4px 8px]",
    fontSize: "[13px]",
    borderRadius: "[4px]",
    cursor: "pointer",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.15)]",
        _hover: {
          backgroundColor: "[rgba(59, 130, 246, 0.2)]",
        },
      },
      false: {
        backgroundColor: "[#f9fafb]",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.03)]",
        },
      },
    },
  },
});

const parameterVarNameStyle = css({
  margin: "[0]",
  fontSize: "[11px]",
  color: "[#6b7280]",
});

const actionsContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
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
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.3]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "core.gray.50",
    },
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
  padding: "spacing.4",
  textAlign: "center",
});

/**
 * Header action component for adding parameters.
 * Shown in the panel header when not in simulation mode.
 */
const ParametersHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
    addParameter,
  } = useSDCPNContext();
  const globalMode = useEditorStore((state) => state.globalMode);
  const simulationState = useSimulationStore((state) => state.state);
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  const isSimulationMode = globalMode === "simulate";
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

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

  // Don't show add button in simulation mode
  if (isSimulationMode) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={isSimulationActive}
      onClick={handleAddParameter}
      className={addButtonStyle}
      aria-label="Add parameter"
    >
      +
    </button>
  );
};

/**
 * ParametersList displays global parameters list as a SubView.
 */
const ParametersList: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
    removeParameter,
  } = useSDCPNContext();
  const globalMode = useEditorStore((state) => state.globalMode);
  const simulationState = useSimulationStore((state) => state.state);
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );
  const parameterValues = useSimulationStore((state) => state.parameterValues);
  const setParameterValue = useSimulationStore(
    (state) => state.setParameterValue,
  );

  const isSimulationNotRun =
    globalMode === "simulate" && simulationState === "NotRun";
  const isSimulationMode = globalMode === "simulate";

  // Check if simulation is running or paused
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div>
      <div className={listContainerStyle}>
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
              className={parameterRowStyle({ isSelected })}
            >
              <div>
                <div>{param.name}</div>
                <pre className={parameterVarNameStyle}>
                  {param.variableName}
                </pre>
              </div>
              <div className={actionsContainerStyle}>
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
                    disabled={isSimulationActive}
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

/**
 * SubView definition for Global Parameters List.
 */
export const parametersListSubView: SubView = {
  id: "parameters-list",
  title: "Global Parameters",
  tooltip:
    "Parameters are injected into dynamics, lambda, and kernel functions.",
  component: ParametersList,
  renderHeaderAction: () => <ParametersHeaderAction />,
  resizable: {
    defaultHeight: 100,
    minHeight: 60,
    maxHeight: 250,
  },
};
