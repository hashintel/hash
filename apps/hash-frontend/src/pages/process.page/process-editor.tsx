import "reactflow/dist/style.css";

import { Box, Stack, Typography } from "@mui/material";
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

import { Button } from "../../shared/ui";
import { Arc } from "./process-editor/arc";
import { ArcEditor } from "./process-editor/arc-editor";
import {
  EditorContextProvider,
  useEditorContext,
} from "./process-editor/editor-context";
import { exampleCPN } from "./process-editor/examples";
import { LogPane } from "./process-editor/log-pane";
import { PlaceEditor } from "./process-editor/place-editor";
import { PlaceNode } from "./process-editor/place-node";
import { Sidebar } from "./process-editor/sidebar";
import {
  SimulationContextProvider,
  useSimulation,
} from "./process-editor/simulation-context";
import { SimulationControls } from "./process-editor/simulation-controls";
import { nodeDimensions } from "./process-editor/styling";
import { TokenTypeEditor } from "./process-editor/token-type-editor";
import { TransitionEditor } from "./process-editor/transition-editor";
import { TransitionNode } from "./process-editor/transition-node";
import {
  type ArcData,
  type ArcType,
  type NodeData,
  type PlaceNodeType,
  type TokenCounts,
} from "./process-editor/types";

const FlowCanvas = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  const { nodes, setNodes, arcs, setArcs, tokenTypes, setTokenTypes } =
    useEditorContext();

  const [tokenTypeEditorOpen, setTokenTypeEditorOpen] = useState(false);

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
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setArcs((currentArcs) => applyEdgeChanges(changes, currentArcs));
    },
    [setArcs],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Places can only connect to transitions and vice versa
      return sourceNode.type !== targetNode.type;
    },
    [nodes],
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
            tokenWeights: { [tokenTypes[0]!.id]: 1 },
          },
          interactionWidth: 8,
        };
        setArcs((currentArcs) => addEdge(newEdge, currentArcs));
      }
    },
    [isValidConnection, setArcs, tokenTypes],
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

      if (!reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const nodeType = event.dataTransfer.getData("application/reactflow") as
        | "place"
        | "transition";

      const { width, height } = nodeDimensions[nodeType];

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left - width / 2,
        y: event.clientY - reactFlowBounds.top - height / 2,
      });

      const newNode: Node = {
        id: `${nodeType}_${nodes.length}`,
        type: nodeType,
        position,
        data: {
          label: `${nodeType} ${nodes.length + 1}`,
          ...(nodeType === "place"
            ? {
                tokenCounts: {},
                tokenTypes,
              }
            : {}),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes, tokenTypes, setNodes],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (selectedPlaceId && selectedPlaceId === node.id) {
        return;
      }

      setSelectedPlaceId(null);
      setSelectedArc(null);

      if (node.type === "place") {
        setSelectedPlaceId(node.id);
      } else if (node.type === "transition") {
        setSelectedTransition(node.id);
      }
    },
    [selectedPlaceId],
  );

  const handleUpdateTokens = useCallback(
    (nodeId: string, tokenCounts: TokenCounts) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                tokenCounts,
                tokenTypes,
              },
            };
          }
          return node;
        }),
      );
    },
    [tokenTypes, setNodes],
  );

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
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
        }),
      );
    },
    [setNodes],
  );

  const handleCloseTokenMenu = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

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
      setArcs((currentArcs) =>
        currentArcs.map((arc) =>
          arc.id === edgeId
            ? { ...arc, data: { ...arc.data, tokenWeights } }
            : arc,
        ),
      );
    },
    [setArcs],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedTransition(null);
    setSelectedArc(null);
  }, []);

  const { resetSimulation } = useSimulation();

  const handleResetAll = useCallback(() => {
    setNodes([]);
    setArcs([]);
    resetSimulation();
  }, [setNodes, setArcs, resetSimulation]);

  const handleLoadExample = useCallback(() => {
    setTokenTypes(exampleCPN.tokenTypes);

    const nodesWithInitialCounts = exampleCPN.nodes.map((node) => {
      if (node.data.type === "place") {
        return {
          ...node,
          data: {
            ...node.data,
            initialTokenCounts: { ...node.data.tokenCounts },
          },
        };
      }
      return node;
    });

    setNodes(nodesWithInitialCounts);
    setArcs(exampleCPN.arcs);
    resetSimulation();
  }, [setTokenTypes, setNodes, setArcs, resetSimulation]);

  const handleReset = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
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
      }),
    );

    resetSimulation();
  }, [setNodes, resetSimulation]);

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
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
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
        }),
      );
    },
    [setNodes],
  );

  const selectedPlace = useMemo(() => {
    if (!selectedPlaceId) {
      return null;
    }

    const place = nodes.find(
      (node): node is PlaceNodeType =>
        node.id === selectedPlaceId && node.data.type === "place",
    );

    if (!place) {
      throw new Error(`Cannot find place with id ${selectedPlaceId}`);
    }

    return place;
  }, [nodes, selectedPlaceId]);

  return (
    <Box
      sx={{ flex: 1, height: "100%", position: "relative" }}
      ref={reactFlowWrapper}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{
          alignItems: "flex-start",
          position: "absolute",
          p: 2,
          zIndex: 100,
          width: "100%",
        }}
      >
        <Box
          sx={{
            alignItems: "center",
            display: "flex",
            flexDirection: "row",
            gap: 2,
            p: 1,
            borderRadius: 1,
            bgcolor: "background.paper",
            boxShadow: 1,
          }}
        >
          {tokenTypes.map((token) => (
            <Stack
              key={token.id}
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{
                cursor: "pointer",
                borderRadius: 1,
              }}
            >
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: token.color,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              />
              <Typography sx={{ fontSize: "0.875rem" }}>
                {token.name}
              </Typography>
            </Stack>
          ))}

          <Button size="xs" onClick={() => setTokenTypeEditorOpen(true)}>
            Edit Types
          </Button>
        </Box>

        <SimulationControls onReset={handleReset} />
      </Stack>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{ position: "absolute", bottom: 16, right: 16, zIndex: 100 }}
      >
        <Button onClick={handleLoadExample} size="xs" variant="tertiary">
          Load Example
        </Button>
        <Button onClick={handleResetAll} size="xs">
          New
        </Button>
      </Stack>

      <TokenTypeEditor
        open={tokenTypeEditorOpen}
        onClose={() => setTokenTypeEditorOpen(false)}
      />

      {selectedTransition && (
        <TransitionEditor
          open
          onClose={() => setSelectedTransition(null)}
          transitionId={selectedTransition}
          transitionData={
            nodes.find((node) => node.id === selectedTransition)?.data ?? {
              label: "",
            }
          }
          outgoingEdges={arcs
            .filter((edge) => edge.source === selectedTransition)
            .map((edge) => {
              const targetNode = nodes.find((node) => node.id === edge.target);
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
          selectedPlace={selectedPlace}
          tokenTypes={tokenTypes}
          onClose={handleCloseTokenMenu}
          onUpdateTokens={handleUpdateTokens}
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
        nodes={nodes}
        edges={arcs}
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
    </Box>
  );
};

export const ProcessEditor = () => {
  return (
    <ReactFlowProvider>
      <EditorContextProvider>
        <SimulationContextProvider>
          <Box sx={{ display: "flex", height: "100%" }}>
            <Sidebar />
            <FlowCanvas />
          </Box>
        </SimulationContextProvider>
      </EditorContextProvider>
    </ReactFlowProvider>
  );
};
