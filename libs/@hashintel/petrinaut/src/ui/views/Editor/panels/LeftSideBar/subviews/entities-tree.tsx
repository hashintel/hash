import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { MutationContext } from "../../../../../../react/state/mutation-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { DifferentialEquationsSectionHeaderAction } from "./differential-equations-list";
import { RowMenu, createFilterableListSubView } from "./filterable-list-sub-view";
import { ParametersHeaderAction } from "./parameters-list";
import { TypesSectionHeaderAction } from "./types-list";

import type { SubView } from "../../../../../components/sub-view/types";
import type { SelectionItem } from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

const parameterVarNameStyle = css({
  margin: "0",
  fontSize: "xs",
  color: "neutral.s85",
  fontFamily: "mono",
});

interface EntityTreeItem {
  id: string;
  name: string;
  icon?: ComponentType<{ size: number }>;
  iconColor?: string;
  children?: EntityTreeItem[];
  emptyGroupMessage?: string;
  renderGroupAction?: ComponentType;
  selectionItem?: SelectionItem;
  variableName?: string;
}

const EntityRowMenu: React.FC<{ item: EntityTreeItem }> = ({ item }) => {
  const { removeType, removeDifferentialEquation, removeParameter } = use(MutationContext);
  const { globalMode } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  const type = item.selectionItem?.type;

  if (!type) {
    return null;
  }

  // Nodes (places/transitions) don't have a row menu
  if (type === "place" || type === "transition") {
    return null;
  }

  // Parameters hide their menu in simulation mode
  if (type === "parameter" && globalMode === "simulate") {
    return null;
  }

  const deleteActions: Partial<Record<string, () => void>> = {
    type: () => removeType({ typeId: item.id }),
    differentialEquation: () => removeDifferentialEquation({ equationId: item.id }),
    parameter: () => removeParameter({ parameterId: item.id }),
  };
  const deleteAction = deleteActions[type];

  if (!deleteAction) {
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
          onClick: deleteAction,
        },
      ]}
    />
  );
};

function useEntityTreeItems(): EntityTreeItem[] {
  const {
    petriNetDefinition: { places, transitions, types, differentialEquations, parameters },
  } = use(SDCPNContext);

  return [
    {
      id: "group-nodes",
      name: "Nodes",
      emptyGroupMessage: "No nodes",
      children: [
        ...places.map((p) => ({
          id: p.id,
          name: p.name || `Place ${p.id}`,
          icon: PlaceFilledIcon,
          selectionItem: { type: "place" as const, id: p.id },
        })),
        ...transitions.map((t) => ({
          id: t.id,
          name: t.name || `Transition ${t.id}`,
          icon: TransitionFilledIcon,
          selectionItem: { type: "transition" as const, id: t.id },
        })),
      ],
    },
    {
      id: "group-types",
      name: "Token Types",
      emptyGroupMessage: "No token types",
      renderGroupAction: TypesSectionHeaderAction,
      children: types.map((t) => ({
        id: t.id,
        name: t.name,
        icon: TokenTypeIcon,
        iconColor: t.displayColor,
        selectionItem: { type: "type" as const, id: t.id },
      })),
    },
    {
      id: "group-equations",
      name: "Differential Equations",
      emptyGroupMessage: "No differential equations",
      renderGroupAction: DifferentialEquationsSectionHeaderAction,
      children: differentialEquations.map((eq) => ({
        id: eq.id,
        name: eq.name,
        icon: DifferentialEquationIcon,
        selectionItem: {
          type: "differentialEquation" as const,
          id: eq.id,
        },
      })),
    },
    {
      id: "group-parameters",
      name: "Parameters",
      emptyGroupMessage: "No parameters",
      renderGroupAction: ParametersHeaderAction,
      children: parameters.map((p) => ({
        id: p.id,
        name: p.name,
        icon: ParameterIcon,
        selectionItem: { type: "parameter" as const, id: p.id },
        variableName: p.variableName,
      })),
    },
  ];
}

export const entitiesTreeSubView: SubView = {
  ...createFilterableListSubView<EntityTreeItem>({
    id: "entities-tree",
    title: "Entities",
    useItems: useEntityTreeItems,
    getSelectionItem: (item) => item.selectionItem ?? { type: "place", id: item.id },
    renderItem: (item) => {
      if (item.variableName) {
        return (
          <div>
            <div>{item.name}</div>
            <pre className={parameterVarNameStyle}>{item.variableName}</pre>
          </div>
        );
      }
      return item.name;
    },
    renderRowMenu: EntityRowMenu,
    emptyMessage: "No entities yet",
  }),
  main: true,
  alwaysShowHeaderAction: true,
};
