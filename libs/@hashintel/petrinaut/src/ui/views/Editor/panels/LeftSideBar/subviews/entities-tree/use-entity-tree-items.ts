import { use } from "react";

import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { usePetrinautPresentation } from "../../../../../shared/presentation-context";
import { AddDifferentialEquationAction } from "./add-differential-equation-action";
import { AddParameterAction } from "./add-parameter-action";
import { AddTypeAction } from "./add-type-action";

import type { ComponentType } from "react";

/** A row of the tree that selects an entity of the net. */
export interface EntityItem {
  id: string;
  type: "place" | "transition" | "type" | "differentialEquation" | "parameter";
  name: string;
  iconColor?: string;
  variableName?: string;
}

/** A collapsible header row with the entities below it. */
export interface EntityGroup {
  id: string;
  name: string;
  /** Shown in place of the rows while the group has none. */
  emptyGroupMessage: string;
  /** Shown at the right of the header, such as an add button. */
  action?: ComponentType;
  children: EntityItem[];
}

export type EntityTreeItem = EntityItem | EntityGroup;

export const useEntityTreeItems = (): EntityGroup[] => {
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

  // Adding an entity is a mutation, so a presentation that hides authoring
  // chrome hides a group's Add button with it.
  const addAction = (action: ComponentType): ComponentType | undefined =>
    presentation.showMutationActions ? action : undefined;

  return [
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
            id: "group-types",
            name: "Token Types",
            emptyGroupMessage: "No token types",
            action: addAction(AddTypeAction),
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
            id: "group-equations",
            name: "Differential Equations",
            emptyGroupMessage: "No differential equations",
            action: addAction(AddDifferentialEquationAction),
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
            id: "group-parameters",
            name: "Parameters",
            emptyGroupMessage: "No parameters",
            action: addAction(AddParameterAction),
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
};
