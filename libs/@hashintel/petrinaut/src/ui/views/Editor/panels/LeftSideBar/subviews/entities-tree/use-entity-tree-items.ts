import { use } from "react";

import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { usePetrinautPresentation } from "../../../../../shared/presentation-context";
import { AddDifferentialEquationAction } from "./add-differential-equation-action";
import { AddParameterAction } from "./add-parameter-action";
import { AddTypeAction } from "./add-type-action";
import { entityGroups, type EntityGroup } from "./entity-groups";

import type { ComponentType } from "react";

/** The Add button of each group that has one, by the group's id. */
const addActions: Record<string, ComponentType | undefined> = {
  "group-types": AddTypeAction,
  "group-equations": AddDifferentialEquationAction,
  "group-parameters": AddParameterAction,
};

/** The groups of the active net's entities, each with its Add button. */
export const useEntityTreeItems = (): EntityGroup[] => {
  // The lists the groups are made of, and not the net: the net is a new
  // object when an instance or a fusion changes, which no group shows.
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
  const { showMutationActions } = usePetrinautPresentation();

  // Adding an entity is a mutation, so a presentation that hides authoring
  // chrome hides a group's Add button with it.
  return entityGroups(
    { places, transitions, types, differentialEquations, parameters },
    extensions,
  ).map((group) => ({
    ...group,
    action: showMutationActions ? addActions[group.id] : undefined,
  }));
};
