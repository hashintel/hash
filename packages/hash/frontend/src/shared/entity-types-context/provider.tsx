import { PropsWithChildren } from "react";

import { useEntityTypesContextValue } from "./provider/use-entity-types-context-value";
import { EntityTypesContext } from "./shared/context";

export const EntityTypesContextProvider = ({ children }: PropsWithChildren) => {
  const value = useEntityTypesContextValue();

  return (
    <EntityTypesContext.Provider value={value}>
      {children}
    </EntityTypesContext.Provider>
  );
};
