import { css } from "@hashintel/ds-helpers/css";
import type { ComponentType } from "react";
import { use } from "react";
import { TbTrash } from "react-icons/tb";

import type { SubView } from "../../../../../components/sub-view/types";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { EditorContext } from "../../../../../state/editor-context";
import { MutationContext } from "../../../../../state/mutation-context";
import { ActiveNetContext } from "../../../../../state/active-net-context";
import type { SelectionItem } from "../../../../../state/selection";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import { DifferentialEquationsSectionHeaderAction } from "./differential-equations-list";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";
import { ParametersHeaderAction } from "./parameters-list";
import { TypesSectionHeaderAction } from "./types-list";

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
  const { removeType, removeDifferentialEquation, removeParameter } =
    use(MutationContext);
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
    type: () => removeType(item.id),
    differentialEquation: () => removeDifferentialEquation(item.id),
    parameter: () => removeParameter(item.id),
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
          icon: <TbTrash />,
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
    activeNet: {
      places,
      transitions,
      types,
      differentialEquations,
      parameters,
    },
  } = use(ActiveNetContext);

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
    getSelectionItem: (item) =>
      item.selectionItem ?? { type: "place", id: item.id },
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
