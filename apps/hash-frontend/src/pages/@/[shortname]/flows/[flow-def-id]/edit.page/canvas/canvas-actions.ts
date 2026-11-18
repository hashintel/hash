import { createContext, use } from "react";

import type { FlowConnection } from "@local/hash-isomorphic-utils/flows/flow-editor";

export type CanvasActions = {
  /** `null` on a canvas that can't be edited, such as a run's. */
  editing: {
    /** `null` adds after Start. */
    openAddMenuAfter: (stepId: string | null) => void;
    removeConnection: (connection: FlowConnection) => void;
  } | null;
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
