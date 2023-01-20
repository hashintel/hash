import { EntityType, PropertyType } from "@blockprotocol/type-system";
import { Entity, Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { createContext, useContext } from "react";

export type EntityTypeEntitiesContextValue = {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<SubgraphRootTypes["entity"]>;
};

export const EntityTypeEntitiesContext =
  createContext<null | EntityTypeEntitiesContextValue>(null);

export const useEntityTypeEntities = () => {
  const entityTypeEntitiesContext = useContext(EntityTypeEntitiesContext);

  if (!entityTypeEntitiesContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeEntitiesContext;
};
