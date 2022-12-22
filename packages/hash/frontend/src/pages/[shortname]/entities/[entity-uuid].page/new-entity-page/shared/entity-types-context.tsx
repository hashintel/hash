import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { createContext } from "react";

export type EntityTypesContextValues = {
  types: Record<VersionedUri, EntityType> | null;
};

export const EntityTypesContext =
  createContext<null | EntityTypesContextValues>(null);
