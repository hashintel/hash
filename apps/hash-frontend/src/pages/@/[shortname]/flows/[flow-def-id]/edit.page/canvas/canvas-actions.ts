import { createContext, use } from "react";

import { forEachAddId } from "../shared/step-display";

import type {
  FlowConnection,
  FlowEditor,
  NewStepPlacement,
} from "@local/hash-isomorphic-utils/flows/flow-editor";

/** Adds what was picked in the add menu: an action's step, or a for-each step for `forEachAddId`. */
export const addPickedStep = (
  editor: FlowEditor,
  addId: string,
  placement: NewStepPlacement,
) =>
  addId === forEachAddId
    ? editor.addForEach(placement)
    : editor.addStep(addId, placement);

export type CanvasActions = {
  /** `null` on a canvas that can't be edited, such as a run's. */
  editing: {
    /** `null` adds after Start; `outputName` adds after one of the step's paths. */
    openAddMenuAfter: (stepId: string | null, outputName?: string) => void;
    /** Adds a step inside a for-each step, in its box's first free place. */
    openAddMenuInside: (forEachStepId: string) => void;
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
