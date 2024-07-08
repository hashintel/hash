import type { EntityTypeWithMetadata } from "@blockprotocol/graph";
import { atLeastOne } from "@blockprotocol/type-system";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import { linkEntityTypeUrl } from "./urls";

export type EntityTypesByVersionedUrl = Record<
  VersionedUrl,
  EntityTypeWithMetadata
>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesByVersionedUrl;
  linkTypes: EntityTypesByVersionedUrl;
};

export const EntityTypesOptionsContext =
  createContext<EntityTypesContextValue | null>(null);

export const useEntityTypesOptionsContextValue = (
  entityTypes: Record<VersionedUrl, EntityTypeWithMetadata>,
): EntityTypesContextValue => {
  return useMemo(() => {
    const linkEntityTypesRecord: EntityTypesByVersionedUrl = {};
    const nonLinkEntityTypesRecord: EntityTypesByVersionedUrl = {};

    for (const entityType of Object.values(entityTypes)) {
      let targetRecord =
        entityType.schema.$id === linkEntityTypeUrl
          ? linkEntityTypesRecord
          : nonLinkEntityTypesRecord;

      while (entityType.schema.allOf) {
        if (
          entityType.schema.allOf.find(({ $ref }) => $ref === linkEntityTypeUrl)
        ) {
          targetRecord = linkEntityTypesRecord;
          break;
        }
        entityType.schema.allOf = atLeastOne(
          entityType.schema.allOf.flatMap(({ $ref }) => {
            const parentEntityType = entityTypes[$ref];
            if (!parentEntityType) {
              throw new Error(
                `Entity type ${$ref} not found when looking up ancestors of ${entityType.schema.$id}`,
              );
            }
            return parentEntityType.schema.allOf ?? [];
          }),
        );
      }

      targetRecord[entityType.schema.$id] = entityType;
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
  entityTypeOptions: Record<VersionedUrl, EntityTypeWithMetadata>;
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
