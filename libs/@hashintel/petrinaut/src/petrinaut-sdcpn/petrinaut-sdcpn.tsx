import "reactflow/dist/style.css";
import "./index.css";

import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { Box, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection, NodeChange, ReactFlowInstance } from "reactflow";
import ReactFlow, {
  Background,
  ConnectionLineType,
  ReactFlowProvider,
} from "reactflow";

import { applyNodeChanges } from "./apply-node-changes";
import { Arc } from "./arc";
import { BottomBar } from "./components/bottom-bar";
import { FloatingTitle } from "./components/floating-title";
import { HamburgerMenu } from "./components/hamburger-menu";
import { ModeSelector } from "./components/mode-selector";
import { exampleSDCPN } from "./examples";
import { generateUuid } from "./lib/generate-uuid";
import { petriNetToSDCPN, sdcpnToPetriNet } from "./lib/sdcpn-converters";
import { PlaceNode } from "./place-node";
import {
  useEditorStore,
  useNodesWithDraggingState,
  useSDCPNStore,
} from "./state/mod";
import { nodeDimensions } from "./styling";
import { TransitionNode } from "./transition-node";
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
import { useLayoutGraph } from "./use-layout-graph";

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

export { nodeDimensions };

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
  const canvasContainer = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"edit" | "simulate">("edit");

  // SDCPN store
  const reactFlowInstance = useSDCPNStore((state) => state.reactFlowInstance);
  const setReactFlowInstance = useSDCPNStore(
    (state) => state.setReactFlowInstance,
  );
  const setSDCPN = useSDCPNStore((state) => state.setSDCPN);
  const setTokenTypes = useSDCPNStore((state) => state.setTokenTypes);
  const setLoadPetriNetInStore = useSDCPNStore(
    (state) => state.setLoadPetriNet,
  );
  const updatePlacePosition = useSDCPNStore(
    (state) => state.updatePlacePosition,
  );
  const updateTransitionPosition = useSDCPNStore(
    (state) => state.updateTransitionPosition,
  );
  const addPlace = useSDCPNStore((state) => state.addPlace);
  const addTransition = useSDCPNStore((state) => state.addTransition);
  const addArc = useSDCPNStore((state) => state.addArc);

  // Editor state
  const draggingStateByNodeId = useEditorStore(
    (state) => state.draggingStateByNodeId,
  );
  const updateDraggingStateByNodeId = useEditorStore(
    (state) => state.updateDraggingStateByNodeId,
  );
  const resetDraggingState = useEditorStore(
    (state) => state.resetDraggingState,
  );
  const clearSelection = useEditorStore((state) => state.clearSelection);

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

  const nodesForReactFlow = useNodesWithDraggingState(petriNetDefinition.nodes);

  // Reset dragging state when nodes change
  useEffect(() => {
    resetDraggingState();
  }, [petriNetDefinition.nodes, resetDraggingState]);

  const nodeTypes = useMemo(
    () => ({
      place: PlaceNode,
      transition: TransitionNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      default: Arc,
    }),
    [],
  );

  // Set initial viewport when reactFlowInstance is available
  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges({
        changes,
        draggingStateByNodeId,
        updatePlacePosition,
        updateTransitionPosition,
        updateDraggingStateByNodeId,
      });
    },
    [
      draggingStateByNodeId,
      updateDraggingStateByNodeId,
      updatePlacePosition,
      updateTransitionPosition,
    ],
  );

  const onEdgesChange = useCallback(() => {
    /**
     * There are no edge changes we need to process at the moment:
     * - We add arcs in onConnect, we won't don't process 'add'
     * - We don't allow removing arcs at the moment
     * - We handle selection in separate state when an edge is clicked
     * - Unclear what 'reset' is supposed to do
     */
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = petriNetDefinition.nodes.find(
        (node) => node.id === connection.source,
      );
      const targetNode = petriNetDefinition.nodes.find(
        (node) => node.id === connection.target,
      );

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Places can only connect to transitions and vice versa
      return sourceNode.type !== targetNode.type;
    },
    [petriNetDefinition.nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        return;
      }

      const source = connection.source ?? "";
      const target = connection.target ?? "";

      const sourceNode = petriNetDefinition.nodes.find(
        (node) => node.id === source,
      );
      const targetNode = petriNetDefinition.nodes.find(
        (node) => node.id === target,
      );

      if (!sourceNode || !targetNode) {
        return;
      }

      // Determine direction: place->transition or transition->place
      if (sourceNode.type === "place" && targetNode.type === "transition") {
        // Input arc: place to transition
        addArc(target, "input", source, 1);
      } else if (
        sourceNode.type === "transition" &&
        targetNode.type === "place"
      ) {
        // Output arc: transition to place
        addArc(source, "output", target, 1);
      }
    },
    [isValidConnection, petriNetDefinition.nodes, addArc],
  );

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance);
    },
    [setReactFlowInstance],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!reactFlowInstance || !canvasContainer.current) {
        return;
      }

      const reactFlowBounds = canvasContainer.current.getBoundingClientRect();
      const nodeType = event.dataTransfer.getData("application/reactflow") as
        | "place"
        | "transition";

      const { width, height } = nodeDimensions[nodeType];

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left - width / 2,
        y: event.clientY - reactFlowBounds.top - height / 2,
      });

      const id = `${nodeType}__${generateUuid()}`;
      const label = `${nodeType} ${petriNetDefinition.nodes.length + 1}`;

      if (nodeType === "place") {
        addPlace({
          id,
          name: label,
          dimensions: 1,
          differentialEquationCode: "",
          x: position.x,
          y: position.y,
          width,
          height,
        });
      } else {
        addTransition({
          id,
          name: label,
          inputArcs: [],
          outputArcs: [],
          lambdaCode: "",
          transitionKernelCode: "",
          x: position.x,
          y: position.y,
          width,
          height,
        });
      }
    },
    [
      reactFlowInstance,
      petriNetDefinition.nodes.length,
      addPlace,
      addTransition,
    ],
  );

  const layoutGraph = useLayoutGraph();

  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleLoadExample = useCallback(() => {
    const petriNetDef = sdcpnToPetriNet(exampleSDCPN);
    createNewNet({
      petriNetDefinition: petriNetDef,
      title: exampleSDCPN.title,
    });
  }, [createNewNet]);

  return (
    <Stack sx={{ height: "100%" }}>
      <Stack direction="row" sx={{ height: "100%", userSelect: "none" }}>
        <Box
          sx={{
            width: "100%",
            position: "relative",
            flexGrow: 1,
          }}
          ref={canvasContainer}
        >
          {/* Floating Hamburger Menu - Top Left */}
          {!hideNetManagementControls && (
            <div
              style={{
                position: "absolute",
                top: "24px",
                left: "24px",
                zIndex: 1000,
              }}
            >
              <HamburgerMenu
                menuItems={[
                  {
                    id: "new",
                    label: "New",
                    onClick: () => {},
                  },
                  {
                    id: "open",
                    label: "Open",
                    onClick: () => {},
                  },
                  {
                    id: "layout",
                    label: "Layout",
                    onClick: () => {
                      layoutGraph({
                        nodes: petriNetDefinition.nodes,
                        arcs: petriNetDefinition.arcs,
                        animationDuration: 200,
                      });
                    },
                  },
                  {
                    id: "save",
                    label: "Save",
                    onClick: () => {},
                  },
                  {
                    id: "export",
                    label: "Export",
                    onClick: () => {},
                  },
                  {
                    id: "import",
                    label: "Import",
                    onClick: () => {},
                  },
                  {
                    id: "load-example",
                    label: "Load Example",
                    onClick: () => {
                      handleLoadExample();
                    },
                  },
                ]}
              />
            </div>
          )}

          {/* Floating Title - Top Left (after hamburger) */}
          {!hideNetManagementControls && (
            <div
              style={{
                position: "absolute",
                top: "24px",
                left: "80px",
                zIndex: 1000,
              }}
            >
              <FloatingTitle
                value={title}
                onChange={setTitle}
                placeholder="Process"
              />
            </div>
          )}

          {/* Floating Mode Selector - Top Center */}
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
            }}
          >
            <ModeSelector mode={mode} onChange={setMode} />
          </div>

          {/* Properties Panel - Right Side */}
          <div
            style={{
              display: "flex",
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              padding: "24px",
              height: "calc(100% - 48px)",
              zIndex: 1000,
            }}
          >
            <RefractivePane
              radius={16}
              blur={7}
              specularOpacity={0.2}
              scaleRatio={1}
              bezelWidth={65}
              glassThickness={120}
              refractiveIndex={1.5}
              className={css({
                height: "100%",
                width: "320px",
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.8)",
              })}
              style={{
                borderRadius: 16,
                padding: 8,
              }}
            >
              Hello
            </RefractivePane>
          </div>

          <ReactFlow
            nodes={nodesForReactFlow}
            edges={petriNetDefinition.arcs}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onPaneClick={handlePaneClick}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            snapToGrid
            snapGrid={[15, 15]}
            connectionLineType={ConnectionLineType.SmoothStep}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={15} size={1} />
          </ReactFlow>

          <BottomBar />
        </Box>
      </Stack>
    </Stack>
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
