import { createContext, type RefObject, use } from "react";

/**
 * Context that provides a ref to a portal container element living inside a
 * Panda-scoped subtree (see `scopedThemeConfig` in `../preset`).
 *
 * Portalled components in this library (e.g. `Tooltip`) read this context and
 * pass the ref to Ark UI's `<Portal container>` so that portalled content
 * inherits the scoped CSS variables instead of being rendered at document body
 * and falling outside the scope selector.
 *
 * When unset, portals fall back to Ark UI's default container (document body),
 * which is correct for consumers that apply the preset globally.
 */
export const PortalContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

export const usePortalContainerRef = ():
  | RefObject<HTMLElement | null>
  | undefined => {
  const ref = use(PortalContainerContext);
  return ref ?? undefined;
};
