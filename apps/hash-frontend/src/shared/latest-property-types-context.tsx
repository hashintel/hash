import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { PropertyTypeWithMetadata } from "@local/hash-subgraph";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
} from "react";

import { isTypeArchived } from "./is-archived";
import { useLatestPropertyTypesContextValue } from "./latest-property-types-context/use-latest-property-types-context-value";

export type LatestPropertyTypesContextValues = {
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata> | null;
  refetch: () => Promise<void>;
};

export const LatestPropertyTypesContext =
  createContext<null | LatestPropertyTypesContextValues>(null);

export const useLatestPropertyTypes = (params?: {
  includeArchived?: boolean;
}) => {
  const { includeArchived = false } = params ?? {};
  const latestPropertyTypesContext = useContext(LatestPropertyTypesContext);

  if (!latestPropertyTypesContext) {
    throw new Error("Context missing");
  }

  return {
    ...latestPropertyTypesContext,
    propertyTypes:
      latestPropertyTypesContext.propertyTypes && !includeArchived
        ? Object.entries(latestPropertyTypesContext.propertyTypes)
            .filter(([_, propertyType]) => !isTypeArchived(propertyType))
            .reduce<LatestPropertyTypesContextValues["propertyTypes"]>(
              (prev, [propertyTypeId, propertyType]) => ({
                ...prev,
                [propertyTypeId]: propertyType,
              }),
              {},
            )
        : latestPropertyTypesContext.propertyTypes,
  };
};

export const useFetchLatestPropertyTypes = () => {
  return useLatestPropertyTypes().refetch;
};

export const LatestPropertyTypesContextProvider: FunctionComponent<
  { includeArchived?: boolean } & PropsWithChildren
> = ({ children, includeArchived }) => {
  const value = useLatestPropertyTypesContextValue({ includeArchived });

  return (
    <LatestPropertyTypesContext.Provider value={value}>
      {children}
    </LatestPropertyTypesContext.Provider>
  );
};
