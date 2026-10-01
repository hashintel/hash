import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../react";
import { useControllers } from "../../../../../../react/controller-prototype/use-controllers";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { NodeContextMenu } from "../../../../../controller-prototype/add-to-controller-menu";
import {
  leverTagStyle,
  useControllersTreeGroup,
} from "../../../../../controller-prototype/controller-tree";
import { useCodeNavigation } from "../../../../../monaco/code-navigation";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";
import { AddDifferentialEquationAction } from "./entities-tree/add-differential-equation-action";
import { AddParameterAction } from "./entities-tree/add-parameter-action";
import { AddTypeAction } from "./entities-tree/add-type-action";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

import type { SubView } from "../../../../../components/sub-view/types";
import type { SelectionItem } from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

const taggedRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  "& > span:first-child": {
    flex: "[1]",
    minWidth: "[0]",
  },
});

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
  tag?: string;
  indent?: number;
  onSelect?: () => void;
  isSelected?: (selectedByDefault: boolean) => boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

const EntityRowMenu: React.FC<{ item: EntityTreeItem }> = ({ item }) => {
  const { removeType, removeDifferentialEquation, removeParameter } =
    usePetrinautMutations();
  const { updateControllers } = useControllers();
  const { globalMode } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  const { enabled, entries, open } = useCodeNavigation();
  const codeItems = enabled
    ? entries
        .filter((entry) => entry.selection.id === item.id)
        .map((entry) => ({
          id: entry.path,
          text: `Open ${entry.label.toLowerCase()}`,
          onClick: () => open(entry.path),
        }))
    : [];
  const type = item.selectionItem?.type;

  if (!type) {
    return null;
  }

  // Parameters hide their menu in simulation mode
  if (type === "parameter" && globalMode === "simulate") {
    return null;
  }

  const deleteActions: Partial<Record<string, () => void>> = {
    type: () => removeType({ typeId: item.id }),
    differentialEquation: () =>
      removeDifferentialEquation({ equationId: item.id }),
    parameter: () => removeParameter({ parameterId: item.id }),
    controller: () =>
      updateControllers((current) =>
        current.filter((controller) => controller.id !== item.id),
      ),
  };
  // A lever row selects its node, but it is not the node's own row.
  const deleteAction = item.tag ? undefined : deleteActions[type];

  if (!deleteAction && codeItems.length === 0) {
    return null;
  }

  return (
    <RowMenu
      items={[
        ...codeItems,
        ...(deleteAction
          ? [
              {
                id: "delete",
                text: "Delete",
                icon: "trash" as const,
                tone: "error" as const,
                disabled: isReadOnly,
                onClick: deleteAction,
              },
            ]
          : []),
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
  const { extensions } = use(SDCPNContext);
  const presentation = usePetrinautPresentation();
  const controllersGroup = useControllersTreeGroup((action) =>
    presentation.showMutationActions ? action : undefined,
  );

  // Adding an entity is a mutation, so a presentation that hides authoring
  // chrome hides a group's Add button with it.
  const addAction = (action: ComponentType): ComponentType | undefined =>
    presentation.showMutationActions ? action : undefined;

  return [
    controllersGroup,
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
    ...(extensions.colors
      ? [
          {
            id: "group-types",
            name: "Token Types",
            emptyGroupMessage: "No token types",
            renderGroupAction: addAction(AddTypeAction),
            children: types.map((t) => ({
              id: t.id,
              name: t.name,
              icon: TokenTypeIcon,
              iconColor: t.displayColor,
              selectionItem: { type: "type" as const, id: t.id },
            })),
          },
        ]
      : []),
    ...(extensions.colors && extensions.dynamics
      ? [
          {
            id: "group-equations",
            name: "Differential Equations",
            emptyGroupMessage: "No differential equations",
            renderGroupAction: addAction(AddDifferentialEquationAction),
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
        ]
      : []),
    ...(extensions.parameters
      ? [
          {
            id: "group-parameters",
            name: "Parameters",
            emptyGroupMessage: "No parameters",
            renderGroupAction: addAction(AddParameterAction),
            children: parameters.map((p) => ({
              id: p.id,
              name: p.name,
              icon: ParameterIcon,
              selectionItem: { type: "parameter" as const, id: p.id },
              variableName: p.variableName,
            })),
          },
        ]
      : []),
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
      if (item.tag) {
        return (
          <div className={taggedRowStyle}>
            <span>{item.name}</span>
            <span className={leverTagStyle}>{item.tag}</span>
          </div>
        );
      }
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
    wrapRow: (item, row) =>
      item.selectionItem?.type === "place" ||
      item.selectionItem?.type === "transition" ? (
        <NodeContextMenu nodeId={item.selectionItem.id}>{row}</NodeContextMenu>
      ) : (
        row
      ),
  }),
  main: true,
  alwaysShowHeaderAction: true,
};
