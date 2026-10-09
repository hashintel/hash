import { createContext, useContext } from "react";

import type { EntityEditorProps } from "../entity-editor";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export type TableExpandStatus = Record<string, boolean>;

interface Props extends Omit<EntityEditorProps, "hasRootLinkDataBeenResolved"> {
  entity: HashEntity;
  isLocalDraftOnly: boolean;
  propertyExpandStatus: TableExpandStatus;
  togglePropertyExpand: (id: string) => void;
}

export const EntityEditorContext = createContext<Props | null>(null);

export const useEntityEditor = () => {
  const state = useContext(EntityEditorContext);

  if (state === null) {
    throw new Error("no value has been provided to EntityEditorContext");
  }

  return state;
};
