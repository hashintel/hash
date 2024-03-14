import { createContext } from "react";

import type { EntityTypesContextValue } from "./context-types";

export const EntityTypesContext = createContext<EntityTypesContextValue | null>(
  null,
);
