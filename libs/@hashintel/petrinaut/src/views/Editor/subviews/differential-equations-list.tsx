import { css, cva } from "@hashintel/ds-helpers/css";
import { v4 as uuidv4 } from "uuid";

import type { SubView } from "../../../components/sub-view/types";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "../../../core/default-codes";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNContext } from "../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../state/simulation-provider";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
});

const equationRowStyle = cva({
  base: {
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
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
  },
});

const equationNameContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "spacing.1",
  borderRadius: "radius.2",
  cursor: "pointer",
  fontSize: "[14px]",
  color: "core.gray.40",
  background: "[transparent]",
  border: "none",
  width: "[20px]",
  height: "[20px]",
  _hover: {
    backgroundColor: "[rgba(239, 68, 68, 0.1)]",
    color: "core.red.60",
  },
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.3]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "core.gray.40",
    },
  },
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
  padding: "spacing.4",
  textAlign: "center",
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
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.4]",
    _hover: {
      backgroundColor: "[transparent]",
      color: "core.gray.60",
    },
  },
});

/**
 * DifferentialEquationsSectionContent displays the list of differential equations.
 * This is the content portion without the collapsible header.
 */
const DifferentialEquationsSectionContent: React.FC = () => {
  const {
    petriNetDefinition: { differentialEquations },
    removeDifferentialEquation,
  } = useSDCPNContext();

  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId
  );
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId
  );

  // Check if simulation is running or paused
  const simulationState = useSimulationStore((state) => state.state);
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <div className={listContainerStyle}>
      {differentialEquations.map((eq) => {
        const isSelected = selectedResourceId === eq.id;

        return (
          <div
            key={eq.id}
            onClick={(event) => {
              // Don't trigger selection if clicking the delete button
              if (
                event.target instanceof HTMLElement &&
                event.target.closest("button[aria-label^='Delete']")
              ) {
                return;
              }
              setSelectedResourceId(eq.id);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setSelectedResourceId(eq.id);
              }
            }}
            className={equationRowStyle({ isSelected })}
          >
            <div className={equationNameContainerStyle}>
              <span>{eq.name}</span>
            </div>
            <button
              type="button"
              disabled={isSimulationActive}
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Delete equation "${eq.name}"? Any places referencing this equation will have their differential equation reset.`
                  )
                ) {
                  removeDifferentialEquation(eq.id);
                }
              }}
              className={deleteButtonStyle}
              aria-label={`Delete equation ${eq.name}`}
            >
              ×
            </button>
          </div>
        );
      })}
      {differentialEquations.length === 0 && (
        <div className={emptyMessageStyle}>No differential equations yet</div>
      )}
    </div>
  );
};

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types, differentialEquations },
    addDifferentialEquation,
  } = useSDCPNContext();
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId
  );

  // Check if simulation is running or paused
  const simulationState = useSimulationStore((state) => state.state);
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  return (
    <button
      type="button"
      disabled={isSimulationActive}
      onClick={() => {
        const name = `Equation ${differentialEquations.length + 1}`;
        const id = uuidv4();
        addDifferentialEquation({
          id,
          name,
          colorId: types.length > 0 ? types[0]!.id : "",
          code: DEFAULT_DIFFERENTIAL_EQUATION_CODE,
        });
        setSelectedResourceId(id);
      }}
      className={addButtonStyle}
      aria-label="Add differential equation"
    >
      +
    </button>
  );
};

/**
 * SubView definition for Differential Equations list.
 */
export const differentialEquationsListSubView: SubView = {
  id: "differential-equations-list",
  title: "Differential Equations",
  tooltip: `Differential equations govern how token data changes over time when tokens remain in a place ("dynamics").`,
  component: DifferentialEquationsSectionContent,
  renderHeaderAction: () => <DifferentialEquationsSectionHeaderAction />,
  flexGrow: false,
};
