import { createContext } from "react";

import { EntityTypesContextValue } from "./context-types";

export const EntityTypesContext = createContext<EntityTypesContextValue | null>(
  null,
);
