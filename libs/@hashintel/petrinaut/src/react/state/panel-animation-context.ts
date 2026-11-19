import { createContext, use } from "react";

/**
 * True for half a second after a panel opens, closes, docks or floats, so the
 * panels switch their CSS transitions on for that change only and not for a
 * resize by drag.
 *
 * It has a context of its own because it changes twice per toggle. As a field
 * of the editor context it rendered every reader of that context both times.
 */
export const PanelAnimatingContext = createContext(false);

export const useIsPanelAnimating = (): boolean => use(PanelAnimatingContext);
