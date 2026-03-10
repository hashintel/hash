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
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import { createFilterableListSubView } from "./filterable-list-sub-view";

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

// Custom row style for parameters - overrides the default to add space-between layout
const parameterRowContentStyle = cva({
  base: {
    width: "[100%]",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

/**
 * SubView definition for Global Parameters List.
 */
export const parametersListSubView: SubView = createFilterableListSubView({
  id: "parameters-list",
  title: "Global Parameters",
  tooltip:
    "Parameters are injected into dynamics, lambda, and kernel functions.",
  defaultCollapsed: true,
  resizable: {
    defaultHeight: 100,
    minHeight: 60,
    maxHeight: 250,
  },
  useItems: () => {
    const {
      petriNetDefinition: { parameters },
    } = use(SDCPNContext);
    return parameters;
  },
  getSelectionItem: (param) => ({ type: "parameter", id: param.id }),
  renderItem: (param, _isSelected) => {
    const { removeParameter } = use(SDCPNContext);
    const { globalMode } = use(EditorContext);
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
      <div className={parameterRowContentStyle()}>
        <div>
          <div>{param.name}</div>
          <pre className={parameterVarNameStyle}>{param.variableName}</pre>
        </div>
        <div className={actionsContainerStyle}>
          {isSimulationMode ? (
            <NumberInput
              size="xs"
              value={parameterValues[param.variableName] ?? param.defaultValue}
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
              tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
            >
              <TbX />
            </IconButton>
          )}
        </div>
      </div>
    );
  },
  emptyMessage: "No global parameters yet",
  renderHeaderAction: () => <ParametersHeaderAction />,
});
