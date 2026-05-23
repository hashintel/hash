import { useEntityTypesContextValue } from "./provider/use-entity-types-context-value";
import { EntityTypesContext } from "./shared/context";

import type { PropsWithChildren } from "react";

export const EntityTypesContextProvider = ({ children }: PropsWithChildren) => {
  const value = useEntityTypesContextValue();

  return <EntityTypesContext.Provider value={value}>{children}</EntityTypesContext.Provider>;
};
