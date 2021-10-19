import { EntityStore } from "@hashintel/hash-shared/entityStore";
import { createContext } from "react";

export const EntityStoreContext = createContext<EntityStore>({
  saved: {},
  draft: null,
});
