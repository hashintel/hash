import { createContext, type ReactNode, type RefObject } from "react";

export interface SimulationPanelProps {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  layer?: "resource" | "creation";
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export const PanelContext = createContext<
  Pick<SimulationPanelProps, "title" | "onClose" | "closeDisabled">
>({
  title: "",
  onClose: () => {},
});

/** True while a panel that went away is kept for its closing transition. */
export const PanelExitingContext = createContext(false);

/** How long it is kept, in milliseconds: the panel's closing transition. */
export const panelExitDuration = 120;
