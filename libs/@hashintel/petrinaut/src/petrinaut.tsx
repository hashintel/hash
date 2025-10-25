import "reactflow/dist/style.css";

import { Box, Button, Stack } from "@mui/material";
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

import { applyNodeChanges } from "./petrinaut/apply-node-changes";
import { Arc } from "./petrinaut/arc";
import { ArcEditor } from "./petrinaut/arc-editor";
import { createArc } from "./petrinaut/create-arc";
import {
  EditorContextProvider,
  type MutatePetriNetDefinition,
  useEditorContext,
} from "./petrinaut/editor-context";
import { exampleCPN } from "./petrinaut/examples";
import { generateUuid } from "./petrinaut/generate-uuid";
import { LogPane } from "./petrinaut/log-pane";
import { PlaceEditor } from "./petrinaut/place-editor";
import { PlaceNode } from "./petrinaut/place-node";
import { Sidebar } from "./petrinaut/sidebar";
import { SimulationContextProvider } from "./petrinaut/simulation-context";
import { SimulationControls } from "./petrinaut/simulation-controls";
import { nodeDimensions } from "./petrinaut/styling";
import { TitleAndNetSelect } from "./petrinaut/title-and-net-select";
import { TokenTypes } from "./petrinaut/token-types";
import { defaultTokenTypes } from "./petrinaut/token-types/default-token-types";
import { TransitionEditor } from "./petrinaut/transition-editor";
import { TransitionNode } from "./petrinaut/transition-node";
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
} from "./petrinaut/types";
import { useConvertToPnml } from "./petrinaut/use-convert-to-pnml";
import { useLoadFromPnml } from "./petrinaut/use-load-from-pnml";

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

export { defaultTokenTypes };

export { NetSelector } from "./petrinaut/net-selector";

type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

const PetrinautInner = ({
  hideNetManagementControls,
}: { hideNetManagementControls: boolean }) => {
  const canvasContainer = useRef<HTMLDivElement>(null);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  const { createNewNet, petriNetDefinition, mutatePetriNetDefinition, title } =
    useEditorContext();

  const [selectedPlacePosition, setSelectedPlacePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(
    null,
  );

  const [selectedArc, setSelectedArc] = useState<
    (ArcType & { position: { x: number; y: number } }) | null
  >(null);

  /**
   * While a node is being dragged, we don't want to keep reporting position changes to the consumer,
   * but we need to track the fact it's being dragged and where it is currently for reactflow to use.
   * This state tracks that information.
   */
  const [draggingStateByNodeId, setDraggingStateByNodeId] =
    useState<DraggingStateByNodeId>({});

  useEffect(() => {
    setDraggingStateByNodeId({});
  }, [petriNetDefinition.nodes]);

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
        setDraggingStateByNodeId,
      });
    },
    [draggingStateByNodeId, mutatePetriNetDefinition],
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

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

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

      setSelectedPlaceId(null);
      setSelectedPlacePosition(null);
      setSelectedArc(null);
      setSelectedTransition(null);

      if (node.type === "place") {
        setSelectedPlaceId(node.id);
        setSelectedPlacePosition({ x: event.clientX, y: event.clientY });
      } else if (node.type === "transition") {
        setSelectedTransition(node.id);
      }
    },
    [selectedPlaceId],
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

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: ArcType) => {
    event.stopPropagation();

    setSelectedArc({
      ...edge,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

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

  const handlePaneClick = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedTransition(null);
    setSelectedArc(null);
  }, []);

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

  const convertToPnml = useConvertToPnml({
    petriNet: petriNetDefinition,
    title,
  });

  const handleExport = () => {
    const pnml = convertToPnml();

    const blob = new Blob([pnml], { type: "application/xml" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "process.pnml";

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  const loadFromPnml = useLoadFromPnml({
    createNewNet,
  });

  const handleLoadFromPnml = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const contents = readerEvent.target?.result;
        if (typeof contents === "string") {
          loadFromPnml(contents);
        }
      };
      reader.readAsText(file);
    },
    [loadFromPnml],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const selectedPlace = useMemo(() => {
    if (!selectedPlaceId) {
      return null;
    }

    const place = petriNetDefinition.nodes.find(
      (node): node is PlaceNodeType =>
        node.id === selectedPlaceId && node.data.type === "place",
    );

    if (!place) {
      throw new Error(`Cannot find place with id ${selectedPlaceId}`);
    }

    return place;
  }, [petriNetDefinition.nodes, selectedPlaceId]);

  const nodesForReactFlow = useMemo(() => {
    return petriNetDefinition.nodes.map((node) => {
      const draggingState = draggingStateByNodeId[node.id];

      return {
        ...node,
        // Fold in dragging state (the consumer isn't aware of it, as it's a transient property)
        dragging: draggingState?.dragging ?? false,
        position: draggingState?.dragging
          ? draggingState.position
          : node.position,
      };
    });
  }, [petriNetDefinition.nodes, draggingStateByNodeId]);

  return (
    <Stack sx={{ height: "100%" }}>
      {!hideNetManagementControls && <TitleAndNetSelect />}

      <Stack direction="row" sx={{ height: "100%", userSelect: "none" }}>
        <Sidebar />

        <Box
          sx={{
            width: "100%",
            position: "relative",
            flexGrow: 1,
          }}
          ref={canvasContainer}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{
              alignItems: "flex-start",
              position: "absolute",
              top: 0,
              left: 0,
              p: 2,
              zIndex: 100,
              width: "100%",
            }}
          >
            <TokenTypes />
            <SimulationControls />
          </Stack>

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

          <LogPane />

          {!hideNetManagementControls && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ position: "absolute", bottom: 16, right: 16, zIndex: 100 }}
            >
              <Button onClick={handleLoadExample} size="xs" variant="tertiary">
                Load Example
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLoadFromPnml}
                accept=".pnml,.xml"
                style={{ display: "none" }}
              />
              <Button onClick={handleImportClick} size="xs" variant="tertiary">
                Import
              </Button>
              <Button onClick={handleExport} size="xs" variant="tertiary">
                Export
              </Button>
              <Button
                onClick={() =>
                  createNewNet({
                    petriNetDefinition: {
                      arcs: [],
                      nodes: [],
                      tokenTypes: defaultTokenTypes,
                    },
                    title: "Process",
                  })
                }
                size="xs"
                variant="danger"
              >
                New
              </Button>
            </Stack>
          )}
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
        <SimulationContextProvider>
          <PetrinautInner
            hideNetManagementControls={hideNetManagementControls}
          />
        </SimulationContextProvider>
      </EditorContextProvider>
    </ReactFlowProvider>
  );
};
