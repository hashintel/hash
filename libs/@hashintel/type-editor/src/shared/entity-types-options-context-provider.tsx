import { useMemo } from "react";

import {
  EntityTypesOptionsContext,
  useEntityTypesOptionsContextValue,
} from "./entity-types-options-context";

import type { EntityTypePermissions } from "./entity-types-options-context";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

export const EntityTypesOptionsContextProvider = ({
  children,
  entityTypeOptions,
  entityTypePermissions,
}: PropsWithChildren<{
  entityTypeOptions: Record<VersionedUrl, EntityTypeWithMetadata>;
  entityTypePermissions?: Record<VersionedUrl, EntityTypePermissions>;
}>) => {
  const typeValue = useEntityTypesOptionsContextValue(entityTypeOptions);

  const value = useMemo(
    () => ({ ...typeValue, entityTypePermissions }),
    [typeValue, entityTypePermissions],
  );

  return (
    <EntityTypesOptionsContext.Provider value={value}>
      {children}
    </EntityTypesOptionsContext.Provider>
  );
};
