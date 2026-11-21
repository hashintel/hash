import { createContext, use } from "react";

export type AssistantPlacement = "docked" | "floating";

export type AssistantPlacementContextValue = {
  /** Beside the editor in a column of its own, or over it as a window. */
  placement: AssistantPlacement;
  setPlacement: (placement: AssistantPlacement) => void;
};

/**
 * Where the AI assistant panel sits. Only the panel reads it, so it is kept
 * out of the editor context, which almost every component reads.
 */
export const AssistantPlacementContext =
  createContext<AssistantPlacementContextValue>({
    placement: "docked",
    setPlacement: () => {},
  });

export const useAssistantPlacement = (): AssistantPlacementContextValue =>
  use(AssistantPlacementContext);
