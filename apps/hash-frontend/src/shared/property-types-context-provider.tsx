import { useCallback, useMemo, useState } from "react";

import { usePropertyTypesContextValue } from "./latest-property-types-context/use-property-types-context-value";
import { PropertyTypesContext } from "./property-types-context";

import type { FunctionComponent, PropsWithChildren } from "react";

export const PropertyTypesContextProvider: FunctionComponent<
  { includeArchived?: boolean } & PropsWithChildren
> = ({ children, includeArchived }) => {
  const [enabled, setEnabled] = useState(false);
  const ensureFetched = useCallback(() => setEnabled(true), []);
  const { propertyTypes, refetch } = usePropertyTypesContextValue({
    includeArchived,
    enabled,
  });
  const value = useMemo(
    () => ({ propertyTypes, refetch, ensureFetched }),
    [propertyTypes, refetch, ensureFetched],
  );

  return (
    <PropertyTypesContext.Provider value={value}>
      {children}
    </PropertyTypesContext.Provider>
  );
};
