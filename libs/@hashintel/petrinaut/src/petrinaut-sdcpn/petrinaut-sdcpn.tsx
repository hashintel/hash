import "reactflow/dist/style.css";
import "./index.css";

import { useEffect } from "react";
import { ReactFlowProvider } from "reactflow";

import { EditorView } from "./editor-view";
import { petriNetToSDCPN } from "./lib/sdcpn-converters";
import { useSDCPNStore } from "./state/mod";
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

type PetrinautInnerProps = {
  hideNetManagementControls: boolean;
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  petriNetDefinition: PetriNetDefinitionObject;
  petriNetId: string | null;
  title: string;
  setTitle: (title: string) => void;
  loadPetriNet: (petriNetId: string) => void;
};

const PetrinautInner = ({
  hideNetManagementControls,
  createNewNet,
  petriNetDefinition,
  petriNetId,
  title,
  setTitle,
  loadPetriNet,
}: PetrinautInnerProps) => {
  // SDCPN store
  const setSDCPN = useSDCPNStore((state) => state.setSDCPN);
  const setTokenTypes = useSDCPNStore((state) => state.setTokenTypes);
  const setLoadPetriNetInStore = useSDCPNStore(
    (state) => state.setLoadPetriNet,
  );

  // Initialize SDCPN from petriNetDefinition when it changes
  useEffect(() => {
    const sdcpn = petriNetToSDCPN(
      petriNetDefinition,
      petriNetId ?? "unknown",
      title,
    );
    setSDCPN(sdcpn);
    setTokenTypes(petriNetDefinition.tokenTypes);
    setLoadPetriNetInStore(loadPetriNet);
  }, [
    petriNetId,
    petriNetDefinition,
    title,
    setSDCPN,
    setTokenTypes,
    setLoadPetriNetInStore,
    loadPetriNet,
  ]);

  return (
    <EditorView
      hideNetManagementControls={hideNetManagementControls}
      createNewNet={createNewNet}
      title={title}
      setTitle={setTitle}
      nodes={petriNetDefinition.nodes}
      arcs={petriNetDefinition.arcs}
    />
  );
};

export type PetrinautProps = {
  /**
   * Create a new net and load it into the editor.
   */
  createNewNet: (params: {
    petriNetDefinition: PetriNetDefinitionObject;
    title: string;
  }) => void;
  /**
   * Whether to hide controls relating to net loading, creation and title setting.
   */
  hideNetManagementControls: boolean;
  /**
   * The ID of the net which is currently loaded.
   */
  petriNetId: string | null;
  /**
   * The definition of the net which is currently loaded.
   */
  petriNetDefinition: PetriNetDefinitionObject;
  /**
   * Load a new net by id.
   */
  loadPetriNet: (petriNetId: string) => void;
  /**
   * Set the title of the net which is currently loaded.
   */
  setTitle: (title: string) => void;
  /**
   * The title of the net which is currently loaded.
   */
  title: string;
};

export const Petrinaut = ({
  createNewNet,
  hideNetManagementControls,
  petriNetId,
  petriNetDefinition,
  loadPetriNet,
  setTitle,
  title,
}: PetrinautProps) => {
  return (
    <ReactFlowProvider>
      <PetrinautInner
        hideNetManagementControls={hideNetManagementControls}
        createNewNet={createNewNet}
        petriNetDefinition={petriNetDefinition}
        petriNetId={petriNetId}
        title={title}
        setTitle={setTitle}
        loadPetriNet={loadPetriNet}
      />
    </ReactFlowProvider>
  );
};
