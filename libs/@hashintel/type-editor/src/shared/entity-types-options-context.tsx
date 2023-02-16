import { EntityType, VersionedUri } from "@blockprotocol/type-system/slim";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { linkEntityTypeUri } from "./uris";

export type EntityTypesByVersionedUri = Record<VersionedUri, EntityType>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesByVersionedUri;
  linkTypes: EntityTypesByVersionedUri;
};

export const EntityTypesOptionsContext =
  createContext<EntityTypesContextValue | null>(null);

export const useEntityTypesOptionsContextValue = (
  entityTypes: Record<VersionedUri, EntityType>,
): EntityTypesContextValue => {
  return useMemo(() => {
    const linkEntityTypesRecord: EntityTypesByVersionedUri = {};
    const nonLinkEntityTypesRecord: EntityTypesByVersionedUri = {};

    for (const entityType of Object.values(entityTypes)) {
      const target =
        entityType.allOf?.length === 1 &&
        entityType.allOf[0]?.$ref === linkEntityTypeUri
          ? linkEntityTypesRecord
          : nonLinkEntityTypesRecord;

      target[entityType.$id] = entityType;
    }

    return {
      entityTypes: nonLinkEntityTypesRecord,
      linkTypes: linkEntityTypesRecord,
    };
  }, [entityTypes]);
};

export const EntityTypesOptionsContextProvider = ({
  children,
  entityTypeOptions,
}: PropsWithChildren<{
  entityTypeOptions: Record<VersionedUri, EntityType>;
}>) => {
  const value = useEntityTypesOptionsContextValue(entityTypeOptions);

  return (
    <EntityTypesOptionsContext.Provider value={value}>
      {children}
    </EntityTypesOptionsContext.Provider>
  );
};

export const useEntityTypesOptions = () => {
  const entityTypesOptionsContext = useContext(EntityTypesOptionsContext);

  if (!entityTypesOptionsContext) {
    throw new Error("no EntityTypesOptionsContext value has been provided");
  }

  return entityTypesOptionsContext;
};
