import { usePropertyTypesContextValue } from "./latest-property-types-context/use-property-types-context-value";
import { PropertyTypesContext } from "./property-types-context";

import type { FunctionComponent, PropsWithChildren } from "react";

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
