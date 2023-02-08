import { EntityType, PropertyType } from "@blockprotocol/type-system";
import { createContext, useContext } from "react";

export const EntityTypeContext = createContext<null | {
  entityType: EntityType;
  latestPropertyTypes: Record<string, PropertyType>;
}>(null);

export const useEntityType = () => {
  const entityTypeContext = useContext(EntityTypeContext);

  if (!entityTypeContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeContext;
};
