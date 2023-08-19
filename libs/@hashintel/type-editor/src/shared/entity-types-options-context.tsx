import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { linkEntityTypeUrl } from "./urls";

export type EntityTypesByVersionedUrl = Record<VersionedUrl, EntityType>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesByVersionedUrl;
  linkTypes: EntityTypesByVersionedUrl;
};

export const EntityTypesOptionsContext =
  createContext<EntityTypesContextValue | null>(null);

export const useEntityTypesOptionsContextValue = (
  entityTypes: Record<VersionedUrl, EntityType>,
): EntityTypesContextValue => {
  return useMemo(() => {
    const linkEntityTypesRecord: EntityTypesByVersionedUrl = {};
    const nonLinkEntityTypesRecord: EntityTypesByVersionedUrl = {};

    for (const entityType of Object.values(entityTypes)) {
      let targetRecord = nonLinkEntityTypesRecord;
      let parentRefObjects = entityType.allOf ?? [];
      while (parentRefObjects.length) {
        if (parentRefObjects.find(({ $ref }) => $ref === linkEntityTypeUrl)) {
          targetRecord = linkEntityTypesRecord;
          break;
        }
        parentRefObjects = parentRefObjects.flatMap(({ $ref }) => {
          const parentEntityType = entityTypes[$ref];
          if (!parentEntityType) {
            throw new Error(
              `Entity type ${$ref} not found when looking up ancestors of ${entityType.$id}`,
            );
          }
          return parentEntityType.allOf ?? [];
        });
      }

      targetRecord[entityType.$id] = entityType;
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
  entityTypeOptions: Record<VersionedUrl, EntityType>;
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
