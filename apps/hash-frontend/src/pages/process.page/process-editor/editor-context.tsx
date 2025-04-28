import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { useReactFlow } from "reactflow";
import { useLocalstorageState } from "rooks";

import { defaultTokenTypes } from "./token-types";
import type { ArcType, NodeType, TokenType } from "./types";

type EditorContextValue = {
  nodes: NodeType[];
  setNodes: Dispatch<SetStateAction<NodeType[]>>;
  arcs: ArcType[];
  setArcs: Dispatch<SetStateAction<ArcType[]>>;
  tokenTypes: TokenType[];
  setTokenTypes: Dispatch<SetStateAction<TokenType[]>>;
  setGraph: (params: {
    nodes: NodeType[];
    arcs: ArcType[];
    title: string;
    tokenTypes: TokenType[];
  }) => void;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
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

  const [title, setTitle] = useLocalstorageState<string>(
    "petri-net-title",
    "Process",
  );

  const { fitView } = useReactFlow();

  const setGraph: EditorContextValue["setGraph"] = useCallback(
    ({
      nodes: newNodes,
      arcs: newArcs,
      tokenTypes: newTokenTypes,
      title: newTitle,
    }) => {
      /**
       * We flush this update first because reactflow seems to take an extra render to clear the nodes and edges,
       * and there's a crash if the token types are cleared in the same cycle as the nodes/arcs (which depend on the types).
       */
      flushSync(() => {
        setNodes(newNodes);
        setArcs(newArcs);
        setTitle(newTitle);
      });

      setTokenTypes(newTokenTypes);

      setTimeout(() => {
        fitView({ duration: 200, padding: 0.03, maxZoom: 1 });
      }, 100);
    },
    [setNodes, setArcs, setTokenTypes, setTitle, fitView],
  );

  const value: EditorContextValue = useMemo(
    () => ({
      setGraph,
      nodes,
      setNodes,
      arcs,
      setArcs,
      tokenTypes,
      setTokenTypes,
      title,
      setTitle,
    }),
    [
      setGraph,
      nodes,
      arcs,
      tokenTypes,
      setTokenTypes,
      setNodes,
      setArcs,
      title,
      setTitle,
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
