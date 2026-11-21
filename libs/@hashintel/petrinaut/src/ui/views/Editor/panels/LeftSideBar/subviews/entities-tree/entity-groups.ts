import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceIcon,
  TokenTypeIcon,
  TransitionIcon,
} from "../../../../../../constants/entity-icons";

import type { ActiveNetDefinition } from "../../../../../../../react/state/active-net-context";
import type {
  PetrinautExtensionSettings,
  SelectionItem,
} from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

/** An entity of a net as the sidebar lists it: a row of the tree, a result of the search. */
export interface EntityItem {
  id: string;
  type: "place" | "transition" | "type" | "differentialEquation" | "parameter";
  name: string;
  iconColor?: string;
  variableName?: string;
}

export type EntityGroupId =
  | "group-nodes"
  | "group-types"
  | "group-equations"
  | "group-parameters";

/** A collapsible header row of the tree with the entities below it. */
export interface EntityGroup {
  id: EntityGroupId;
  name: string;
  /** Shown in place of the rows while the group has none. */
  emptyGroupMessage: string;
  /** Shown at the right of the header, such as an add button. */
  action?: ComponentType;
  children: EntityItem[];
}

export const entityIcons: Record<
  EntityItem["type"],
  ComponentType<{ size: number }>
> = {
  place: PlaceIcon,
  transition: TransitionIcon,
  type: TokenTypeIcon,
  differentialEquation: DifferentialEquationIcon,
  parameter: ParameterIcon,
};

export const selectionItemOf = ({ type, id }: EntityItem): SelectionItem => ({
  type,
  id,
});

/**
 * The top of the list, down to its first `limit` entities: the groups before
 * the one that reaches the limit, then that group with the entities that fit.
 */
export const firstEntityRows = (
  groups: EntityGroup[],
  limit: number,
): EntityGroup[] => {
  const top: EntityGroup[] = [];
  let rowsLeft = limit;
  for (const group of groups) {
    if (rowsLeft <= 0) {
      break;
    }
    top.push(
      group.children.length > rowsLeft
        ? { ...group, children: group.children.slice(0, rowsLeft) }
        : group,
    );
    rowsLeft -= group.children.length;
  }
  return top;
};

/**
 * The entities of a net in the order the sidebar lists them, under the groups
 * the document's extensions allow.
 */
export const entityGroups = (
  {
    places,
    transitions,
    types,
    differentialEquations,
    parameters,
  }: Pick<
    ActiveNetDefinition,
    "places" | "transitions" | "types" | "differentialEquations" | "parameters"
  >,
  extensions: PetrinautExtensionSettings,
): EntityGroup[] => [
  {
    id: "group-nodes",
    name: "Nodes",
    emptyGroupMessage: "No nodes",
    children: [
      ...places.map((place) => ({
        id: place.id,
        type: "place" as const,
        name: place.name || `Place ${place.id}`,
      })),
      ...transitions.map((transition) => ({
        id: transition.id,
        type: "transition" as const,
        name: transition.name || `Transition ${transition.id}`,
      })),
    ],
  },
  ...(extensions.colors
    ? [
        {
          id: "group-types" as const,
          name: "Token Types",
          emptyGroupMessage: "No token types",
          children: types.map((type) => ({
            id: type.id,
            type: "type" as const,
            name: type.name,
            iconColor: type.displayColor,
          })),
        },
      ]
    : []),
  ...(extensions.colors && extensions.dynamics
    ? [
        {
          id: "group-equations" as const,
          name: "Differential Equations",
          emptyGroupMessage: "No differential equations",
          children: differentialEquations.map((equation) => ({
            id: equation.id,
            type: "differentialEquation" as const,
            name: equation.name,
          })),
        },
      ]
    : []),
  ...(extensions.parameters
    ? [
        {
          id: "group-parameters" as const,
          name: "Parameters",
          emptyGroupMessage: "No parameters",
          children: parameters.map((parameter) => ({
            id: parameter.id,
            type: "parameter" as const,
            name: parameter.name,
            variableName: parameter.variableName,
          })),
        },
      ]
    : []),
];
