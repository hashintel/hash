import { use } from "react";

import { ActiveNetContext } from "../../../../../../../react/document/active-net-context";
import { useSDCPNState } from "../../../../../../../react/document/sdcpn-context";
import { usePetrinautPresentation } from "../../../../../../presentation/presentation-context";
import {
  AddDifferentialEquationAction,
  AddMetricAction,
  AddParameterAction,
  AddTypeAction,
} from "./add-entity-actions";
import {
  entityGroups,
  type EntityGroup,
  type EntityGroupId,
} from "./entity-groups";

import type { Metric } from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

const noMetrics: readonly Metric[] = [];

/** The Add button of each group that has one, by the group's id. */
const addActions: Partial<Record<EntityGroupId, ComponentType>> = {
  "group-types": AddTypeAction,
  "group-equations": AddDifferentialEquationAction,
  "group-parameters": AddParameterAction,
  "group-metrics": AddMetricAction,
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
    activeComponentId,
  } = use(ActiveNetContext);
  const extensions = useSDCPNState((document) => document.extensions);
  const metrics = useSDCPNState(
    (document) => document.petriNetDefinition.metrics,
  );
  const { showMutationActions } = usePetrinautPresentation();

  // Adding an entity is a mutation, so a presentation that hides authoring
  // chrome hides a group's Add button with it.
  return entityGroups(
    { places, transitions, types, differentialEquations, parameters },
    extensions,
    // Metrics read the root net, so only the root net lists them.
    activeComponentId === null ? (metrics ?? noMetrics) : undefined,
  ).map((group) => ({
    ...group,
    action: showMutationActions ? addActions[group.id] : undefined,
  }));
};
