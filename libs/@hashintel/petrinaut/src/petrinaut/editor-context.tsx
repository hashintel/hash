import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type {
  MinimalNetMetadata,
  ParentNet,
  PetriNetDefinitionObject,
} from "./types";

type EditorContextValue = {
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  existingNets: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  parentNet: ParentNet | null;
  petriNetId: string | null;
  petriNetDefinition: PetriNetDefinitionObject;
  readonly: boolean;
  setParentNet: Dispatch<SetStateAction<ParentNet | null>>;
  setPetriNetDefinition: Dispatch<SetStateAction<PetriNetDefinitionObject>>;
  setTitle: (title: string) => void;
  title: string;
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

type EditorContextProviderProps = {
  children: React.ReactNode;
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  existingNets: MinimalNetMetadata[];
  parentNet: ParentNet | null;
  petriNetId: string | null;
  petriNetDefinition: PetriNetDefinitionObject;
  setPetriNetDefinition: (petriNetDefinition: PetriNetDefinitionObject) => void;
  loadPetriNet: (petriNetId: string) => void;
  readonly: boolean;
  setTitle: (title: string) => void;
  title: string;
};

export const EditorContextProvider = ({
  children,
  createNewNet,
  existingNets,
  parentNet: parentNetFromProps,
  petriNetId,
  petriNetDefinition,
  readonly,
  loadPetriNet,
  setPetriNetDefinition,
  setTitle,
  title,
}: EditorContextProviderProps) => {
  const [parentNet, setParentNet] = useState<ParentNet | null>(
    parentNetFromProps,
  );

  const setDefinition: EditorContextValue["setPetriNetDefinition"] =
    useCallback(
      (setStateFnOrData) => {
        if (typeof setStateFnOrData === "function") {
          setPetriNetDefinition(setStateFnOrData(petriNetDefinition));
        } else {
          setPetriNetDefinition(setStateFnOrData);
        }
      },
      [petriNetDefinition, setPetriNetDefinition],
    );

  const value: EditorContextValue = useMemo(
    () => ({
      createNewNet,
      existingNets,
      loadPetriNet,
      parentNet,
      petriNetId,
      petriNetDefinition,
      readonly,
      setParentNet,
      setPetriNetDefinition: setDefinition,
      setTitle,
      title,
    }),
    [
      createNewNet,
      existingNets,
      loadPetriNet,
      parentNet,
      petriNetId,
      petriNetDefinition,
      readonly,
      setParentNet,
      setDefinition,
      setTitle,
      title,
    ],
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
};

export const useEditorContext = () => {
  const context = useContext(EditorContext);

  if (!context) {
    throw new Error(
      "useEditorContext must be used within an EditorContextProvider",
    );
  }

  return context;
};
