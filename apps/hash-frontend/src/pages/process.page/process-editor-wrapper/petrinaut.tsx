import "reactflow/dist/style.css";

import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Box, Button, Stack } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Connection,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from "reactflow";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionLineType,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";

import { Arc } from "./petrinaut/arc";
import { ArcEditor } from "./petrinaut/arc-editor";
import {
  EditorContextProvider,
  useEditorContext,
} from "./petrinaut/editor-context";
import { exampleCPN } from "./petrinaut/examples";
import { LogPane } from "./petrinaut/log-pane";
import { PlaceEditor } from "./petrinaut/place-editor";
import { PlaceNode } from "./petrinaut/place-node";
import { Sidebar } from "./petrinaut/sidebar";
import {
  SimulationContextProvider,
  useSimulationContext,
} from "./petrinaut/simulation-context";
import { SimulationControls } from "./petrinaut/simulation-controls";
import { nodeDimensions } from "./petrinaut/styling";
import { TitleAndNetSelect } from "./petrinaut/title-and-net-select";
import { defaultTokenTypes, TokenTypes } from "./petrinaut/token-types";
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

export { NetSelector } from "./petrinaut/net-selector";

const PetrinautInner = () => {
  const canvasContainer = useRef<HTMLDivElement>(null);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  const { createNewNet, petriNetDefinition, setPetriNetDefinition, title } =
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
      setPetriNetDefinition((existingNet) => ({
        ...existingNet,
        nodes: applyNodeChanges(changes, existingNet.nodes),
      }));
    },
    [setPetriNetDefinition],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setPetriNetDefinition((existingNet) => ({
        ...existingNet,
        arcs: applyEdgeChanges(changes, existingNet.arcs),
      }));
    },
    [setPetriNetDefinition],
  );

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
        const newEdge: ArcType = {
          ...connection,
          id: `${connection.source}-${connection.target}`,
          source: connection.source ?? "",
          target: connection.target ?? "",
          type: "default",
          data: {
            tokenWeights: { [petriNetDefinition.tokenTypes[0]!.id]: 1 },
          },
          interactionWidth: 8,
        };
        setPetriNetDefinition((existingNet) => ({
          ...existingNet,
          arcs: addEdge(newEdge, existingNet.arcs),
        }));
      }
    },
    [isValidConnection, petriNetDefinition.tokenTypes, setPetriNetDefinition],
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
        id: `${nodeType}_${generateUuid()}`,
        type: nodeType,
        position,
        ...nodeDimensions[nodeType],
        data: {
          label: `${nodeType} ${petriNetDefinition.nodes.length + 1}`,
          ...(nodeType === "place"
            ? {
                type: "place",
                tokenCounts: {},
                tokenTypes: petriNetDefinition.tokenTypes,
              }
            : { type: "transition" }),
        },
      };

      setPetriNetDefinition((existingNet) => ({
        ...existingNet,
        nodes: existingNet.nodes.concat(newNode),
      }));
    },
    [
      reactFlowInstance,
      petriNetDefinition.nodes,
      petriNetDefinition.tokenTypes,
      setPetriNetDefinition,
    ],
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
      setPetriNetDefinition((existingNet) => {
        const newNodes = existingNet.nodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                initialTokenCounts,
                tokenTypes: existingNet.tokenTypes,
              },
            };
          }
          return node;
        });

        return {
          ...existingNet,
          nodes: newNodes,
        };
      });
    },
    [setPetriNetDefinition],
  );

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setPetriNetDefinition((existingNet) => {
        const newNodes = existingNet.nodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                label,
              },
            };
          }
          return node;
        });

        return {
          ...existingNet,
          nodes: newNodes,
        };
      });
    },
    [setPetriNetDefinition],
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
      setPetriNetDefinition((existingNet) => {
        const newArcs = existingNet.arcs.map((arc) =>
          arc.id === edgeId
            ? { ...arc, data: { ...arc.data, tokenWeights } }
            : arc,
        );

        return {
          ...existingNet,
          arcs: newArcs,
        };
      });
    },
    [setPetriNetDefinition],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedTransition(null);
    setSelectedArc(null);
  }, []);

  const { resetSimulation } = useSimulationContext();

  const handleReset = useCallback(() => {
    setPetriNetDefinition((existingNet) => {
      const newNodes = existingNet.nodes.map((node) => {
        if (node.data.type === "place") {
          const initialCounts = node.data.initialTokenCounts ?? {};

          return {
            ...node,
            data: {
              ...node.data,
              tokenCounts: { ...initialCounts },
            },
          };
        } else if (node.type === "transition") {
          return node;
        }
        return node;
      });

      return {
        ...existingNet,
        nodes: newNodes,
      };
    });

    resetSimulation();
  }, [setPetriNetDefinition, resetSimulation]);

  const handleUpdateTransition = useCallback(
    (
      transitionId: string,
      transitionData: {
        label: string;
        processTimes?: { [tokenTypeId: string]: number };
        description?: string;
        priority?: number;
      },
    ) => {
      setPetriNetDefinition((existingNet) => {
        const newNodes = existingNet.nodes.map((node) => {
          if (node.id === transitionId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...transitionData,
              },
            };
          }
          return node;
        });

        return {
          ...existingNet,
          nodes: newNodes,
        };
      });
    },
    [setPetriNetDefinition],
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

  return (
    <Box sx={{ height: "100%" }}>
      <TitleAndNetSelect />

      <Stack direction="row" sx={{ height: "100%", userSelect: "none" }}>
        <Sidebar />

        <Box
          sx={{ width: "100%", height: "100%", position: "relative" }}
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
            <SimulationControls onReset={handleReset} />
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
            nodes={petriNetDefinition.nodes}
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
        </Box>
      </Stack>
    </Box>
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
   * Set the definition of the net which is currently loaded.
   */
  setPetriNetDefinition: (petriNetDefinition: PetriNetDefinitionObject) => void;
  /**
   * Load a new net by id.
   */
  loadPetriNet: (petriNetId: string) => void;
  /**
   * Whether the net is read-only.
   */
  readonly: boolean;
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
  parentNet,
  petriNetId,
  petriNetDefinition,
  setPetriNetDefinition,
  loadPetriNet,
  readonly,
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
        setPetriNetDefinition={setPetriNetDefinition}
        loadPetriNet={loadPetriNet}
        readonly={readonly}
        setTitle={setTitle}
        title={title}
      >
        <SimulationContextProvider>
          <PetrinautInner />
        </SimulationContextProvider>
      </EditorContextProvider>
    </ReactFlowProvider>
  );
};
