import "reactflow/dist/style.css";

import { Box, Stack, Typography } from "@mui/material";
import type { DragEvent } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionLineType,
  Controls,
  type Edge,
  type EdgeChange,
  getBezierPath,
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  type ReactFlowInstance,
  ReactFlowProvider,
  useEdges,
  useNodes,
  useReactFlow,
} from "reactflow";
import { useLocalstorageState } from "rooks";

import { Button } from "../../shared/ui";
import { EdgeMenu } from "./edge-menu";
import { NodeMenu, type TokenCounts } from "./node-menu";
import { defaultTokenTypes, TokenEditor, type TokenType } from "./token-editor";

// Custom edge type for Petri nets
type PetriNetEdge = Edge<{
  tokenWeights: {
    [tokenTypeId: string]: number;
  };
}>;

// Add this type near the top with other types
type AnimatingToken = {
  id: string;
  tokenTypeId: string;
  progress: number;
  startTime: number;
  steps: number[];
  currentStep: number;
};

// Create context for simulation speed
const SimulationSpeedContext = createContext<number>(1000);

// Custom edge component to show weights
const WeightedEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  simulationSpeed,
  tokenTypes,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  simulationSpeed: number;
  tokenTypes: TokenType[];
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
}) => {
  const [animatingTokens, setAnimatingTokens] = useState<AnimatingToken[]>([]);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Animation effect
  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      const now = performance.now();
      setAnimatingTokens((currentTokens) => {
        // Update each token's progress through steps
        return currentTokens
          .map((token) => {
            const elapsed = now - token.startTime;
            const stepDuration = 500; // 500ms per step
            const currentStepTime = elapsed % stepDuration;
            const shouldAdvanceStep = currentStepTime < 16; // Check if we should move to next step (16ms is roughly one frame)

            if (
              shouldAdvanceStep &&
              token.currentStep < token.steps.length - 1
            ) {
              return {
                ...token,
                currentStep: token.currentStep + 1,
                progress: token.steps[token.currentStep + 1],
              };
            }

            // Remove token if it has completed all steps
            if (token.currentStep >= token.steps.length - 1) {
              return null;
            }

            return token;
          })
          .filter(Boolean) as AnimatingToken[];
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Function to add a new animating token
  const addAnimatingToken = useCallback((tokenTypeId: string) => {
    // Create array of 20 steps for smoother animation
    const steps = Array.from({ length: 20 }, (_, i) => i / 19);

    const newToken: AnimatingToken = {
      id: Math.random().toString(),
      tokenTypeId,
      progress: 0,
      startTime: performance.now(),
      steps,
      currentStep: 0,
    };
    setAnimatingTokens((current) => [...current, newToken]);
  }, []);

  // Listen for transition firings
  useEffect(() => {
    const handleTransitionFired = (
      event: CustomEvent<{
        edgeId: string;
        tokenTypeId: string;
        isInput?: boolean;
      }>,
    ) => {
      const { edgeId, tokenTypeId } = event.detail;
      if (edgeId === id) {
        addAnimatingToken(tokenTypeId);
      }
    };

    window.addEventListener(
      "transitionFired",
      handleTransitionFired as EventListener,
    );
    return () => {
      window.removeEventListener(
        "transitionFired",
        handleTransitionFired as EventListener,
      );
    };
  }, [id, addAnimatingToken]);

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="#555"
        style={{
          cursor: "pointer",
          strokeOpacity: 0.1,
        }}
      />
      <path
        id={`${id}-visible`}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke="#555"
        style={{ pointerEvents: "none" }}
      />
      {/* Animating tokens */}
      {animatingTokens.map((token) => {
        const tokenType = tokenTypes.find(
          (tt: TokenType) => tt.id === token.tokenTypeId,
        );
        return (
          <g key={token.id}>
            <circle
              r="6"
              fill={tokenType?.color ?? "#3498db"}
              style={{
                offsetPath: `path("${edgePath}")`,
                offsetDistance: "0%",
                animation: `moveToken ${simulationSpeed}ms linear forwards`,
              }}
            />
          </g>
        );
      })}
      <style>
        {`
          @keyframes moveToken {
            0% {
              offset-distance: 0%;
            }
            100% {
              offset-distance: 100%;
            }
          }
        `}
      </style>
      <g transform={`translate(${labelX}, ${labelY})`}>
        {/* Token weights */}
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 0) // First filter out zero weights
          .map(([tokenTypeId, weight], index, nonZeroWeights) => {
            // Find the token type from the global token types
            const tokenType = tokenTypes.find(
              (tt: TokenType) => tt.id === tokenTypeId,
            );
            if (!tokenType) {
              throw new Error(
                `Token type with ID '${tokenTypeId}' not found for edge '${id}'`,
              );
            }
            // Calculate vertical offset based on non-zero weights
            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 20;

            return (
              <g key={tokenTypeId} transform={`translate(0, ${yOffset})`}>
                <circle cx="0" cy="0" r="8" fill={tokenType.color} />
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    fill: "white",
                    pointerEvents: "none",
                  }}
                >
                  {weight}
                </text>
              </g>
            );
          })}
      </g>
    </>
  );
};

