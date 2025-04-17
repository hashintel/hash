import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useEditorContext } from "./editor-context";
import type {
  ArcType,
  NodeType,
  PlaceNodeType,
  TransitionNodeType,
} from "./types";

/**
 * Check if a transition is enabled, i.e. that the tokens required by each incoming arc are available in the source place.
 */
const checkTransitionEnabled = (
  transitionId: string,
  nodes: NodeType[],
  arcs: ArcType[],
): boolean => {
  const incomingArcs = arcs.filter((arc) => arc.target === transitionId);

  return incomingArcs.every((arc) => {
    const sourceNode = nodes.find((node) => node.id === arc.source);

    if (!sourceNode || sourceNode.data.type !== "place") {
      throw new Error(`Could not find source place node for arc ${arc.id}`);
    }

    const tokenCounts = sourceNode.data.tokenCounts;

    return Object.entries(arc.data?.tokenWeights ?? {}).every(
      ([tokenTypeId, requiredWeight]) => {
        const availableTokens = tokenCounts[tokenTypeId] ?? 0;
        return availableTokens >= (requiredWeight ?? 0);
      },
    );
  });
};

type SimulationContextValue = {
  currentStep: number;
  fireNextStep: () => void;
  isSimulating: boolean;
  simulationSpeed: number;
  simulationLogs: Array<{ id: string; text: string }>;
  setSimulationSpeed: (speed: number) => void;
  setIsSimulating: (simulating: boolean) => void;
  resetSimulation: () => void;
};

const SimulationContext = createContext<SimulationContextValue | undefined>(
  undefined,
);

interface SimulationProviderProps {
  children: React.ReactNode;
}

