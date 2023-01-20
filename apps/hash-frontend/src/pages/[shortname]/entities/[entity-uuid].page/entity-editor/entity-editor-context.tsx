import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { EntityEditorProps } from "../entity-editor";

export type TableExpandStatus = Record<string, boolean>;

interface Props extends EntityEditorProps {
  propertyExpandStatus: TableExpandStatus;
  togglePropertyExpand: (id: string) => void;
}

const EntityEditorContext = createContext<Props | null>(null);

export const EntityEditorContextProvider = ({
  entitySubgraph,
  setEntity,
  children,
  refetch,
  draftLinksToCreate,
  draftLinksToArchive,
  setDraftLinksToCreate,
  setDraftLinksToArchive,
}: PropsWithChildren<EntityEditorProps>) => {
  const [propertyExpandStatus, setPropertyExpandStatus] =
    useState<TableExpandStatus>({});

  const togglePropertyExpand = useCallback((id: string) => {
    setPropertyExpandStatus((status) => {
      return { ...status, [id]: !status[id] };
    });
  }, []);

  const state = useMemo(
    () => ({
      entitySubgraph,
      setEntity,
      propertyExpandStatus,
      togglePropertyExpand,
      draftLinksToCreate,
      setDraftLinksToCreate,
      draftLinksToArchive,
      setDraftLinksToArchive,
      refetch,
    }),
    [
      entitySubgraph,
      setEntity,
      propertyExpandStatus,
      togglePropertyExpand,
      draftLinksToCreate,
      setDraftLinksToCreate,
      draftLinksToArchive,
      setDraftLinksToArchive,
      refetch,
    ],
  );

  return (
    <EntityEditorContext.Provider value={state}>
      {children}
    </EntityEditorContext.Provider>
  );
};

export const useEntityEditor = () => {
  const state = useContext(EntityEditorContext);

  if (state === null) {
    throw new Error("no value has been provided to EntityEditorContext");
  }

  return state;
};
