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
  rootEntityAndSubgraph,
  setEntity,
  children,
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
      rootEntityAndSubgraph,
      setEntity,
      propertyExpandStatus,
      togglePropertyExpand,
    }),
    [
      rootEntityAndSubgraph,
      setEntity,
      propertyExpandStatus,
      togglePropertyExpand,
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
