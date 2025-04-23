import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useMemo,
} from "react";
import { useLocalstorageState } from "rooks";

import { defaultTokenTypes } from "./token-type-editor";
import type { ArcType, NodeType, TokenType } from "./types";

type EditorContextValue = {
  nodes: NodeType[];
  setNodes: Dispatch<SetStateAction<NodeType[]>>;
  arcs: ArcType[];
  setArcs: Dispatch<SetStateAction<ArcType[]>>;
  tokenTypes: TokenType[];
  setTokenTypes: Dispatch<SetStateAction<TokenType[]>>;
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

export const EditorContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [nodes, setNodes] = useLocalstorageState<NodeType[]>(
    "petri-net-nodes",
    [],
  );
  const [arcs, setArcs] = useLocalstorageState<ArcType[]>("petri-net-arcs", []);

  const [tokenTypes, setTokenTypes] = useLocalstorageState<TokenType[]>(
    "petri-net-token-types",
    defaultTokenTypes,
  );

  const value = useMemo(
    () => ({ nodes, setNodes, arcs, setArcs, tokenTypes, setTokenTypes }),
    [nodes, setNodes, arcs, setArcs, tokenTypes, setTokenTypes],
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
