import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

interface EntityEditorContextProps {
  entity: EntityResponse | undefined;
  setEntity: (entity: EntityResponse | undefined) => void;
}

export const EntityEditorContext =
  createContext<EntityEditorContextProps | null>(null);

export const EntityEditorContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [entity, setEntity] = useState<EntityResponse | undefined>(undefined);

  const state = useMemo(() => ({ entity, setEntity }), [entity, setEntity]);

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
