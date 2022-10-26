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
} from "../../../../../components/GlideGlid/utils";
import { EntityEditorProps } from "../entity-editor";
import { LinkColumnKey } from "./links-section/link-table/types";
import { PropertyColumnKey } from "./properties-section/property-table/types";

interface Props extends EntityEditorProps {
  propertySort: TableSort<PropertyColumnKey>;
  setPropertySort: SetTableSort<PropertyColumnKey>;
  linkSort: TableSort<LinkColumnKey>;
  setLinkSort: SetTableSort<LinkColumnKey>;
}

const EntityEditorContext = createContext<Props | null>(null);

export const EntityEditorContextProvider = ({
  rootEntityAndSubgraph,
  setEntity,
  children,
}: PropsWithChildren<EntityEditorProps>) => {
  const [propertySort, setPropertySort] = useState<Props["propertySort"]>({
    key: "title",
    dir: "asc",
  });

  const [linkSort, setLinkSort] = useState<Props["linkSort"]>({
    key: "type",
    dir: "asc",
  });

  const state = useMemo(
    () => ({
      rootEntityAndSubgraph,
      setEntity,
      propertySort,
      setPropertySort,
      linkSort,
      setLinkSort,
    }),
    [
      rootEntityAndSubgraph,
      setEntity,
      propertySort,
      setPropertySort,
      linkSort,
      setLinkSort,
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
