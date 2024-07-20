import { createContext, useContext } from "react";
import type { EntityType } from "@blockprotocol/type-system";

export const EntityTypeContext = createContext<null | EntityType>(null);

export const useEntityType = () => {
  const entityTypeContext = useContext(EntityTypeContext);

  if (!entityTypeContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeContext;
};
