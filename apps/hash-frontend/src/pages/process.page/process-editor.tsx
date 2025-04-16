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
import { useLocalstorageState } from "rooks";

import { Button } from "../../shared/ui";
import { EdgeMenu } from "./process-editor/edge-menu";
import { exampleCPN } from "./process-editor/examples";
import { nodeDimensions } from "./process-editor/node-dimensions";
import { NodeMenu, type TokenCounts } from "./process-editor/node-menu";
import { PlaceNode } from "./process-editor/place-node";
import { Sidebar } from "./process-editor/sidebar";
import { SimulationControls } from "./process-editor/simulation-controls";
import {
  defaultTokenTypes,
  TokenEditor,
  type TokenType,
} from "./process-editor/token-editor";
import { TransitionEditor } from "./process-editor/transition-editor";
import { TransitionNode } from "./process-editor/transition-node";
import { type PetriNetEdge } from "./process-editor/types";
import {
  SimulationContextProvider,
  useSimulation,
} from "./process-editor/use-simulate";
import { WeightedEdge } from "./process-editor/weighted-edge";

const FlowCanvas = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes] = useLocalstorageState<Node[]>("petri-net-nodes", []);
  const [edges, setEdges] = useLocalstorageState<PetriNetEdge[]>(
    "petri-net-edges",
    [],
  );
  const [tokenTypes, setTokenTypes] = useLocalstorageState<TokenType[]>(
    "petri-net-token-types",
    defaultTokenTypes,
  );

  const [selectedTokenType, setSelectedTokenType] = useState<string>("default");
  const [tokenEditorOpen, setTokenEditorOpen] = useState(false);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [tokenMenuPosition, setTokenMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [transitionEditorOpen, setTransitionEditorOpen] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(
    null,
  );

  const [selectedEdge, setSelectedEdge] = useState<
    (PetriNetEdge & { position: { x: number; y: number } }) | null
  >(null);

  const currentTokenType = useMemo((): TokenType => {
    const foundToken = tokenTypes.find(
      (token) => token.id === selectedTokenType,
    );
    return (foundToken ?? tokenTypes[0] ?? defaultTokenTypes[0]) as TokenType;
  }, [tokenTypes, selectedTokenType]);

  const nodeTypes = useMemo(
    () => ({
      place: PlaceNode,
      transition: TransitionNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      default: WeightedEdge,
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
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges],
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
        const newEdge: PetriNetEdge = {
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
        setEdges((existingEdges) => addEdge(newEdge, existingEdges));
      }
    },
    [isValidConnection, setEdges, tokenTypes],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  // Allow dropping elements onto the canvas
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  }, []);

  // When something is dropped, create a new node at drop coords
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

      // Check if nodeType is valid
      if (!["place", "transition"].includes(nodeType)) {
        return;
      }

      // Get node dimensions from our constants
      const { width, height } = nodeDimensions[nodeType];

      // Compute drop position inside the canvas
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left - width / 2,
        y: event.clientY - reactFlowBounds.top - height / 2,
      });

      // Create a new node with appropriate default data
      const newNode: Node = {
        id: `${nodeType}_${nodes.length}`,
        type: nodeType,
        position,
        data: {
          label: `${nodeType} ${nodes.length + 1}`,
          // For places, initialize with token counts and types
          ...(nodeType === "place"
            ? {
                tokenCounts: { [currentTokenType.id]: 0 },
                tokenTypes,
              }
            : {}),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes, currentTokenType, tokenTypes, setNodes],
  );

  // Handle node click to show token menu for places
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // If clicking the same node that's already selected, keep the menu open
      if (selectedNode && selectedNode.id === node.id) {
        return;
      }

      // Close any open token menu
      setSelectedNode(null);
      setTokenMenuPosition(null);
      setSelectedEdge(null);

      // Handle different node types
      if (node.type === "place") {
        // Initialize token counts if not present
        if (!node.data.tokenCounts) {
          setNodes((currentNodes) =>
            currentNodes.map((currentNode) => {
              if (currentNode.id === node.id) {
                return {
                  ...currentNode,
                  data: {
                    ...currentNode.data,
                    tokenCounts: { [currentTokenType.id]: 0 },
                  },
                };
              }
              return currentNode;
            }),
          );
        }

        // Get the node's DOM element
        const nodeElement = event.target as HTMLElement;
        const nodeBounds = nodeElement
          .closest(".react-flow__node")
          ?.getBoundingClientRect();

        if (nodeBounds) {
          // Position the menu to the right of the node
          const menuPosition = {
            x: nodeBounds.right + 10, // 10px offset from the node
            y: nodeBounds.top, // Align with the top of the node
          };

          setSelectedNode(node);
          setTokenMenuPosition(menuPosition);
        }
      } else if (node.type === "transition") {
        // Open transition editor for transition nodes
        setSelectedTransition(node.id);
        setTransitionEditorOpen(true);
      }
    },
    [currentTokenType, selectedNode, setNodes],
  );

  // Update token counts for a node
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
                tokenTypes, // Always include current token types
              },
            };
          }
          return node;
        }),
      );
    },
    [tokenTypes, setNodes],
  );

  // Update node label
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

  // Close the token menu
  const handleCloseTokenMenu = useCallback(() => {
    setSelectedNode(null);
    setTokenMenuPosition(null);
  }, []);

  // Handle edge click
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: PetriNetEdge) => {
      event.stopPropagation();

      setSelectedEdge({
        ...edge,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  // Handle edge weight update
  const handleUpdateEdgeWeight = useCallback(
    (
      edgeId: string,
      tokenWeights: { [tokenTypeId: string]: number | undefined },
    ) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? { ...edge, data: { ...edge.data, tokenWeights } }
            : edge,
        ),
      );
    },
    [setEdges],
  );

  // Handle pane click to close menus
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  // For demonstration, we log out the current diagram JSON
  const handleSave = () => {
    const processJson = {
      nodes,
      edges,
      tokenTypes,
    };
    // eslint-disable-next-line no-console
    console.log("Process JSON:", processJson);
    alert("Check console for the process JSON");
  };

  const {
    globalClock,
    isSimulating,
    resetSimulation,
    setIsSimulating,
    setSimulationSpeed,
    setTimeStepSize,
    simulationSpeed,
    stepSimulation,
    timeStepSize,
  } = useSimulation();

  // Reset everything (clear nodes and edges)
  const handleResetAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    resetSimulation();
  }, [setNodes, setEdges, resetSimulation]);

  // Add load example button
  const handleLoadExample = useCallback(() => {
    setTokenTypes(exampleCPN.tokenTypes);

    // Add initialTokenCounts to each place node in the example
    const nodesWithInitialCounts = exampleCPN.nodes.map((node) => {
      if (node.type === "place") {
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
    setEdges(exampleCPN.edges);
    // Reset the global clock
    resetSimulation();
  }, [setTokenTypes, setNodes, setEdges, resetSimulation]);

  // Add a new reset button that preserves the network but resets tokens and clock
  const handleReset = useCallback(() => {
    // Reset tokens to their initial state (this requires storing initial token counts)
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.type === "place") {
          // Reset to initial state or empty if no initial state
          const initialCounts = node.data.initialTokenCounts || {};
          return {
            ...node,
            data: {
              ...node.data,
              tokenCounts: { ...initialCounts },
              tokenTimestamps: {},
            },
          };
        } else if (node.type === "transition") {
          // Reset any in-progress transitions
          return {
            ...node,
            data: {
              ...node.data,
              inProgress: false,
              progress: 0,
              startTime: null,
              duration: null,
            },
          };
        }
        return node;
      }),
    );

    resetSimulation();
  }, [setNodes, resetSimulation]);

  // Store initial token counts when nodes are created or loaded
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.type === "place" && !node.data.initialTokenCounts) {
          return {
            ...node,
            data: {
              ...node.data,
              initialTokenCounts: { ...node.data.tokenCounts },
            },
          };
        }
        return node;
      }),
    );
  }, [setNodes]);

  // Handle updating transition properties
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
        {/* Token Type Key/Legend */}
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
                bgcolor:
                  selectedTokenType === token.id
                    ? "action.hover"
                    : "transparent",
              }}
              onClick={() => setSelectedTokenType(token.id)}
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

          <Button size="xs" onClick={() => setTokenEditorOpen(true)}>
            Edit Types
          </Button>
        </Box>

        <SimulationControls
          isSimulating={isSimulating}
          onStartSimulation={() => setIsSimulating(true)}
          onStopSimulation={() => setIsSimulating(false)}
          onSimulationStep={() => stepSimulation()}
          onReset={handleReset}
          timeStep={timeStepSize}
          setTimeStep={setTimeStepSize}
          simulationSpeed={simulationSpeed}
          setSimulationSpeed={setSimulationSpeed}
          globalClock={globalClock}
        />
      </Stack>

      {/* File operations */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ position: "absolute", bottom: 16, left: 16, zIndex: 100 }}
      >
        <Button onClick={handleLoadExample} size="xs">
          Load Example
        </Button>
        <Button onClick={handleResetAll} size="xs">
          New
        </Button>
        {/* <Button onClick={handleSave} size="xs">
            Save
          </Button> */}
      </Stack>

      {/* Token Editor Dialog */}
      <TokenEditor
        open={tokenEditorOpen}
        onClose={() => setTokenEditorOpen(false)}
        tokenTypes={tokenTypes}
        setTokenTypes={setTokenTypes}
      />

      {/* Transition Editor Dialog */}
      {selectedTransition && (
        <TransitionEditor
          open={transitionEditorOpen}
          onClose={() => setTransitionEditorOpen(false)}
          transitionId={selectedTransition}
          transitionData={
            nodes.find((node) => node.id === selectedTransition)?.data || {
              label: "",
              processTimes: {},
            }
          }
          tokenTypes={tokenTypes}
          outgoingEdges={edges
            .filter((edge) => edge.source === selectedTransition)
            .map((edge) => {
              const targetNode = nodes.find((node) => node.id === edge.target);
              return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                targetLabel: targetNode?.data?.label ?? "Unknown",
                tokenWeights: edge.data?.tokenWeights ?? {},
              };
            })}
          onUpdateTransition={handleUpdateTransition}
        />
      )}

      {/* Node Token Menu */}
      {selectedNode && tokenMenuPosition && (
        <NodeMenu
          nodeId={selectedNode.id}
          nodeName={selectedNode.data.label}
          position={tokenMenuPosition}
          tokenTypes={tokenTypes}
          tokenCounts={selectedNode.data.tokenCounts || {}}
          onClose={handleCloseTokenMenu}
          onUpdateTokens={handleUpdateTokens}
          onUpdateNodeLabel={handleUpdateNodeLabel}
        />
      )}

      {selectedEdge && (
        <EdgeMenu
          edgeId={selectedEdge.id}
          tokenWeights={selectedEdge.data?.tokenWeights ?? {}}
          position={selectedEdge.position}
          onClose={() => setSelectedEdge(null)}
          onUpdateWeights={handleUpdateEdgeWeight}
          tokenTypes={tokenTypes}
        />
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
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
      >
        {/* <Controls /> */}
        <Background gap={15} size={1} />
      </ReactFlow>

      {/* Simulation Logs */}
      {/* {simulationLogs.length > 0 && (
        <Box
          sx={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 100,
            width: 350,
            maxHeight: 200,
            overflow: "auto",
            p: 2,
            borderRadius: 1,
            bgcolor: "background.paper",
            boxShadow: 1,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography fontWeight="bold" sx={{ mb: 1 }}>
            Simulation Logs
          </Typography>
          <Stack spacing={0.5}>
            {simulationLogs.map((log) => (
              <Typography
                key={log.id}
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {log.text}
              </Typography>
            ))}
          </Stack>
        </Box>
      )} */}
    </Box>
  );
};

export const ProcessEditor = () => {
  return (
    <ReactFlowProvider>
      <SimulationContextProvider>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <Sidebar />
          <FlowCanvas />
        </Box>
      </SimulationContextProvider>
    </ReactFlowProvider>
  );
};
