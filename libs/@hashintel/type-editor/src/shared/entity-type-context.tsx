import type { EntityType, PropertyType } from "@blockprotocol/type-system/slim";
import { createContext, useContext } from "react";

export const EntityTypeContext = createContext<null | {
  entityType: EntityType;
  latestPropertyTypes: Record<string, PropertyType>;
}>(null);

export const useEntityType = () => {
  const entityTypeContext = useContext(EntityTypeContext);

  if (!entityTypeContext) {
    throw new Error("no EntityTypeContext value has been provided");
  }

  return entityTypeContext;
};
