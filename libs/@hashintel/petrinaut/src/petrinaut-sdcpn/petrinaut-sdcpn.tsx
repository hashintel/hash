import "reactflow/dist/style.css";
import "./index.css";

import { EditorView } from "./editor-view";
import type {
  ArcData,
  ArcType,
  MinimalNetMetadata,
  NodeData,
  NodeType,
  ParentNet,
  PetriNetDefinitionObject,
  PlaceNodeData,
  PlaceNodeType,
  TokenCounts,
  TokenType,
  TransitionCondition,
  TransitionNodeData,
  TransitionNodeType,
} from "./types";

export type {
  ArcData,
  ArcType,
  MinimalNetMetadata,
  NodeData,
  NodeType,
  ParentNet,
  PetriNetDefinitionObject,
  PlaceNodeData,
  PlaceNodeType,
  TokenCounts,
  TokenType,
  TransitionCondition,
  TransitionNodeData,
  TransitionNodeType,
};

export { nodeDimensions } from "./styling";

export const PetrinautSDCPN = () => {
  return <EditorView />;
};
