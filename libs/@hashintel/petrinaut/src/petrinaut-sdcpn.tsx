import "reactflow/dist/style.css";
import "./petrinaut-sdcpn/index.css";

import { Box, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Connection,
  Node,
  NodeChange,
  ReactFlowInstance,
} from "reactflow";
import ReactFlow, {
  Background,
  ConnectionLineType,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";

import { applyNodeChanges } from "./petrinaut-sdcpn/apply-node-changes";
import { Arc } from "./petrinaut-sdcpn/arc";
import { ArcEditor } from "./petrinaut-sdcpn/arc-editor";
import { BottomBar } from "./petrinaut-sdcpn/components/bottom-bar";
import { FloatingTitle } from "./petrinaut-sdcpn/components/floating-title";
import { HamburgerMenu } from "./petrinaut-sdcpn/components/hamburger-menu";
import { ModeSelector } from "./petrinaut-sdcpn/components/mode-selector";
import { createArc } from "./petrinaut-sdcpn/create-arc";
import {
  EditorContextProvider,
  type MutatePetriNetDefinition,
  useEditorContext,
} from "./petrinaut-sdcpn/editor-context";
import { exampleCPN } from "./petrinaut-sdcpn/examples";
import { generateUuid } from "./petrinaut-sdcpn/lib/generate-uuid";
import { PlaceEditor } from "./petrinaut-sdcpn/place-editor";
import { PlaceNode } from "./petrinaut-sdcpn/place-node";
import {
  useEditorStore,
  useNodesWithDraggingState,
  useSelectedPlace,
} from "./petrinaut-sdcpn/state/mod";
import { nodeDimensions } from "./petrinaut-sdcpn/styling";
import { TransitionEditor } from "./petrinaut-sdcpn/transition-editor";
import { TransitionNode } from "./petrinaut-sdcpn/transition-node";
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
} from "./petrinaut-sdcpn/types";
import { useLayoutGraph } from "./petrinaut-sdcpn/use-layout-graph";

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

export { NetSelector } from "./petrinaut-sdcpn/net-selector";

