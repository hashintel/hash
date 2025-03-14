import "reactflow/dist/style.css";

import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionLineType,
  Controls,
  type EdgeChange,
  getBezierPath,
  Handle,
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
import { EdgeMenu, type PetriNetEdge } from "./process-editor/edge-menu";
import { exampleCPN } from "./process-editor/examples";
import { NodeMenu, type TokenCounts } from "./process-editor/node-menu";
import { SimulationControls } from "./process-editor/simulation-controls";
import {
  defaultTokenTypes,
  TokenEditor,
  type TokenType,
} from "./process-editor/token-editor";
import { TransitionEditor } from "./process-editor/transition-editor";

// Add this type near the top with other types
type AnimatingToken = {
  id: string;
  tokenTypeId: string;
  progress: number;
  startTime: number;
  steps: number[];
  currentStep: number;
};

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
  tokenTypes,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
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
              className="animating-token"
              style={{
                offsetPath: `path("${edgePath}")`,
                offsetDistance: "0%",
              }}
            />
          </g>
        );
      })}
      <style>
        {`
          .animating-token {
            animation: moveToken 500ms linear forwards;
          }
          @keyframes moveToken {
            0% {
              offset-distance: 0%;
              opacity: 1;
            }
            90% {
              opacity: 1;
            }
            100% {
              offset-distance: 100%;
              opacity: 0;
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
        return availableTokens >= (requiredWeight ?? 0);
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

  // Check if this is a timed transition
  const isTimed = useMemo(() => {
    return (
      data.processTimes &&
      Object.values(data.processTimes as Record<string, number>).some(
        (time) => time > 0,
      )
    );
  }, [data.processTimes]);

  // Get the average processing time for display
  const avgProcessingTime = useMemo(() => {
    if (!data.processTimes) {
      return 0;
    }

    const times = Object.values(data.processTimes as Record<string, number>);
    if (times.length === 0) {
      return 0;
    }

    const sum = times.reduce((acc: number, time: number) => acc + time, 0);
    return sum / times.length;
  }, [data.processTimes]);

  // Check if transition is in progress
  const inProgress = data.inProgress === true;
  const progress = data.progress || 0;

  // Check if this is a quality check transition
  const isQualityCheck = data.isQualityCheck === true;
  const failureProbability = data.failureProbability || 0;

  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
        opacity: enabled || inProgress ? 1 : 0.5,
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
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: palette.gray[20],
          border: `2px solid ${inProgress ? palette.primary.main : palette.gray[50]}`,
          fontSize: "1rem",
          boxSizing: "border-box",
          position: "relative",
        })}
      >
        {data.label}

        {/* Display processing time if this is a timed transition */}
        {isTimed && !inProgress && (
          <Box
            sx={{
              position: "absolute",
              top: -8,
              right: -8,
              backgroundColor: "primary.main",
              color: "white",
              borderRadius: "50%",
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
            }}
            title={`Average processing time: ${avgProcessingTime} hours`}
          >
            ⏱️
          </Box>
        )}

        {/* Display QA badge for quality check transitions */}
        {isQualityCheck && (
          <Box
            sx={{
              position: "absolute",
              top: -8,
              left: -8,
              backgroundColor: "error.main",
              color: "white",
              borderRadius: "50%",
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
            }}
            title={`Quality check with ${failureProbability}% failure probability`}
          >
            QA
          </Box>
        )}

        {/* Show progress indicator when transition is in progress */}
        {inProgress && (
          <Box sx={{ position: "relative", mt: 1 }}>
            <CircularProgress
              variant="determinate"
              value={progress * 100}
              size={40}
              thickness={4}
              sx={{ color: "primary.main" }}
            />
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                component="div"
                color="text.secondary"
                sx={{ fontWeight: "bold", fontSize: "0.75rem" }}
              >
                {Math.round(progress * 100)}%
              </Typography>
            </Box>
          </Box>
        )}

        {/* Show description if available */}
        {data.description && !inProgress && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              mt: 0.5,
              textAlign: "center",
            }}
          >
            {data.description}
          </Typography>
        )}

        {/* Show failure probability for quality check transitions */}
        {isQualityCheck && !inProgress && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "error.main",
              mt: 0.5,
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            Failure rate: {failureProbability}%
          </Typography>
        )}

        {/* Show remaining time if in progress */}
        {inProgress && data.duration && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              mt: 0.5,
              textAlign: "center",
            }}
          >
            {Math.ceil(data.duration * (1 - progress))} hours remaining
          </Typography>
        )}
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

  return <WeightedEdge {...props} tokenTypes={tokenTypes} />;
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
  const [timeStepSize, setTimeStepSize] = useState(1); // hours per step
  const [globalClock, setGlobalClock] = useState(0); // Global simulation clock in hours
  const [simulationLogs, setSimulationLogs] = useState<
    Array<{ id: string; text: string }>
  >([]); // Simulation logs

  // Function to add a log entry
  const addLogEntry = useCallback(
    (message: string) => {
      const timestamp = Date.now();
      setSimulationLogs((prevLogs) => {
        const newLog = {
          id: `log-${timestamp}-${prevLogs.length}`,
          text: `[${globalClock.toFixed(1)}h] ${message}`,
        };
        const newLogs = [...prevLogs, newLog];
        // Keep only the last 10 logs
        return newLogs.slice(-10);
      });
    },
    [globalClock],
  );

  // Node token menu state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [tokenMenuPosition, setTokenMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Add state for transition editor
  const [transitionEditorOpen, setTransitionEditorOpen] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(
    null,
  );

  // Add state for edge menu
  const [selectedEdge, setSelectedEdge] = useState<
    (PetriNetEdge & { position: { x: number; y: number } }) | null
  >(null);

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

  // Reset everything (clear nodes and edges)
  const handleResetAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setGlobalClock(0);
  }, [setNodes, setEdges]);

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
    setGlobalClock(0);
  }, [setTokenTypes, setNodes, setEdges]);

  // Add a new reset button that preserves the network but resets tokens and clock
  const handleReset = useCallback(() => {
    // Stop simulation if it's running
    if (isSimulating) {
      setIsSimulating(false);
    }

    // Clear simulation logs
    setSimulationLogs([]);

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

    // Reset the global clock
    setGlobalClock(0);
  }, [isSimulating, setNodes, setSimulationLogs]);

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

  // Open token editor
  const handleOpenTokenEditor = () => {
    setTokenEditorOpen(true);
  };

  // Close token editor
  const handleCloseTokenEditor = () => {
    setTokenEditorOpen(false);
  };

  // Modify the handleFireTransition function to work with time-step based simulation
  const handleFireTransition = useCallback(
    (
      transitionId: string,
      currentNodes: Node[],
      currentEdges: PetriNetEdge[],
      currentTime: number,
    ): { nodes: Node[]; nextEventTime: number } => {
      // Find outgoing edges
      const outgoingEdges = currentEdges.filter(
        (edge) => edge.source === transitionId,
      );

      // Create a new array of nodes to modify
      const newNodes = [...currentNodes];

      // Track token movements for animation
      const tokenMovements = {
        outputs: [] as {
          nodeId: string;
          tokenCounts: Record<string, number>;
          tokenTimestamps?: Record<string, number>;
        }[],
      };

      // Prepare output token movements
      for (const edge of outgoingEdges) {
        const targetNode = newNodes.find((node) => node.id === edge.target);
        if (!targetNode || targetNode.type !== "place") {
          continue;
        }

        const tokenCounts = { ...targetNode.data.tokenCounts };
        const tokenTimestamps = { ...(targetNode.data.tokenTimestamps || {}) };

        for (const [tokenTypeId, weight] of Object.entries(
          edge.data?.tokenWeights ?? {},
        )) {
          if ((weight ?? 0) > 0) {
            // Update token counts for later application
            tokenCounts[tokenTypeId] = (tokenCounts[tokenTypeId] ?? 0) + weight;

            // Set timestamp for when these tokens will be available (immediately)
            tokenTimestamps[tokenTypeId] = currentTime;
          }
        }

        // Store the updated token counts and timestamps for this node
        tokenMovements.outputs.push({
          nodeId: targetNode.id,
          tokenCounts,
          tokenTimestamps,
        });
      }

      // Apply output token count changes immediately
      for (const {
        nodeId,
        tokenCounts,
        tokenTimestamps,
      } of tokenMovements.outputs) {
        const outputNode = newNodes.find((node) => node.id === nodeId);
        if (outputNode) {
          outputNode.data = {
            ...outputNode.data,
            tokenCounts,
            tokenTimestamps,
          };
        }
      }

      // Dispatch events for token animations
      for (const edge of outgoingEdges) {
        for (const [tokenTypeId, weight] of Object.entries(
          edge.data?.tokenWeights ?? {},
        )) {
          if ((weight ?? 0) > 0) {
            // Dispatch event for token animation on output edge
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

      return {
        nodes: newNodes,
        nextEventTime: currentTime,
      };
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
          outputs: {
            nodeId: string;
            tokenCounts: Record<string, number>;
            tokenTimestamps?: Record<string, number>;
          }[];
        };
        processingTime: number;
        outputTime: number;
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
            if ((weight ?? 0) > 0) {
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

            // Apply output token counts and timestamps changes
            for (const {
              nodeId,
              tokenCounts,
              tokenTimestamps,
            } of tokenMovements.outputs) {
              const outputNode = updatedNodes.find(
                (node) => node.id === nodeId,
              );
              if (outputNode) {
                outputNode.data = {
                  ...outputNode.data,
                  tokenCounts,
                  tokenTimestamps,
                };
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
    // Advance the global clock by the time step size
    const newClockTime = globalClock + timeStepSize;
    setGlobalClock(newClockTime);

    // Find all transitions that are enabled at the current time
    const enabledTransitions = nodes
      .filter((node) => node.type === "transition")
      .filter((node) => {
        // Check if the transition is enabled based on token availability
        const basicEnabled = checkTransitionEnabled(node.id, nodes, edges);

        // If not enabled by token count, return false
        if (!basicEnabled) {
          return false;
        }

        // Check if all input tokens are available at the current time
        const incomingEdges = edges.filter((edge) => edge.target === node.id);

        return incomingEdges.every((edge) => {
          const sourceNode = nodes.find((source) => source.id === edge.source);
          if (!sourceNode || sourceNode.type !== "place") {
            return false;
          }

          // Check if tokens have timestamps and if they're available now
          const tokenTimestamps = sourceNode.data.tokenTimestamps || {};

          return Object.entries(edge.data?.tokenWeights ?? {}).every(
            ([tokenTypeId, weight]) => {
              if ((weight ?? 0) <= 0) {
                return true;
              }

              // If no timestamp, tokens are available immediately
              if (!tokenTimestamps[tokenTypeId]) {
                return true;
              }

              // Check if tokens are available at current time
              return tokenTimestamps[tokenTypeId] <= newClockTime;
            },
          );
        });
      });

    // Check if any transitions are in progress and update their progress
    const transitionsInProgress = nodes.filter(
      (node) => node.type === "transition" && node.data.inProgress,
    );

    let updatedNodes = [...nodes];

    // Update progress for transitions that are in progress
    if (transitionsInProgress.length > 0) {
      updatedNodes = updatedNodes.map((node) => {
        if (node.type === "transition" && node.data.inProgress) {
          const startTime = node.data.startTime || 0;
          const duration = node.data.duration || 1;
          const elapsedTime = newClockTime - startTime;

          // Calculate progress percentage
          const progress = Math.min(elapsedTime / duration, 1);

          // Check if transition has completed
          if (progress >= 1) {
            // Calculate the actual completion time (might be before newClockTime)
            const completionTime = startTime + duration;

            // Handle conditional outputs
            if (node.data.hasConditions && node.data.conditions) {
              // Select active condition based on probabilities
              const randomValue = Math.random() * 100;
              let cumulativeProbability = 0;
              let selectedCondition = null;

              // Find the condition that matches the random value
              const conditions = Array.isArray(node.data.conditions)
                ? node.data.conditions
                : [];
              for (const condition of conditions) {
                cumulativeProbability +=
                  typeof condition.probability === "number"
                    ? condition.probability
                    : 0;
                if (randomValue <= cumulativeProbability) {
                  selectedCondition = condition;
                  break;
                }
              }

              // If no condition was selected (shouldn't happen if probabilities sum to 100),
              // use the last condition as a fallback
              if (!selectedCondition && node.data.conditions.length > 0) {
                selectedCondition =
                  node.data.conditions[node.data.conditions.length - 1];
              }

              if (selectedCondition) {
                // Get only the edges that are active for this condition
                const activeEdgeIds = selectedCondition.outputEdgeIds ?? [];
                const activeEdges = edges.filter(
                  (edge) =>
                    edge.source === node.id &&
                    Array.isArray(activeEdgeIds) &&
                    activeEdgeIds.includes(edge.id),
                );

                // Log the selected condition
                addLogEntry(
                  `Transition "${node.data.label}" resulted in condition: ${selectedCondition.name} (${selectedCondition.probability}% probability)`,
                );

                // Fire the transition with only the active edges
                const result = handleFireTransition(
                  node.id,
                  updatedNodes,
                  activeEdges,
                  completionTime, // Use the exact completion time
                );

                // Use the updated nodes from the result
                updatedNodes = result.nodes;
              } else {
                // If no condition is defined (shouldn't happen), fire with all edges
                const result = handleFireTransition(
                  node.id,
                  updatedNodes,
                  edges,
                  completionTime,
                );
                updatedNodes = result.nodes;
              }
            } else {
              // For regular transitions without conditions, fire normally
              const result = handleFireTransition(
                node.id,
                updatedNodes,
                edges,
                completionTime, // Use the exact completion time
              );

              // Use the updated nodes from the result
              updatedNodes = result.nodes;
            }

            // Return the node with reset progress state
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
          } else {
            // Update progress
            return {
              ...node,
              data: {
                ...node.data,
                progress,
              },
            };
          }
        }
        return node;
      });
    }

    // Start new transitions if they're enabled
    if (enabledTransitions.length > 0) {
      // Process all enabled transitions that aren't already in progress
      for (const transition of enabledTransitions) {
        const transitionNode = updatedNodes.find(
          (node) => node.id === transition.id,
        );

        // Skip if already in progress
        if (transitionNode?.data.inProgress) {
          continue;
        }

        // Calculate the processing time for this transition
        const processTimes = transitionNode?.data?.processTimes as
          | Record<string, number>
          | undefined;
        let maxProcessingTime = 0;

        if (processTimes) {
          // Find the maximum processing time for any token type involved
          const incomingEdges = edges.filter(
            (edge) => edge.target === transition.id,
          );
          for (const edge of incomingEdges) {
            for (const [tokenTypeId, weight] of Object.entries(
              edge.data?.tokenWeights ?? {},
            )) {
              if ((weight ?? 0) > 0 && processTimes[tokenTypeId]) {
                maxProcessingTime = Math.max(
                  maxProcessingTime,
                  processTimes[tokenTypeId],
                );
              }
            }
          }
        }

        // If processing time is 0, fire immediately
        if (maxProcessingTime <= 0) {
          // Handle conditional outputs if this transition has them
          if (
            transitionNode &&
            transitionNode.data.hasConditions &&
            transitionNode.data.conditions
          ) {
            // Select active condition based on probabilities
            const randomValue = Math.random() * 100;
            let cumulativeProbability = 0;
            let selectedCondition = null;

            // Find the condition that matches the random value
            const conditions = Array.isArray(transitionNode.data.conditions)
              ? transitionNode.data.conditions
              : [];
            for (const condition of conditions) {
              cumulativeProbability +=
                typeof condition.probability === "number"
                  ? condition.probability
                  : 0;
              if (randomValue <= cumulativeProbability) {
                selectedCondition = condition;
                break;
              }
            }

            // If no condition was selected (shouldn't happen if probabilities sum to 100),
            // use the last condition as a fallback
            if (!selectedCondition && conditions.length > 0) {
              selectedCondition = conditions[conditions.length - 1];
            }

            if (selectedCondition) {
              // Get only the edges that are active for this condition
              const activeEdgeIds = selectedCondition.outputEdgeIds ?? [];
              const activeEdges = edges.filter(
                (edge) =>
                  edge.source === transition.id &&
                  Array.isArray(activeEdgeIds) &&
                  activeEdgeIds.includes(edge.id),
              );

              // Log the selected condition
              addLogEntry(
                `Transition "${transitionNode.data.label}" resulted in condition: ${selectedCondition.name} (${selectedCondition.probability}% probability)`,
              );

              // Fire the transition with only the active edges
              const result = handleFireTransition(
                transition.id,
                updatedNodes,
                activeEdges,
                newClockTime,
              );

              updatedNodes = result.nodes;
            } else {
              // If no condition is defined (shouldn't happen), fire with all edges
              const result = handleFireTransition(
                transition.id,
                updatedNodes,
                edges,
                newClockTime,
              );
              updatedNodes = result.nodes;
            }
          } else if (transitionNode?.data.isQualityCheck) {
            // Legacy quality check logic - will be removed in future versions
            // Generate a random number between 0 and 100
            const randomValue = Math.random() * 100;
            const failureProbability =
              transitionNode.data.failureProbability || 0;

            // Determine if the quality check fails
            const qualityCheckFailed = randomValue < failureProbability;

            // Find outgoing edges for success and failure paths
            const outgoingEdges = edges.filter(
              (edge) => edge.source === transition.id,
            );

            // Find edges for success (drug) and failure (failed_drug) paths
            const successEdges = outgoingEdges.filter((edge) => {
              const drugWeight = edge.data?.tokenWeights.drug ?? 0;
              const failedDrugWeight = edge.data?.tokenWeights.failed_drug ?? 0;
              return drugWeight > 0 && failedDrugWeight === 0;
            });

            const failureEdges = outgoingEdges.filter((edge) => {
              const drugWeight = edge.data?.tokenWeights.drug ?? 0;
              const failedDrugWeight = edge.data?.tokenWeights.failed_drug ?? 0;
              return failedDrugWeight > 0 && drugWeight === 0;
            });

            // Create a new array of edges with only the appropriate path
            const activeEdges = qualityCheckFailed
              ? failureEdges
              : successEdges;

            // Log the quality check result
            addLogEntry(
              `Quality check ${qualityCheckFailed ? "FAILED" : "PASSED"} (${randomValue.toFixed(1)}% vs threshold ${failureProbability}%)`,
            );

            // Fire the transition with only the active edges
            const result = handleFireTransition(
              transition.id,
              updatedNodes,
              activeEdges,
              newClockTime,
            );

            updatedNodes = result.nodes;
          } else {
            // For regular transitions, fire normally
            const result = handleFireTransition(
              transition.id,
              updatedNodes,
              edges,
              newClockTime,
            );

            // Use the updated nodes from the result
            updatedNodes = result.nodes;
          }
        } else if (maxProcessingTime < timeStepSize) {
          // If processing time is less than the time step, we need to handle it specially
          // First, mark as in progress
          updatedNodes = updatedNodes.map((node) => {
            if (node.id === transition.id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  inProgress: true,
                  startTime: globalClock, // Start at the beginning of this time step
                  duration: maxProcessingTime,
                  progress: 0,
                },
              };
            }
            return node;
          });

          // Consume input tokens immediately
          const incomingEdges = edges.filter(
            (edge) => edge.target === transition.id,
          );
          for (const edge of incomingEdges) {
            const sourceNode = updatedNodes.find(
              (node) => node.id === edge.source,
            );
            if (!sourceNode || sourceNode.type !== "place") {
              continue;
            }

            const tokenCounts = { ...sourceNode.data.tokenCounts };
            for (const [tokenTypeId, weight] of Object.entries(
              edge.data?.tokenWeights ?? {},
            )) {
              if ((weight ?? 0) > 0) {
                // Update token counts
                tokenCounts[tokenTypeId] =
                  (tokenCounts[tokenTypeId] ?? 0) - (weight ?? 0);

                // Trigger animation for input tokens
                window.dispatchEvent(
                  new CustomEvent("transitionFired", {
                    detail: {
                      edgeId: edge.id,
                      tokenTypeId,
                      isInput: true,
                    },
                  }),
                );
              }
            }

            // Update the source node with new token counts
            updatedNodes = updatedNodes.map((node) => {
              if (node.id === sourceNode.id) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    tokenCounts,
                  },
                };
              }
              return node;
            });
          }

          // Since the transition completes within this time step, fire it immediately
          // Calculate the exact completion time
          const completionTime = globalClock + maxProcessingTime;

          // Handle conditional outputs if this transition has them
          if (
            transitionNode &&
            transitionNode.data.hasConditions &&
            transitionNode.data.conditions
          ) {
            // Select active condition based on probabilities
            const randomValue = Math.random() * 100;
            let cumulativeProbability = 0;
            let selectedCondition = null;

            // Find the condition that matches the random value
            const conditions = Array.isArray(transitionNode.data.conditions)
              ? transitionNode.data.conditions
              : [];
            for (const condition of conditions) {
              cumulativeProbability +=
                typeof condition.probability === "number"
                  ? condition.probability
                  : 0;
              if (randomValue <= cumulativeProbability) {
                selectedCondition = condition;
                break;
              }
            }

            // If no condition was selected (shouldn't happen if probabilities sum to 100),
            // use the last condition as a fallback
            if (!selectedCondition && conditions.length > 0) {
              selectedCondition = conditions[conditions.length - 1];
            }

            if (selectedCondition) {
              // Get only the edges that are active for this condition
              const activeEdgeIds = selectedCondition.outputEdgeIds ?? [];
              const activeEdges = edges.filter(
                (edge) =>
                  edge.source === transition.id &&
                  Array.isArray(activeEdgeIds) &&
                  activeEdgeIds.includes(edge.id),
              );

              // Log the selected condition
              addLogEntry(
                `Transition "${transitionNode.data.label}" resulted in condition: ${selectedCondition.name} (${selectedCondition.probability}% probability)`,
              );

              // Fire the transition with only the active edges
              const result = handleFireTransition(
                transition.id,
                updatedNodes,
                activeEdges,
                completionTime,
              );

              // Use the updated nodes from the result
              updatedNodes = result.nodes;
            } else {
              // If no condition is defined (shouldn't happen), fire with all edges
              const result = handleFireTransition(
                transition.id,
                updatedNodes,
                edges,
                completionTime,
              );
              updatedNodes = result.nodes;
            }
          } else if (transitionNode && transitionNode.data.isQualityCheck) {
            // Legacy quality check logic - will be removed in future versions
            // Generate a random number between 0 and 100
            const randomValue = Math.random() * 100;
            const failureProbability =
              transitionNode.data.failureProbability || 0;

            // Determine if the quality check fails
            const qualityCheckFailed = randomValue < failureProbability;

            // Find outgoing edges for success and failure paths
            const outgoingEdges = edges.filter(
              (edge) => edge.source === transition.id,
            );

            // Find edges for success (drug) and failure (failed_drug) paths
            const successEdges = outgoingEdges.filter((edge) => {
              const drugWeight = edge.data?.tokenWeights.drug ?? 0;
              const failedDrugWeight = edge.data?.tokenWeights.failed_drug ?? 0;
              return drugWeight > 0 && failedDrugWeight === 0;
            });

            const failureEdges = outgoingEdges.filter((edge) => {
              const drugWeight = edge.data?.tokenWeights.drug ?? 0;
              const failedDrugWeight = edge.data?.tokenWeights.failed_drug ?? 0;
              return failedDrugWeight > 0 && drugWeight === 0;
            });

            // Create a new array of edges with only the appropriate path
            const activeEdges = qualityCheckFailed
              ? failureEdges
              : successEdges;

            // Log the quality check result using a format similar to the new conditional outputs
            addLogEntry(
              `Transition "${transitionNode.data.label}" resulted in condition: ${qualityCheckFailed ? "Fail" : "Pass"} (${qualityCheckFailed ? failureProbability : 100 - failureProbability}% probability)`,
            );

            // Fire the transition with only the active edges
            const result = handleFireTransition(
              transition.id,
              updatedNodes,
              activeEdges,
              newClockTime,
            );

            updatedNodes = result.nodes;
          } else {
            // For regular transitions, fire normally
            const result = handleFireTransition(
              transition.id,
              updatedNodes,
              edges,
              newClockTime,
            );

            // Use the updated nodes from the result
            updatedNodes = result.nodes;
          }

          // Reset the transition's progress state
          updatedNodes = updatedNodes.map((node) => {
            if (node.id === transition.id) {
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
          });
        } else {
          // Otherwise, mark as in progress
          updatedNodes = updatedNodes.map((node) => {
            if (node.id === transition.id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  inProgress: true,
                  startTime: newClockTime,
                  duration: maxProcessingTime,
                  progress: 0,
                },
              };
            }
            return node;
          });

          // Consume input tokens immediately
          const incomingEdges = edges.filter(
            (edge) => edge.target === transition.id,
          );
          for (const edge of incomingEdges) {
            const sourceNode = updatedNodes.find(
              (node) => node.id === edge.source,
            );
            if (!sourceNode || sourceNode.type !== "place") {
              continue;
            }

            const tokenCounts = { ...sourceNode.data.tokenCounts };
            for (const [tokenTypeId, weight] of Object.entries(
              edge.data?.tokenWeights ?? {},
            )) {
              if ((weight ?? 0) > 0) {
                // Update token counts
                tokenCounts[tokenTypeId] =
                  (tokenCounts[tokenTypeId] ?? 0) - (weight ?? 0);

                // Trigger animation for input tokens
                window.dispatchEvent(
                  new CustomEvent("transitionFired", {
                    detail: {
                      edgeId: edge.id,
                      tokenTypeId,
                      isInput: true,
                    },
                  }),
                );
              }
            }

            // Update the source node with new token counts
            updatedNodes = updatedNodes.map((node) => {
              if (node.id === sourceNode.id) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    tokenCounts,
                  },
                };
              }
              return node;
            });
          }
        }
      }
    }

    // Update nodes
    setNodes(updatedNodes);

    // If no transitions are enabled or in progress, stop simulation
    const anyTransitionsActive = updatedNodes.some(
      (node) =>
        node.type === "transition" &&
        (node.data.inProgress ||
          enabledTransitions.some((transition) => transition.id === node.id)),
    );

    if (!anyTransitionsActive) {
      setIsSimulating(false);
    }
  }, [
    nodes,
    edges,
    globalClock,
    timeStepSize,
    setNodes,
    handleFireTransition,
    addLogEntry,
  ]);

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

          <Button size="xs" onClick={handleOpenTokenEditor}>
            Edit Types
          </Button>
        </Box>

        <SimulationControls
          isSimulating={isSimulating}
          onStartSimulation={handleStartSimulation}
          onStopSimulation={handleStopSimulation}
          onSimulationStep={handleSimulationStep}
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
        onClose={handleCloseTokenEditor}
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
      {simulationLogs.length > 0 && (
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
      )}
    </Box>
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
