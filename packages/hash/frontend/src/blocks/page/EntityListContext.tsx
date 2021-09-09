// @todo delete this file
import { createContext } from "react";
import { EntityListType } from "@hashintel/hash-shared/entityList";

export const EntityListContext = createContext<Record<string, EntityListType>>(
  {}
);