const PetrinautInner = ({
  hideNetManagementControls,
}: { hideNetManagementControls: boolean }) => {
  const canvasContainer = useRef<HTMLDivElement>(null);

  const {
    createNewNet,
    petriNetDefinition,
    mutatePetriNetDefinition,
    setTitle,
    title,
  } = useEditorContext();

  const [mode, setMode] = useState<"edit" | "simulate">("edit");
  const [menuOpen, setMenuOpen] = useState(false);

  // Zustand store selectors
  const reactFlowInstance = useEditorStore((state) => state.reactFlowInstance);
  const setReactFlowInstance = useEditorStore(
    (state) => state.setReactFlowInstance,
  );
  const selectedPlaceId = useEditorStore((state) => state.selectedPlaceId);
  const setSelectedPlaceId = useEditorStore(
    (state) => state.setSelectedPlaceId,
  );
  const selectedPlacePosition = useEditorStore(
    (state) => state.selectedPlacePosition,
  );
  const setSelectedPlacePosition = useEditorStore(
    (state) => state.setSelectedPlacePosition,
  );
  const selectedTransition = useEditorStore(
    (state) => state.selectedTransition,
  );
  const setSelectedTransition = useEditorStore(
    (state) => state.setSelectedTransition,
  );
  const selectedArc = useEditorStore((state) => state.selectedArc);
  const setSelectedArc = useEditorStore((state) => state.setSelectedArc);
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

  const selectedPlace = useSelectedPlace(petriNetDefinition.nodes);

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

  const { setViewport } = useReactFlow();

  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, [setViewport]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges({
        changes,
        draggingStateByNodeId,
        mutatePetriNetDefinition,
        updateDraggingStateByNodeId,
      });
    },
    [
      draggingStateByNodeId,
      updateDraggingStateByNodeId,
      mutatePetriNetDefinition,
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
      if (isValidConnection(connection)) {
        const newArc: ArcType = {
          ...connection,
          id: `arc__${connection.source}-${connection.target}`,
          source: connection.source ?? "",
          target: connection.target ?? "",
          type: "default",
          data: {
            tokenWeights: { [petriNetDefinition.tokenTypes[0]!.id]: 1 },
          },
          interactionWidth: 8,
        };

        const addedArc = createArc(newArc, petriNetDefinition.arcs);

        if (!addedArc) {
          return;
        }

        mutatePetriNetDefinition((existingNet) => {
          existingNet.arcs.push(addedArc);
        });
      }
    },
    [
      petriNetDefinition.arcs,
      isValidConnection,
      petriNetDefinition.tokenTypes,
      mutatePetriNetDefinition,
    ],
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

      const newNode: NodeType = {
        id: `${nodeType}__${generateUuid()}`,
        type: nodeType,
        position,
        ...nodeDimensions[nodeType],
        data: {
          label: `${nodeType} ${petriNetDefinition.nodes.length + 1}`,
          ...(nodeType === "place"
            ? {
                type: "place",
                tokenCounts: {},
              }
            : { type: "transition" }),
        },
      };

      mutatePetriNetDefinition((existingNet) => {
        existingNet.nodes.push(newNode);
      });
    },
    [reactFlowInstance, petriNetDefinition.nodes, mutatePetriNetDefinition],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (selectedPlaceId && selectedPlaceId === node.id) {
        return;
      }

      clearSelection();

      if (node.type === "place") {
        setSelectedPlaceId(node.id);
        setSelectedPlacePosition({
          x: event.clientX,
          y: event.clientY,
        });
      } else if (node.type === "transition") {
        setSelectedTransition(node.id);
      }
    },
    [
      selectedPlaceId,
      clearSelection,
      setSelectedPlaceId,
      setSelectedPlacePosition,
      setSelectedTransition,
    ],
  );

  const handleUpdateInitialTokens = useCallback(
    (nodeId: string, initialTokenCounts: TokenCounts) => {
      mutatePetriNetDefinition((existingNet) => {
        for (const node of existingNet.nodes) {
          if (node.id === nodeId && node.data.type === "place") {
            // @todo don't overwrite the whole object, update what has changed only
            node.data.initialTokenCounts = initialTokenCounts;
            return;
          }
        }
      });
    },
    [mutatePetriNetDefinition],
  );

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      mutatePetriNetDefinition((existingNet) => {
        for (const node of existingNet.nodes) {
          if (node.id === nodeId) {
            node.data.label = label;
            return;
          }
        }
      });
    },
    [mutatePetriNetDefinition],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: ArcType) => {
      event.stopPropagation();

      setSelectedArc({
        ...edge,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [setSelectedArc],
  );

  const handleUpdateEdgeWeight = useCallback(
    (
      edgeId: string,
      tokenWeights: { [tokenTypeId: string]: number | undefined },
    ) => {
      mutatePetriNetDefinition((existingNet) => {
        for (const arc of existingNet.arcs) {
          if (arc.id === edgeId) {
            // @todo don't overwrite the whole object, update what has changed only
            arc.data ??= { tokenWeights: {} };
            arc.data.tokenWeights = tokenWeights;
            return;
          }
        }
      });
    },
    [mutatePetriNetDefinition],
  );

  const layoutGraph = useLayoutGraph();

  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleUpdateTransition = useCallback(
    (
      transitionId: string,
      transitionData: Omit<TransitionNodeData, "type">,
    ) => {
      mutatePetriNetDefinition((existingNet) => {
        const transitionNode = existingNet.nodes.find(
          (node): node is TransitionNodeType =>
            node.id === transitionId && node.type === "transition",
        );

        if (!transitionNode) {
          throw new Error(`Transition node with id ${transitionId} not found`);
        }

        if (transitionData.label !== transitionNode.data.label) {
          transitionNode.data.label = transitionData.label;
        }

        if (transitionData.description !== transitionNode.data.description) {
          transitionNode.data.description = transitionData.description;
        }

        if (transitionData.delay !== transitionNode.data.delay) {
          transitionNode.data.delay = transitionData.delay;
        }

        if (transitionData.childNet !== transitionNode.data.childNet) {
          // @todo check equality of nested fields
          transitionNode.data.childNet = transitionData.childNet;
        }

        if (transitionData.conditions !== transitionNode.data.conditions) {
          // @todo check equality of nested fields
          transitionNode.data.conditions = transitionData.conditions;
        }
      });
    },
    [mutatePetriNetDefinition],
  );

  const handleLoadExample = useCallback(() => {
    createNewNet({
      petriNetDefinition: {
        arcs: exampleCPN.arcs,
        nodes: exampleCPN.nodes,
        tokenTypes: exampleCPN.tokenTypes,
      },
      title: exampleCPN.title,
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

          {selectedTransition && (
            <TransitionEditor
              open
              onClose={() => setSelectedTransition(null)}
              transitionId={selectedTransition}
              outgoingEdges={petriNetDefinition.arcs
                .filter((edge) => edge.source === selectedTransition)
                .map((edge) => {
                  const targetNode = petriNetDefinition.nodes.find(
                    (node) => node.id === edge.target,
                  );
                  return {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    targetLabel: targetNode?.data.label ?? "Unknown",
                    tokenWeights: edge.data?.tokenWeights ?? {},
                  };
                })}
              onUpdateTransition={handleUpdateTransition}
            />
          )}

          {selectedPlace && (
            <PlaceEditor
              position={selectedPlacePosition ?? { x: 0, y: 0 }}
              selectedPlace={selectedPlace}
              tokenTypes={petriNetDefinition.tokenTypes}
              onClose={() => setSelectedPlaceId(null)}
              onUpdateInitialTokens={handleUpdateInitialTokens}
              onUpdateNodeLabel={handleUpdateNodeLabel}
            />
          )}

          {selectedArc && (
            <ArcEditor
              arcId={selectedArc.id}
              tokenWeights={selectedArc.data?.tokenWeights ?? {}}
              position={selectedArc.position}
              onClose={() => setSelectedArc(null)}
              onUpdateWeights={handleUpdateEdgeWeight}
            />
          )}

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
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
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
   * Nets other than this one which are available for selection, e.g. to switch to or to link from a transition.
   */
  existingNets: MinimalNetMetadata[];
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
   * Minimal metadata on the net which this net is a child of, if any.
   */
  parentNet: ParentNet | null;
  /**
   * The ID of the net which is currently loaded.
   */
  petriNetId: string | null;
  /**
   * The definition of the net which is currently loaded.
   */
  petriNetDefinition: PetriNetDefinitionObject;
  /**
   * Update the definition of the net which is currently loaded, by mutation.
   *
   * Should not return anything – the consumer of Petrinaut must pass mutationFn into an appropriate helper
   * which does something with the mutated object, e.g. `immer`'s `produce` or `@automerge/react`'s `changeDoc`.
   *
   * @example
   *   mutatePetriNetDefinition((petriNetDefinition) => {
   *     petriNetDefinition.nodes.push({
   *       id: "new-node",
   *       type: "place",
   *       position: { x: 0, y: 0 },
   *     });
   *   });
   *
   * @see https://immerjs.github.io/immer
   * @see https://automerge.org
   */
  mutatePetriNetDefinition: MutatePetriNetDefinition;
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
  existingNets,
  hideNetManagementControls,
  parentNet,
  petriNetId,
  petriNetDefinition,
  mutatePetriNetDefinition,
  loadPetriNet,
  setTitle,
  title,
}: PetrinautProps) => {
  return (
    <ReactFlowProvider>
      <EditorContextProvider
        createNewNet={createNewNet}
        existingNets={existingNets}
        parentNet={parentNet}
        petriNetId={petriNetId}
        petriNetDefinition={petriNetDefinition}
        mutatePetriNetDefinition={mutatePetriNetDefinition}
        loadPetriNet={loadPetriNet}
        // @todo add readonly prop and turn off editing everything when true
        readonly={false}
        setTitle={setTitle}
        title={title}
      >
        <PetrinautInner hideNetManagementControls={hideNetManagementControls} />
      </EditorContextProvider>
    </ReactFlowProvider>
  );
};
