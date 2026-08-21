import { createContext, useContext } from "react";

import type {
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type PropertyTypesByVersionedUrl = Record<
  VersionedUrl,
  PropertyTypeWithMetadata
>;
export type PropertyTypesContextValue = PropertyTypesByVersionedUrl;

export const PropertyTypesOptionsContext =
  createContext<PropertyTypesContextValue | null>(null);

export const usePropertyTypesOptions = () => {
  const propertyTypesOptions = useContext(PropertyTypesOptionsContext);

  if (!propertyTypesOptions) {
    throw new Error("no PropertyTypesOptionsContext value has been provided");
  }

  return propertyTypesOptions;
};
