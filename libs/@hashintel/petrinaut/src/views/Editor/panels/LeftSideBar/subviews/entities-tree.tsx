import { css } from "@hashintel/ds-helpers/css";
import type { ComponentType } from "react";
import { use } from "react";

import type { SubView } from "../../../../../components/sub-view/types";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../constants/entity-icons";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import type { SelectionItem } from "../../../../../state/selection";
import { createFilterableListSubView } from "./filterable-list-sub-view";

const parameterVarNameStyle = css({
  margin: "0",
  fontSize: "xs",
  color: "neutral.s90",
});

interface EntityTreeItem {
  id: string;
  name: string;
  icon?: ComponentType<{ size: number }>;
  iconColor?: string;
  children?: EntityTreeItem[];
  emptyGroupMessage?: string;
  selectionItem?: SelectionItem;
  variableName?: string;
}

function useEntityTreeItems(): EntityTreeItem[] {
  const {
    petriNetDefinition: {
      places,
      transitions,
      types,
      differentialEquations,
      parameters,
    },
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
    emptyMessage: "No entities yet",
  }),
  main: true,
  alwaysShowHeaderAction: true,
};
