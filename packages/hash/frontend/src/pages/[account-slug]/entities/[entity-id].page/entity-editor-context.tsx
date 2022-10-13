import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { PropertySort } from "./property-table/types";

interface EntityEditorContextProps {
  entity: EntityResponse | undefined;
  setEntity: (entity: EntityResponse | undefined) => void;
  propertySort: PropertySort;
  setPropertySort: (sort: PropertySort) => void;
}

const initialSort: PropertySort = {
  key: "title",
  dir: "asc",
};

const EntityEditorContext = createContext<EntityEditorContextProps | null>(
  null,
);

export const EntityEditorContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [propertySort, setPropertySort] = useState<PropertySort>(initialSort);
  const [entity, setEntity] = useState<EntityResponse | undefined>(undefined);

  const state = useMemo(
    () => ({ entity, setEntity, propertySort, setPropertySort }),
    [entity, setEntity, propertySort, setPropertySort],
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
