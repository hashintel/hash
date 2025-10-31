import { createContext, useContext, useMemo } from "react";

import type { MinimalNetMetadata, PetriNetDefinitionObject } from "./types";

export type MutatePetriNetDefinition = (
  mutationFn: (petriNetDefinition: PetriNetDefinitionObject) => undefined,
) => void;

type EditorContextValue = {
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  existingNets: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  petriNetId: string | null;
  petriNetDefinition: PetriNetDefinitionObject;
  readonly: boolean;
  mutatePetriNetDefinition: MutatePetriNetDefinition;
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
  petriNetId: string | null;
  petriNetDefinition: PetriNetDefinitionObject;
  mutatePetriNetDefinition: MutatePetriNetDefinition;
  loadPetriNet: (petriNetId: string) => void;
  readonly: boolean;
  setTitle: (title: string) => void;
  title: string;
};

export const EditorContextProvider = ({
  children,
  createNewNet,
  existingNets,
  petriNetId,
  petriNetDefinition,
  readonly,
  loadPetriNet,
  mutatePetriNetDefinition,
  setTitle,
  title,
}: EditorContextProviderProps) => {
  const value: EditorContextValue = useMemo(
    () => ({
      createNewNet,
      existingNets,
      loadPetriNet,
      petriNetId,
      petriNetDefinition,
      readonly,
      mutatePetriNetDefinition,
      setTitle,
      title,
    }),
    [
      createNewNet,
      existingNets,
      loadPetriNet,
      mutatePetriNetDefinition,
      petriNetId,
      petriNetDefinition,
      readonly,
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
