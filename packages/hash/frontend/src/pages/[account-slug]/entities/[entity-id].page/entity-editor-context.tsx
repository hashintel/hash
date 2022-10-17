import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { LinkSort } from "./link-table/types";
import { PropertySort } from "./property-table/types";

interface EntityEditorContextProps {
  entity: EntityResponse | undefined;
  setEntity: (entity: EntityResponse | undefined) => void;
  propertySort: PropertySort;
  setPropertySort: (sort: PropertySort) => void;
  linkSort: LinkSort;
  setLinkSort: (sort: LinkSort) => void;
}

const initialPropertySort: PropertySort = {
  key: "title",
  dir: "asc",
};

const initialLinkSort: LinkSort = {
  key: "type",
  dir: "asc",
};

const EntityEditorContext = createContext<EntityEditorContextProps | null>(
  null,
);

export const EntityEditorContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [propertySort, setPropertySort] =
    useState<PropertySort>(initialPropertySort);
  const [linkSort, setLinkSort] = useState<LinkSort>(initialLinkSort);
  const [entity, setEntity] = useState<EntityResponse | undefined>(undefined);

  const state = useMemo(
    () => ({
      entity,
      setEntity,
      propertySort,
      setPropertySort,
      linkSort,
      setLinkSort,
    }),
    [entity, setEntity, propertySort, setPropertySort, linkSort, setLinkSort],
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
