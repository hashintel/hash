import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useReactFlow } from "reactflow";

import type { MinimalNetMetadata, PetriNetDefinitionObject } from "./types";

export type ParentProcess = {
  parentProcessId: string;
  title: string;
};

type EditorContextValue = {
  childProcessOptions: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  parentProcess: ParentProcess | null;
  petriNetDefinition: PetriNetDefinitionObject;
  readonly: boolean;
  setParentProcess: Dispatch<SetStateAction<ParentProcess | null>>;
  setPetriNetDefinition: Dispatch<SetStateAction<PetriNetDefinitionObject>>;
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

type EditorContextProviderProps = {
  children: React.ReactNode;
  childProcessOptions: MinimalNetMetadata[];
  parentProcess: ParentProcess | null;
  petriNet: PetriNetDefinitionObject;
  setPetriNet: (petriNetDefinition: PetriNetDefinitionObject) => void;
  loadPetriNet: (petriNetId: string) => void;
  readonly: boolean;
};

export const EditorContextProvider = ({
  children,
  childProcessOptions,
  parentProcess: parentProcessFromProps,
  petriNet,
  readonly,
  loadPetriNet,
  setPetriNet,
}: EditorContextProviderProps) => {
  const [parentProcess, setParentProcess] = useState<{
    parentProcessId: string;
    title: string;
  } | null>(parentProcessFromProps);

  const { fitView } = useReactFlow();

  const setPetriNetDefinition: EditorContextValue["setPetriNetDefinition"] =
    useCallback(
      (setStateFnOrData) => {
        if (typeof setStateFnOrData === "function") {
          setPetriNet(setStateFnOrData(petriNet));
        } else {
          setPetriNet(setStateFnOrData);
        }

        setTimeout(() => {
          fitView({ duration: 200, padding: 0.03, maxZoom: 1 });
        }, 100);
      },
      [fitView, petriNet, setPetriNet],
    );

  const value: EditorContextValue = useMemo(
    () => ({
      childProcessOptions,
      loadPetriNet,
      parentProcess,
      petriNetDefinition: petriNet,
      readonly,
      setParentProcess,
      setPetriNetDefinition,
    }),
    [
      childProcessOptions,
      loadPetriNet,
      parentProcess,
      petriNet,
      readonly,
      setParentProcess,
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
