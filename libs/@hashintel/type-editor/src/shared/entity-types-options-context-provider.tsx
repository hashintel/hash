import {
  EntityTypesOptionsContext,
  useEntityTypesOptionsContextValue,
} from "./entity-types-options-context";

import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

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