// Node dimensions
const nodeDimensions = {
  place: { width: 120, height: 120 },
  transition: { width: 160, height: 80 },
};

// Custom node components
const PlaceNode = ({ data, isConnectable }: NodeProps) => {
  const tokenCounts: TokenCounts = data.tokenCounts || {};
  const tokenTypes: TokenType[] = data.tokenTypes || [];

  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ background: "#555" }}
      />
      <Box
        sx={({ palette }) => ({
          padding: 1,
          borderRadius: "50%", // Circle for places
          width: nodeDimensions.place.width,
          height: nodeDimensions.place.height,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: palette.gray[20],
          border: `2px solid ${palette.gray[50]}`,
          fontSize: "1rem",
          boxSizing: "border-box",
          position: "relative",
        })}
      >
        {data.label}

        {/* Token counts in different positions */}
        {Object.entries(tokenCounts).map(([tokenTypeId, count], index) => {
          if (count === 0) {
            return null;
          }

          // Calculate position based on index
          const positions = [
            { top: "0", left: "50%", transform: "translateX(-50%)" }, // Top
            { top: "50%", right: "0", transform: "translateY(-50%)" }, // Right
            { bottom: "0", left: "50%", transform: "translateX(-50%)" }, // Bottom
            { top: "50%", left: "0", transform: "translateY(-50%)" }, // Left
          ] as const;

          const position = positions[index % positions.length];
          const tokenType = tokenTypes.find((tt) => tt.id === tokenTypeId);

          return (
            <Box
              key={tokenTypeId}
              sx={{
                position: "absolute",
                ...position,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "24px",
                height: "24px",
                borderRadius: "12px",
                backgroundColor: tokenType?.color ?? "#3498db",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: "bold",
                padding: "0 4px",
              }}
            >
              {count}
            </Box>
          );
        })}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ background: "#555" }}
      />
    </div>
  );
};

// Function to check if a transition is enabled
const checkTransitionEnabled = (
  transitionId: string,
  nodes: Node[],
  edges: PetriNetEdge[],
): boolean => {
  // Find all incoming edges
  const incomingEdges = edges.filter((edge) => edge.target === transitionId);

  // Check if all source places have enough tokens
  return incomingEdges.every((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    if (!sourceNode || sourceNode.type !== "place") {
      return false;
    }

    // Check each token type requirement
    const tokenCounts = sourceNode.data.tokenCounts || {};
    return Object.entries(edge.data?.tokenWeights ?? {}).every(
      ([tokenTypeId, requiredWeight]) => {
        const availableTokens = tokenCounts[tokenTypeId] ?? 0;
        return availableTokens >= requiredWeight;
      },
    );
  });
};

const TransitionNode = ({ id, data, isConnectable }: NodeProps) => {
  // Get the nodes and edges from context
  const nodes = useNodes();
  const edges = useEdges() as PetriNetEdge[];

  // Check if the transition is enabled
  const enabled = useMemo(
    () => checkTransitionEnabled(id, nodes, edges),
    [id, nodes, edges],
  );

  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ background: "#555" }}
      />
      <Box
        sx={({ palette }) => ({
          padding: 1,
          borderRadius: 0,
          width: nodeDimensions.transition.width,
          height: nodeDimensions.transition.height,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: palette.gray[20],
          border: `2px solid ${palette.gray[50]}`,
          fontSize: "1rem",
          boxSizing: "border-box",
        })}
      >
        {data.label}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ background: "#555" }}
      />
    </div>
  );
};

