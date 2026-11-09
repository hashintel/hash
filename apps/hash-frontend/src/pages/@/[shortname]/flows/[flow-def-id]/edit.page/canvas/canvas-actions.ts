import { createContext, use } from "react";

import type { FlowConnection } from "@local/hash-isomorphic-utils/flows/flow-editor";

export type CanvasActions = {
  /** `null` adds after Start. */
  openAddMenuAfter: (anchor: Element, stepId: string | null) => void;
  removeConnection: (connection: FlowConnection) => void;
  toggleCollapsed: (stepId: string) => void;
};

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const useCanvasActions = () => {
  const actions = use(CanvasActionsContext);

  if (!actions) {
    throw new Error("Canvas nodes and edges must be drawn in the canvas");
  }

  return actions;
};
