import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Node, useReactFlow } from "reactflow";

import type { ArcType } from "./types";

const checkTransitionEnabled = (
  transitionId: string,
  nodes: Node[],
  edges: ArcType[],
): boolean => {
  const incomingEdges = edges.filter((edge) => edge.target === transitionId);

  return incomingEdges.every((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    if (!sourceNode || sourceNode.type !== "place") {
      return false;
    }

    const tokenCounts = sourceNode.data.tokenCounts || {};
    return Object.entries(edge.data?.tokenWeights ?? {}).every(
      ([tokenTypeId, requiredWeight]) => {
        const availableTokens = tokenCounts[tokenTypeId] ?? 0;
        return availableTokens >= (requiredWeight ?? 0);
      },
    );
  });
};

type SimulationContextValue = {
  isSimulating: boolean;
  simulationSpeed: number;
  timeStepSize: number;
  globalClock: number;
  simulationLogs: Array<{ id: string; text: string }>;
  setGlobalClock: (clock: number) => void;
  setSimulationSpeed: (speed: number) => void;
  setTimeStepSize: (size: number) => void;
  setIsSimulating: (simulating: boolean) => void;
  resetSimulation: () => void;
  stepSimulation: () => void;
};

const SimulationContext = createContext<SimulationContextValue | undefined>(
  undefined,
);

interface SimulationProviderProps {
  setNodes: (nodes: Node[]) => void;
  children: React.ReactNode;
}

export const SimulationContextProvider = ({
  setNodes,
  children,
}: SimulationProviderProps) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms between steps
  const [timeStepSize, setTimeStepSize] = useState(1); // hours per step
  const [globalClock, setGlobalClock] = useState(0); // Global simulation clock in hours
  const [simulationLogs, setSimulationLogs] = useState<
    Array<{ id: string; text: string }>
  >([]);

  const { getNodes, getEdges } = useReactFlow();

  const resetSimulation = useCallback(() => {
    setIsSimulating(false);
    setSimulationLogs([]);
    setGlobalClock(0);
  }, []);

  const handleFireTransition = useCallback(
    (
      transitionId: string,
      currentNodes: Node[],
      currentEdges: ArcType[],
      currentTime: number,
    ): { nodes: Node[]; nextEventTime: number } => {
      const outgoingEdges = currentEdges.filter(
        (edge) => edge.source === transitionId,
      );

      const newNodes = [...currentNodes];

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

  const handleSimulationStep = useCallback(() => {
    const newClockTime = globalClock + timeStepSize;
    setGlobalClock(newClockTime);

    const nodes = getNodes();
    const edges = getEdges();

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

    // Check if there are any tokens in places that could potentially enable transitions
    const anyTokensInPlaces = updatedNodes.some(
      (node) =>
        node.type === "place" &&
        Object.values(node.data.tokenCounts || {}).some(
          (count) => (count as number) > 0,
        ),
    );

    // Only stop the simulation if there are no active transitions AND no tokens in any places
    if (!anyTransitionsActive && !anyTokensInPlaces) {
      setIsSimulating(false);
    }
  }, [
    getNodes,
    getEdges,
    globalClock,
    timeStepSize,
    setNodes,
    handleFireTransition,
    addLogEntry,
  ]);

  useEffect(() => {
    if (!isSimulating) {
      return undefined;
    }

    const interval = setInterval(handleSimulationStep, simulationSpeed);
    return () => clearInterval(interval);
  }, [isSimulating, simulationSpeed, handleSimulationStep]);

  const contextValue = useMemo(
    () => ({
      globalClock,
      isSimulating,
      resetSimulation,
      setGlobalClock,
      setIsSimulating,
      setSimulationSpeed,
      setTimeStepSize,
      simulationLogs,
      simulationSpeed,
      stepSimulation: handleSimulationStep,
      timeStepSize,
    }),
    [
      globalClock,
      handleSimulationStep,
      isSimulating,
      resetSimulation,
      simulationLogs,
      simulationSpeed,
      timeStepSize,
    ],
  );

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = (): SimulationContextValue => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error("useSimulation must be used within a SimulationProvider");
  }
  return context;
};
