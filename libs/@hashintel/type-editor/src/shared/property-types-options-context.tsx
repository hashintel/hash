import { PropertyType } from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { createContext, PropsWithChildren, useContext } from "react";

export type PropertyTypesByVersionedUri = Record<VersionedUri, PropertyType>;
export type PropertyTypesContextValue = PropertyTypesByVersionedUri;

export const PropertyTypesOptionsContext =
  createContext<PropertyTypesContextValue | null>(null);

export const PropertyTypesOptionsContextProvider = ({
  children,
  propertyTypeOptions,
}: PropsWithChildren<{ propertyTypeOptions: PropertyTypesByVersionedUri }>) => {
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
