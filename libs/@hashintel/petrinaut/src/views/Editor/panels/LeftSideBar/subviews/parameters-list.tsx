import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbPlus, TbTrash } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { ParameterIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { EditorContext } from "../../../../../state/editor-context";
import { MutationContext } from "../../../../../state/mutation-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

const parameterVarNameStyle = css({
  margin: "0",
  fontSize: "xs",
  color: "neutral.s90",
  fontFamily: "mono",
});

/**
 * Header action component for adding parameters.
 * Shown in the panel header when not in simulation mode.
 */
export const ParametersHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { parameters },
  } = use(SDCPNContext);
  const { addParameter } = use(MutationContext);
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

const ParameterRowMenu: React.FC<{ item: { id: string } }> = ({ item }) => {
  const { removeParameter } = use(MutationContext);
  const { globalMode } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  if (globalMode === "simulate") {
    return null;
  }

  return (
    <RowMenu
      items={[
        {
          id: "delete",
          label: "Delete",
          icon: <TbTrash />,
          destructive: true,
          disabled: isReadOnly,
          onClick: () => removeParameter(item.id),
        },
      ]}
    />
  );
};

/**
 * SubView definition for Global Parameters List.
 */
export const parametersListSubView: SubView = createFilterableListSubView({
  id: "parameters-list",
  title: "Global Parameters",
  tooltip:
    "Parameters are injected into dynamics, lambda, and kernel functions.",
  defaultCollapsed: false,
  resizable: {
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 600,
  },
  useItems: () => {
    const {
      petriNetDefinition: { parameters },
    } = use(SDCPNContext);
    return parameters.map((param) => ({
      ...param,
      icon: ParameterIcon,
    }));
  },
  getSelectionItem: (param) => ({ type: "parameter", id: param.id }),
  renderItem: (param) => {
    return (
      <div>
        <div>{param.name}</div>
        <pre className={parameterVarNameStyle}>{param.variableName}</pre>
      </div>
    );
  },
  renderRowMenu: ParameterRowMenu,
  emptyMessage: "No global parameters yet",
  renderHeaderAction: () => <ParametersHeaderAction />,
});
