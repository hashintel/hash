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
  childNetOptions: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  parentNet: ParentNet | null;
  petriNetDefinition: PetriNetDefinitionObject;
  readonly: boolean;
  setParentNet: Dispatch<SetStateAction<ParentNet | null>>;
  setPetriNetDefinition: Dispatch<SetStateAction<PetriNetDefinitionObject>>;
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

type EditorContextProviderProps = {
  children: React.ReactNode;
  childNetOptions: MinimalNetMetadata[];
  parentNet: ParentNet | null;
  petriNet: PetriNetDefinitionObject;
  setPetriNet: (petriNetDefinition: PetriNetDefinitionObject) => void;
  loadPetriNet: (petriNetId: string) => void;
  readonly: boolean;
};

export const EditorContextProvider = ({
  children,
  childNetOptions,
  parentNet: parentNetFromProps,
  petriNet,
  readonly,
  loadPetriNet,
  setPetriNet,
}: EditorContextProviderProps) => {
  const [parentNet, setParentNet] = useState<ParentNet | null>(
    parentNetFromProps,
  );

  const setPetriNetDefinition: EditorContextValue["setPetriNetDefinition"] =
    useCallback(
      (setStateFnOrData) => {
        if (typeof setStateFnOrData === "function") {
          setPetriNet(setStateFnOrData(petriNet));
        } else {
          setPetriNet(setStateFnOrData);
        }
      },
      [petriNet, setPetriNet],
    );

  const value: EditorContextValue = useMemo(
    () => ({
      childNetOptions,
      loadPetriNet,
      parentNet,
      petriNetDefinition: petriNet,
      readonly,
      setParentNet,
      setPetriNetDefinition,
    }),
    [
      childNetOptions,
      loadPetriNet,
      parentNet,
      petriNet,
      readonly,
      setParentNet,
      setPetriNetDefinition,
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