const Sidebar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <Stack
      component="aside"
      gap={2}
      sx={{
        p: 2,
        width: 140,
        borderRight: "1px solid #ccc",
      }}
    >
      <Box
        sx={({ palette }) => ({
          background: palette.gray[30],
          borderRadius: "50%", // Circle preview for places
          p: 1,
          textAlign: "center",
          cursor: "grab",
          width: 100,
          height: 100,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1rem",
        })}
        draggable
        onDragStart={(event) => onDragStart(event, "place")}
      >
        Place
      </Box>
      <Box
        sx={({ palette }) => ({
          background: palette.gray[30],
          borderRadius: 0, // Rectangle preview for transitions
          p: 1,
          textAlign: "center",
          cursor: "grab",
          width: 100,
          height: 50,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1rem",
        })}
        draggable
        onDragStart={(event) => onDragStart(event, "transition")}
      >
        Transition
      </Box>
    </Stack>
  );
};

// Create a wrapper component for the edge
const WeightedEdgeWrapper = (props: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
  [key: string]: unknown;
}) => {
  const simulationSpeed = useContext(SimulationSpeedContext);
  // Get tokenTypes from the FlowCanvas component
  const { tokenTypes } = useReactFlow()
    .getNodes()
    .reduce(
      (acc, node) => {
        if (node.type === "place" && node.data.tokenTypes) {
          return { tokenTypes: node.data.tokenTypes };
        }
        return acc;
      },
      { tokenTypes: defaultTokenTypes },
    );

  return (
    <WeightedEdge
      {...props}
      simulationSpeed={simulationSpeed}
      tokenTypes={tokenTypes}
    />
  );
};

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
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms between steps

  // Node token menu state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [tokenMenuPosition, setTokenMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Add state for edge menu
  const [selectedEdge, setSelectedEdge] = useState<{
    id: string;
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
    position: { x: number; y: number };
  } | null>(null);

  // Get current token type - ensure it's never undefined
  const currentTokenType = useMemo((): TokenType => {
    const foundToken = tokenTypes.find(
      (token) => token.id === selectedTokenType,
    );
    // Always return a valid token type with type assertion
    return (foundToken ?? tokenTypes[0] ?? defaultTokenTypes[0]) as TokenType;
  }, [tokenTypes, selectedTokenType]);

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      place: PlaceNode,
      transition: TransitionNode,
    }),
    [],
  );

  // Define custom edge types
  const edgeTypes = useMemo(
    () => ({
      default: WeightedEdgeWrapper,
    }),
    [],
  );

  // Add simulation speed to ReactFlow context
  const { setViewport } = useReactFlow();
  useEffect(() => {
    // Just call setViewport with a valid Viewport object
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

  // Validate connections according to Petri Net rules
  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Find source and target nodes
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
      // Only add the connection if it's valid
      if (isValidConnection(connection)) {
        const newEdge: PetriNetEdge = {
          ...connection,
          id: `${connection.source}-${connection.target}`,
          source: connection.source ?? "",
          target: connection.target ?? "",
          type: "default",
          data: {
            tokenWeights: { default: 1 },
          },
        };
        setEdges((existingEdges) => addEdge(newEdge, existingEdges));
      }
    },
    [isValidConnection, setEdges],
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

      // Only show token menu for place nodes
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
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    const petriEdge = edge as PetriNetEdge;
    if (!petriEdge.data) {
      return;
    }

    setSelectedEdge({
      id: edge.id,
      tokenWeights: petriEdge.data.tokenWeights,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

  // Handle edge weight update
  const handleUpdateEdgeWeight = useCallback(
    (edgeId: string, tokenWeights: { [tokenTypeId: string]: number }) => {
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

  // Reset all tokens to 0
  const handleResetTokens = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) => {
        if (currentNode.type === "place") {
          return {
            ...currentNode,
            data: {
              ...currentNode.data,
              tokenCounts: Object.keys(
                currentNode.data.tokenCounts || {},
              ).reduce(
                (acc, tokenTypeId) => ({ ...acc, [tokenTypeId]: 0 }),
                {},
              ),
            },
          };
        }
        return currentNode;
      }),
    );
  }, [setNodes]);

  // Reset everything (clear nodes and edges)
  const handleResetAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // Open token editor
  const handleOpenTokenEditor = () => {
    setTokenEditorOpen(true);
  };

  // Close token editor
  const handleCloseTokenEditor = () => {
    setTokenEditorOpen(false);
  };

  // Modify the handleFireTransition function to work better with concurrent transitions
  const handleFireTransition = useCallback(
    (
      transitionId: string,
      currentNodes: Node[],
      currentEdges: PetriNetEdge[],
    ): Node[] => {
      // Only proceed if the transition is enabled
      if (!checkTransitionEnabled(transitionId, currentNodes, currentEdges)) {
        return currentNodes;
      }

      // Find incoming and outgoing edges
      const incomingEdges = currentEdges.filter(
        (edge) => edge.target === transitionId,
      );
      const outgoingEdges = currentEdges.filter(
        (edge) => edge.source === transitionId,
      );

      // Create a new array of nodes to modify
      const newNodes = [...currentNodes];

      // Track token movements for animation
      const tokenMovements = {
        inputs: [] as { nodeId: string; tokenCounts: Record<string, number> }[],
        outputs: [] as {
          nodeId: string;
          tokenCounts: Record<string, number>;
        }[],
      };

      // Prepare input token movements (but don't update node data yet)
      for (const edge of incomingEdges) {
        const sourceNode = newNodes.find((node) => node.id === edge.source);
        if (!sourceNode || sourceNode.type !== "place") {
          continue;
        }

        const tokenCounts = { ...sourceNode.data.tokenCounts };
        for (const [tokenTypeId, weight] of Object.entries(
          edge.data?.tokenWeights ?? {},
        )) {
          if (weight > 0) {
            // Dispatch event for token animation on input edge
            window.dispatchEvent(
              new CustomEvent("transitionFired", {
                detail: {
                  edgeId: edge.id,
                  tokenTypeId,
                  isInput: true,
                },
              }),
            );

            // Update token counts for later application
            tokenCounts[tokenTypeId] = (tokenCounts[tokenTypeId] ?? 0) - weight;
          }
        }

        // Store the updated token counts for this node
        tokenMovements.inputs.push({
          nodeId: sourceNode.id,
          tokenCounts,
        });
      }

      // Apply input token count changes immediately
      for (const { nodeId, tokenCounts } of tokenMovements.inputs) {
        const inputNode = newNodes.find((node) => node.id === nodeId);
        if (inputNode) {
          inputNode.data = { ...inputNode.data, tokenCounts };
        }
      }

      // Prepare output token movements
      for (const edge of outgoingEdges) {
        const targetNode = newNodes.find((node) => node.id === edge.target);
        if (!targetNode || targetNode.type !== "place") {
          continue;
        }

        const tokenCounts = { ...targetNode.data.tokenCounts };
        for (const [tokenTypeId, weight] of Object.entries(
          edge.data?.tokenWeights ?? {},
        )) {
          if (weight > 0) {
            // Update token counts for later application
            tokenCounts[tokenTypeId] = (tokenCounts[tokenTypeId] ?? 0) + weight;
          }
        }

        // Store the updated token counts for this node
        tokenMovements.outputs.push({
          nodeId: targetNode.id,
          tokenCounts,
        });
      }

      // Store transition data for animation and output updates
      const transitionData = {
        id: transitionId,
        outgoingEdges,
        tokenMovements,
      };

      // Dispatch event with transition data for animation and output updates
      window.dispatchEvent(
        new CustomEvent("transitionComplete", {
          detail: transitionData,
        }),
      );

      return newNodes;
    },
    [],
  );

  // Add a handler for transition complete events
  useEffect(() => {
    const handleTransitionComplete = (
      event: CustomEvent<{
        id: string;
        outgoingEdges: PetriNetEdge[];
        tokenMovements: {
          inputs: { nodeId: string; tokenCounts: Record<string, number> }[];
          outputs: { nodeId: string; tokenCounts: Record<string, number> }[];
        };
      }>,
    ) => {
      const { outgoingEdges, tokenMovements } = event.detail;

      // Schedule output token animations with a delay
      setTimeout(() => {
        // Trigger output token animations
        for (const edge of outgoingEdges) {
          for (const [tokenTypeId, weight] of Object.entries(
            edge.data?.tokenWeights ?? {},
          )) {
            if (weight > 0) {
              // Dispatch event for token animation on output edge with delay
              window.dispatchEvent(
                new CustomEvent("transitionFired", {
                  detail: {
                    edgeId: edge.id,
                    tokenTypeId,
                    isInput: false,
                  },
                }),
              );
            }
          }
        }

        // Schedule the update of output place token counts to happen after animation completes
        setTimeout(() => {
          // Update the nodes state with the new token counts
          setNodes((nodesState) => {
            const updatedNodes = [...nodesState];

            // Apply output token count changes
            for (const { nodeId, tokenCounts } of tokenMovements.outputs) {
              const outputNode = updatedNodes.find(
                (node) => node.id === nodeId,
              );
              if (outputNode) {
                outputNode.data = { ...outputNode.data, tokenCounts };
              }
            }

            return updatedNodes;
          });
        }, simulationSpeed); // Wait for the animation to complete
      }, simulationSpeed); // Initial delay for output animations
    };

    window.addEventListener(
      "transitionComplete",
      handleTransitionComplete as EventListener,
    );

    return () => {
      window.removeEventListener(
        "transitionComplete",
        handleTransitionComplete as EventListener,
      );
    };
  }, [simulationSpeed, setNodes]);

  // Simulation step function
  const handleSimulationStep = useCallback(() => {
    const enabledTransitions = nodes
      .filter((node) => node.type === "transition")
      .filter((node) => checkTransitionEnabled(node.id, nodes, edges));

    if (enabledTransitions.length === 0) {
      setIsSimulating(false);
      return;
    }

    // Fire all enabled transitions instead of just one
    let updatedNodes = [...nodes];

    // Process all enabled transitions
    for (const transition of enabledTransitions) {
      // Check if the transition is still enabled with the updated nodes
      if (checkTransitionEnabled(transition.id, updatedNodes, edges)) {
        updatedNodes = handleFireTransition(transition.id, updatedNodes, edges);
      }
    }

    setNodes(updatedNodes);
  }, [nodes, edges, setNodes, handleFireTransition]);

  // Handle simulation controls
  const handleStartSimulation = useCallback(() => {
    setIsSimulating(true);
  }, []);

  const handleStopSimulation = useCallback(() => {
    setIsSimulating(false);
  }, []);

  // Set up simulation interval
  useEffect(() => {
    if (!isSimulating) {
      return undefined;
    }

    const interval = setInterval(handleSimulationStep, simulationSpeed);
    return () => clearInterval(interval);
  }, [isSimulating, simulationSpeed, handleSimulationStep]);

  // Example CPN for demonstration
  const exampleCPN = {
    tokenTypes: [
      { id: "precursor_a", name: "Precursor A", color: "#3498db" },
      { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
      { id: "drug", name: "Drug", color: "#2ecc71" },
    ],
    nodes: [
      {
        id: "place_0",
        type: "place",
        position: { x: 20, y: 280 },
        data: {
          label: "Plant A Supply",
          tokenCounts: { precursor_a: 5, precursor_b: 0, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "place_1",
        type: "place",
        position: { x: 20, y: 600 },
        data: {
          label: "Plant B Supply",
          tokenCounts: { precursor_a: 0, precursor_b: 5, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "place_2",
        type: "place",
        position: { x: 350, y: 450 },
        data: {
          label: "Manufacturing Plant",
          tokenCounts: { precursor_a: 0, precursor_b: 0, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "place_3",
        type: "place",
        position: { x: 700, y: 400 },
        data: {
          label: "Central Warehouse",
          tokenCounts: { precursor_a: 0, precursor_b: 0, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "place_4",
        type: "place",
        position: { x: 1200, y: 200 },
        data: {
          label: "Hospital A",
          tokenCounts: { precursor_a: 0, precursor_b: 0, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "place_5",
        type: "place",
        position: { x: 1200, y: 550 },
        data: {
          label: "Hospital B",
          tokenCounts: { precursor_a: 0, precursor_b: 0, drug: 0 },
          tokenTypes: [
            { id: "precursor_a", name: "Precursor A", color: "#3498db" },
            { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
            { id: "drug", name: "Drug", color: "#2ecc71" },
          ],
        },
      },
      {
        id: "transition_0",
        type: "transition",
        position: { x: 140, y: 450 },
        data: { label: "Manufacture" },
      },
      {
        id: "transition_1",
        type: "transition",
        position: { x: 500, y: 400 },
        data: { label: "Store" },
      },
      {
        id: "transition_2",
        type: "transition",
        position: { x: 900, y: 400 },
        data: { label: "Distribute" },
      },
    ] as Node[],
    edges: [
      {
        id: "place_0-transition_0",
        source: "place_0",
        target: "transition_0",
        type: "default",
        data: { tokenWeights: { precursor_a: 1, precursor_b: 0, drug: 0 } },
      },
      {
        id: "place_1-transition_0",
        source: "place_1",
        target: "transition_0",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 1, drug: 0 } },
      },
      {
        id: "transition_0-place_2",
        source: "transition_0",
        target: "place_2",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
      {
        id: "place_2-transition_1",
        source: "place_2",
        target: "transition_1",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
      {
        id: "transition_1-place_3",
        source: "transition_1",
        target: "place_3",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
      {
        id: "place_3-transition_2",
        source: "place_3",
        target: "transition_2",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
      {
        id: "transition_2-place_4",
        source: "transition_2",
        target: "place_4",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
      {
        id: "transition_2-place_5",
        source: "transition_2",
        target: "place_5",
        type: "default",
        data: { tokenWeights: { precursor_a: 0, precursor_b: 0, drug: 1 } },
      },
    ] as PetriNetEdge[],
  };

  // Add load example button
  const handleLoadExample = useCallback(() => {
    setTokenTypes(exampleCPN.tokenTypes);
    setNodes(exampleCPN.nodes);
    setEdges(exampleCPN.edges);
  }, [
    setTokenTypes,
    setNodes,
    setEdges,
    exampleCPN.tokenTypes,
    exampleCPN.nodes,
    exampleCPN.edges,
  ]);

  return (
    <SimulationSpeedContext.Provider value={simulationSpeed}>
      <Box
        sx={{ flex: 1, height: "100%", position: "relative" }}
        ref={reactFlowWrapper}
      >
        {/* Token Type Key/Legend */}
        <Box
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 2,
            borderRadius: 1,
            bgcolor: "background.paper",
            boxShadow: 1,
            minWidth: 150,
          }}
        >
          <Typography fontWeight="bold" sx={{ mb: 1 }}>
            Token Types
          </Typography>

          {tokenTypes.map((token) => (
            <Stack
              key={token.id}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                cursor: "pointer",
                p: 0.5,
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

          <Button size="small" onClick={handleOpenTokenEditor} sx={{ mt: 1 }}>
            Edit Types
          </Button>
        </Box>

        {/* Simulation Controls */}
        <Box
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 100,
            display: "flex",
            gap: 2,
            alignItems: "center",
          }}
        >
          <Stack direction="row" spacing={2}>
            <Button onClick={handleResetTokens}>Reset Tokens</Button>
            <Button onClick={handleResetAll}>Reset All</Button>
            <Button onClick={handleLoadExample}>Load Example</Button>
            <Button onClick={handleSave}>Save (Log JSON)</Button>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              onClick={
                isSimulating ? handleStopSimulation : handleStartSimulation
              }
            >
              {isSimulating ? "Stop Simulation" : "Start Simulation"}
            </Button>
            <Button onClick={handleSimulationStep}>Step</Button>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography>Speed:</Typography>
              <select
                value={simulationSpeed}
                onChange={(event) =>
                  setSimulationSpeed(Number(event.target.value))
                }
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                <option value={2000}>Slow</option>
                <option value={1000}>Normal</option>
                <option value={500}>Fast</option>
                <option value={200}>Very Fast</option>
              </select>
            </Box>
          </Stack>
        </Box>

        {/* Token Editor Dialog */}
        <TokenEditor
          open={tokenEditorOpen}
          onClose={handleCloseTokenEditor}
          tokenTypes={tokenTypes}
          setTokenTypes={setTokenTypes}
        />

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
            tokenWeights={selectedEdge.tokenWeights}
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
          <MiniMap />
          <Controls />
          <Background gap={15} size={1} />
        </ReactFlow>
      </Box>
    </SimulationSpeedContext.Provider>
  );
};

export const ProcessEditor = () => {
  return (
    <ReactFlowProvider>
      <Box sx={{ display: "flex", height: "100vh" }}>
        <Sidebar />
        <FlowCanvas />
      </Box>
    </ReactFlowProvider>
  );
};
