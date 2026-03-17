import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbPlus, TbX } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../components/icon-button";
import { NumberInput } from "../../../../../components/number-input";
import type { SubView } from "../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { SimulationContext } from "../../../../../simulation/context";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import type { SelectionItem } from "../../../../../state/selection";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const parameterRowStyle = cva({
  base: {
    width: "[100%]",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "[4px 2px 4px 8px]",
    fontSize: "[13px]",
    borderRadius: "sm",
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
        backgroundColor: "neutral.s10",
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
  color: "neutral.s100",
});

const actionsContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const parameterValueInputStyle = css({
  width: "[80px]",
  textAlign: "right",
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "neutral.s85",
});

/**
 * Header action component for adding parameters.
 * Shown in the panel header when not in simulation mode.
 */
const ParametersHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
    addParameter,
  } = use(SDCPNContext);
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

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
    selectItem({ type: "parameter", id });
  };

  return (
    <IconButton
      aria-label="Add parameter"
      size="xs"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      onClick={handleAddParameter}
    >
      <TbPlus />
    </IconButton>
  );
};

/**
 * ParametersList displays global parameters list as a SubView.
 */
const ParametersList: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
    removeParameter,
  } = use(SDCPNContext);
  const { globalMode, isSelected, selectItem, toggleItem } = use(EditorContext);
  const {
    state: simulationState,
    parameterValues,
    setParameterValue,
  } = use(SimulationContext);

  const isReadOnly = useIsReadOnly();
  const isSimulationNotRun =
    globalMode === "simulate" && simulationState === "NotRun";
  const isSimulationMode = globalMode === "simulate";

  return (
    <div>
      <div className={listContainerStyle}>
        {parameters.map((param) => {
          const paramSelected = isSelected(param.id);
          const item: SelectionItem = { type: "parameter", id: param.id };

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
                if (event.metaKey || event.ctrlKey) {
                  toggleItem(item);
                } else {
                  selectItem(item);
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  selectItem(item);
                }
              }}
              className={parameterRowStyle({ isSelected: paramSelected })}
            >
              <div>
                <div>{param.name}</div>
                <pre className={parameterVarNameStyle}>
                  {param.variableName}
                </pre>
              </div>
              <div className={actionsContainerStyle}>
                {isSimulationMode ? (
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
                    readOnly={!isSimulationNotRun}
                    className={parameterValueInputStyle}
                  />
                ) : (
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    colorScheme="red"
                    disabled={isReadOnly}
                    onClick={() => removeParameter(param.id)}
                    aria-label={`Delete ${param.name}`}
                    tooltip={
                      isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined
                    }
                  >
                    <TbX />
                  </IconButton>
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
  defaultCollapsed: true,
  resizable: {
    defaultHeight: 100,
    minHeight: 60,
    maxHeight: 250,
  },
};
