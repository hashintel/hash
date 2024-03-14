import type { PropertyTypeWithMetadata } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";

export type PropertyTypesByVersionedUrl = Record<
  VersionedUrl,
  PropertyTypeWithMetadata
>;
export type PropertyTypesContextValue = PropertyTypesByVersionedUrl;

export const PropertyTypesOptionsContext =
  createContext<PropertyTypesContextValue | null>(null);

export const PropertyTypesOptionsContextProvider = ({
  children,
  propertyTypeOptions,
}: PropsWithChildren<{ propertyTypeOptions: PropertyTypesByVersionedUrl }>) => {
  return (
    <PropertyTypesOptionsContext.Provider value={propertyTypeOptions}>
      {children}
    </PropertyTypesOptionsContext.Provider>
  );
};

export const usePropertyTypesOptions = () => {
  const propertyTypesOptions = useContext(PropertyTypesOptionsContext);

  if (!propertyTypesOptions) {
    throw new Error("no PropertyTypesOptionsContext value has been provided");
  }

  return propertyTypesOptions;
};
