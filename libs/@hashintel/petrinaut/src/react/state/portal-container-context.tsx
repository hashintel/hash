import { createContext, type RefObject, use } from "react";

/**
 * Context that provides a ref to a portal container element.
 * Portalled content (tooltips, menus, etc.) should render into this
 * container so they escape overflow:hidden panels while staying
 * inside the `.petrinaut-root` CSS variable scope.
 */
export const PortalContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

export const usePortalContainerRef = ():
  | RefObject<HTMLElement | null>
  | undefined => {
  const ref = use(PortalContainerContext);
  return ref ?? undefined;
};
