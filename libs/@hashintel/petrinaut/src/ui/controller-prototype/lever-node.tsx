import { controllersOfNode } from "../../react/controller-prototype/controllers";
import { useControllers } from "../../react/controller-prototype/use-controllers";

import type { LeverKind } from "../../react/controller-prototype/controllers";

export type NodeLever = {
  controllerNames: string[];
  kinds: LeverKind[];
};

/** The controllers that hold a lever over this node, or null when none do. */
export const useNodeLever = (nodeId: string): NodeLever | null => {
  const { controllers } = useControllers();
  const holders = controllersOfNode(controllers, nodeId);
  if (holders.length === 0) {
    return null;
  }
  return {
    controllerNames: holders.map(({ controller }) => controller.name),
    kinds: [...new Set(holders.flatMap(({ kinds }) => kinds))],
  };
};

/** "Scheduler", "Scheduler and Purchasing", "Scheduler, Purchasing and Pricing". */
export const joinNames = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export const leverLabel = (lever: NodeLever): string =>
  `Controlled by ${joinNames(lever.controllerNames)}`;

/**
 * What runs until an AI is trained. A transition keeps its own firing rule; a
 * token field keeps the Transition Results code; a place keeps the initial
 * tokens from Simulation Settings.
 */
export const leverFallback = (
  lever: NodeLever,
  lambdaType: "none" | "predicate" | "stochastic" | null,
): string => {
  if (lambdaType === null) {
    return "Fallback: Initial tokens in Simulation Settings";
  }
  const decidesFiring = lever.kinds.some(
    (kind) => kind === "choice" || kind === "rate",
  );
  if (!decidesFiring) {
    return "Fallback: Transition Results code";
  }
  return lambdaType === "stochastic"
    ? "Fallback: Stochastic Rate"
    : lambdaType === "predicate"
      ? "Fallback: Predicate"
      : "Fallback: Always enabled";
};
