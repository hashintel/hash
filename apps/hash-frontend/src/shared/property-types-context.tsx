import { BaseUrl } from "@blockprotocol/type-system";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { PropertyTypeWithMetadata } from "@local/hash-subgraph";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useMemo,
} from "react";

import { isTypeArchived } from "./is-archived";
import { usePropertyTypesContextValue } from "./latest-property-types-context/use-property-types-context-value";

export type PropertyTypesContextValues = {
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata> | null;
  refetch: () => Promise<void>;
};

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = (params?: {
  includeArchived?: boolean;
  latestOnly?: boolean;
}) => {
  const { includeArchived = false, latestOnly = false } = params ?? {};
  const propertyTypesContext = useContext(PropertyTypesContext);

  if (!propertyTypesContext) {
    throw new Error("Context missing");
  }

  return useMemo(() => {
    const filteredPropertyTypeVersionsByBaseUrl: Record<
      BaseUrl,
      PropertyTypeWithMetadata[]
    > = {};
    for (const propertyType of Object.values(
      propertyTypesContext.propertyTypes ?? [],
    )) {
      if (!includeArchived && isTypeArchived(propertyType)) {
        continue;
      }

      const {
        metadata: {
          recordId: { baseUrl, version },
        },
      } = propertyType;

      if (latestOnly) {
        const firstVersionHeld =
          filteredPropertyTypeVersionsByBaseUrl[baseUrl]?.[0];
        if (
          firstVersionHeld &&
          firstVersionHeld.metadata.recordId.version > version
        ) {
          continue;
        }
        filteredPropertyTypeVersionsByBaseUrl[baseUrl] = [propertyType];
      } else {
        filteredPropertyTypeVersionsByBaseUrl[baseUrl] ??= [];
        filteredPropertyTypeVersionsByBaseUrl[baseUrl]!.push(propertyType);
      }
    }

    const propertyTypes: PropertyTypesContextValues["propertyTypes"] = {};
    for (const propertyTypeVersions of Object.values(
      filteredPropertyTypeVersionsByBaseUrl,
    )) {
      for (const propertyType of propertyTypeVersions) {
        propertyTypes[propertyType.schema.$id] = propertyType;
      }
    }

    return {
      ...propertyTypesContext,
      propertyTypes: propertyTypesContext.propertyTypes ? propertyTypes : null,
    };
  }, [propertyTypesContext, includeArchived, latestOnly]);
};

export const useRefetchPropertyTypes = () => {
  return usePropertyTypes().refetch;
};

export const PropertyTypesContextProvider: FunctionComponent<
  { includeArchived?: boolean } & PropsWithChildren
> = ({ children, includeArchived }) => {
  const value = usePropertyTypesContextValue({ includeArchived });

  return (
    <PropertyTypesContext.Provider value={value}>
      {children}
    </PropertyTypesContext.Provider>
  );
};