export const SimulationContextProvider = ({
  children,
}: SimulationProviderProps) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms delay between each step occuring when simulating
  const [currentStep, setCurrentStep] = useState(0);
  const [simulationLogs, setSimulationLogs] = useState<
    Array<{ id: string; text: string }>
  >([]);

  const { arcs, nodes, setNodes } = useEditorContext();

  const resetSimulation = useCallback(() => {
    setIsSimulating(false);
    setSimulationLogs([]);
    setCurrentStep(0);
  }, []);

  const addLogEntry = useCallback(
    (message: string) => {
      const timestamp = Date.now();
      setSimulationLogs((prevLogs) => {
        const newLog = {
          id: `log-${timestamp}-${prevLogs.length}`,
          text: `[Step ${currentStep}] ${message}`,
        };
        return [...prevLogs, newLog];
      });
    },
    [currentStep],
  );

  const fireNextStep = useCallback(() => {
    setCurrentStep((prevStep) => prevStep + 1);

    const enabledTransitions = nodes
      .filter((node) => node.type === "transition")
      .filter((node) => checkTransitionEnabled(node.id, nodes, arcs));

    if (enabledTransitions.length === 0) {
      setIsSimulating(false);
      return;
    }

    const updatedNodes: NodeType[] = JSON.parse(JSON.stringify(nodes));

    for (const transition of enabledTransitions) {
      const transitionNode = nodes.find(
        (node): node is TransitionNodeType =>
          node.id === transition.id && node.data.type === "transition",
      );

      if (!transitionNode) {
        throw new Error(`Transition node ${transition.id} not found`);
      }

      let outgoingArc: ArcType | undefined;
      if (transitionNode.data.conditions?.length) {
        /**
         * If the transition has multiple outputs, we need to select one of them randomly based on the probability of each condition.
         */
        const randomValue = Math.random() * 100;
        let cumulativeProbability = 0;
        let selectedCondition = null;

        for (const condition of transitionNode.data.conditions) {
          cumulativeProbability +=
            typeof condition.probability === "number"
              ? condition.probability
              : 0;

          if (randomValue <= cumulativeProbability) {
            selectedCondition = condition;
            break;
          }
        }

        if (!selectedCondition) {
          throw new Error("No condition was selected");
        }

        outgoingArc = arcs.find(
          (arc) =>
            arc.source === transition.id &&
            arc.id === selectedCondition.outputEdgeId,
        );

        addLogEntry(
          `Transition "${transitionNode.data.label}" resulted in condition: ${selectedCondition.name} (${selectedCondition.probability}% probability)`,
        );
      } else {
        /**
         * If the transition has only one output, we can just use that.
         */
        outgoingArc = arcs.find((arc) => arc.source === transition.id);
      }

      if (!outgoingArc) {
        throw new Error(
          `Outgoing edge for transition ${transition.id} not found`,
        );
      }

      const incomingArcs = arcs.filter((arc) => arc.target === transition.id);

      if (incomingArcs.length === 0) {
        throw new Error(
          `Expected at least 1 incoming arc for transition ${transition.id}`,
        );
      }

      /**
       * Update the token counts of each source node based on the requirements of the incoming arc.
       */
      for (const incomingArc of incomingArcs) {
        const sourceNode = updatedNodes.find(
          (node): node is PlaceNodeType =>
            node.id === incomingArc.source && node.data.type === "place",
        );

        if (!sourceNode) {
          throw new Error(
            `Source node for transition ${transition.id} not found`,
          );
        }

        for (const [tokenTypeId, weight] of Object.entries(
          incomingArc.data?.tokenWeights ?? {},
        )) {
          if (!weight) {
            continue;
          }

          sourceNode.data.tokenCounts[tokenTypeId] =
            (sourceNode.data.tokenCounts[tokenTypeId] ?? 0) - weight;

          /**
           * This triggers the token animating along the input arc.
           * To fully separate simulation logic from the UI, we should instead have the 'step' function be something the UI can call,
           * and return the fired transitions from it.
           */
          window.dispatchEvent(
            new CustomEvent("animateTokenAlongArc", {
              detail: {
                arcId: incomingArc.id,
                tokenTypeId,
              },
            }),
          );
        }
      }

      const targetNode = updatedNodes.find(
        (node): node is PlaceNodeType =>
          node.id === outgoingArc.target && node.data.type === "place",
      );

      if (!targetNode) {
        throw new Error(
          `Target node for transition ${transition.id} not found`,
        );
      }
      for (const [tokenTypeId, weight] of Object.entries(
        outgoingArc.data?.tokenWeights ?? {},
      )) {
        if (!weight) {
          continue;
        }

        targetNode.data.tokenCounts[tokenTypeId] =
          (targetNode.data.tokenCounts[tokenTypeId] ?? 0) + weight;

        /**
         * This triggers the token animating along the output arc.
         * To fully separate simulation logic from the UI, we should instead have the 'step' function be something the UI can call,
         * and return the fired transitions from it.
         */
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("animateTokenAlongArc", {
              detail: {
                arcId: outgoingArc.id,
                tokenTypeId,
              },
            }),
          );
          /**
           * Delay the animation so that it starts after the token animating across the input arc has finished.
           */
        }, simulationSpeed / 2);
      }
    }

    setNodes(updatedNodes);
  }, [arcs, nodes, setNodes, addLogEntry, simulationSpeed]);

  useEffect(() => {
    if (!isSimulating) {
      return undefined;
    }

    const interval = setInterval(fireNextStep, simulationSpeed);

    return () => clearInterval(interval);
  }, [isSimulating, simulationSpeed, fireNextStep]);

  const contextValue = useMemo(
    () => ({
      currentStep,
      fireNextStep,
      isSimulating,
      resetSimulation,
      setIsSimulating,
      setSimulationSpeed,
      simulationLogs,
      simulationSpeed,
    }),
    [
      currentStep,
      fireNextStep,
      isSimulating,
      resetSimulation,
      setIsSimulating,
      setSimulationSpeed,
      simulationLogs,
      simulationSpeed,
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
