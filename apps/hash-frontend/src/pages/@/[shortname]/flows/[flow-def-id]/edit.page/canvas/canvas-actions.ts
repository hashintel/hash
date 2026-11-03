import { createContext, use } from "react";

import type { FlowConnection } from "@local/hash-isomorphic-utils/flows/flow-editor";

/** What the canvas's nodes and edges can ask it to do. */
export type CanvasActions = {
  /** Opens the "+" list beside `anchor`, to add a step after the given one, or after Start if `null`. */
  openAddMenuAfter: (anchor: Element, stepId: string | null) => void;
  removeConnection: (connection: FlowConnection) => void;
};

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const useCanvasActions = () => {
  const actions = use(CanvasActionsContext);

  if (!actions) {
    throw new Error("Canvas nodes and edges must be drawn in the canvas");
  }

  return actions;
};
