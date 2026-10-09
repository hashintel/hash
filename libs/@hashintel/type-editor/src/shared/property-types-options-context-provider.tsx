import {
  PropertyTypesOptionsContext,
  type PropertyTypesByVersionedUrl,
} from "./property-types-options-context";

import type { PropsWithChildren } from "react";

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
