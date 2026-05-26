import { use } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../react/hooks/use-petrinaut-mutations";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { ParameterIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

import type { SubView } from "../../../../../components/sub-view/types";

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
  const { addParameter } = usePetrinautMutations();
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
    <Button
      aria-label="Add parameter"
      size="xs"
      variant="ghost"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add parameter"}
      iconName="plus"
      onClick={handleAddParameter}
    />
  );
};

const ParameterRowMenu: React.FC<{ item: { id: string } }> = ({ item }) => {
  const { removeParameter } = usePetrinautMutations();
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
          icon: <Icon name="trash" />,
          destructive: true,
          disabled: isReadOnly,
          onClick: () => removeParameter({ parameterId: item.id }),
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
