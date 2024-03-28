import {
  inferUserEntitiesFromWebPageFlowDefinition,
  researchTaskFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { dummyFlows } from "./dummy-flows";

export type FlowDefinitionsContextType = {
  flowDefinitions: FlowDefinition[];
  setFlowDefinitions: (flowDefinitions: FlowDefinition[]) => void;
  selectedFlow: FlowDefinition;
  setSelectedFlow: (flow: FlowDefinition) => void;
  direction: "DOWN" | "RIGHT";
  setDirection: (direction: "DOWN" | "RIGHT") => void;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

const exampleFlows: FlowDefinition[] = [
  ...dummyFlows,
  inferUserEntitiesFromWebPageFlowDefinition,
  researchTaskFlowDefinition,
];

export const FlowDefinitionsContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [flowDefinitions, setFlowDefinitions] =
    useState<FlowDefinition[]>(exampleFlows);
  const [selectedFlow, setSelectedFlow] = useState(exampleFlows[0]!);

  const [direction, setDirection] = useState<"DOWN" | "RIGHT">("RIGHT");

  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions,
      setFlowDefinitions,
      selectedFlow,
      setSelectedFlow,
      direction,
      setDirection,
    }),
    [flowDefinitions, selectedFlow, direction],
  );

  return (
    <FlowDefinitionsContext.Provider value={context}>
      {children}
    </FlowDefinitionsContext.Provider>
  );
};

export const useFlowDefinitionsContext = () => {
  const flowDefinitionsContext = useContext(FlowDefinitionsContext);

  if (!flowDefinitionsContext) {
    throw new Error("no FlowDefinitionsContext value has been provided");
  }

  return flowDefinitionsContext;
};
