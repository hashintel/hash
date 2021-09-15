import { createContext } from "react";
import { EntityStoreType } from "@hashintel/hash-shared/entityStore";

export const EntityStoreContext = createContext<
  Record<string, EntityStoreType>
>({});
