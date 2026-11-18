import { createContext, use } from "react";

import { createPanelSizes } from "./panel-sizes";

import type { PanelSizes } from "./panel-sizes";

/**
 * The editor's panel sizes. The stores keep one identity for the editor's
 * life, so reading this context never re-renders its reader.
 */
export const PanelSizesContext = createContext<PanelSizes>(createPanelSizes());

export const usePanelSizes = (): PanelSizes => use(PanelSizesContext);
