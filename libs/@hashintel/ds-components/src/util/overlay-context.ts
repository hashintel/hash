import { createContext, useContext } from "react";

import type { overlayPartsStyles } from "./overlay-parts.recipe";

/**
 * The Ark UI `Title` / `Description` primitives differ between Dialog and
 * Drawer (each wires up its own `aria-labelledby` / `aria-describedby`), so the
 * owning component injects them through context rather than the shared chrome
 * importing a specific namespace.
 */
export type OverlayPrimitive = React.ElementType;

type OverlayContextValue = {
  classes: ReturnType<typeof overlayPartsStyles>;
  onClose?: () => void;
  renderCloseButton: boolean;
  loading?: boolean;
  Title: OverlayPrimitive;
  Description: OverlayPrimitive;
  /** Sets the close-button label and squares off the Drawer's right edge. */
  componentName: "Dialog" | "Drawer" | "Popover";
  /** Popover-only: whether an outside interaction dismisses it. */
  closeOnInteractOutside?: boolean;
};

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export const useOverlayContext = () => {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error(
      "OverlayHeader, OverlayBody and OverlayFooter must be rendered inside a <Dialog>, <Drawer> or <Popover>",
    );
  }
  return ctx;
};
