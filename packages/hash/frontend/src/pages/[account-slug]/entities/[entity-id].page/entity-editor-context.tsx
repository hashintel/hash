import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  SetTableSort,
  TableSort,
} from "../../../../components/GlideGlid/utils";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { LinkRow } from "./link-table/types";
import { PropertyRow } from "./property-table/types";

interface Props {
  entity: EntityResponse | undefined;
  setEntity: (entity: EntityResponse | undefined) => void;
  propertySort: TableSort<PropertyRow>;
  setPropertySort: SetTableSort<PropertyRow>;
  linkSort: TableSort<LinkRow>;
  setLinkSort: SetTableSort<LinkRow>;
}

const EntityEditorContext = createContext<Props | null>(null);

export const EntityEditorContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [propertySort, setPropertySort] = useState<Props["propertySort"]>({
    key: "title",
    dir: "asc",
  });

  const [linkSort, setLinkSort] = useState<Props["linkSort"]>({
    key: "type",
    dir: "asc",
  });

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
