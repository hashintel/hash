import { createContext, use } from "react";

import { createPanelPresence, type PanelPresence } from "./panel-presence";

/**
 * The panels' presence. The values keep one identity for the editor's life,
 * so reading this context never re-renders its reader.
 */
export const PanelPresenceContext = createContext<PanelPresence>(
  createPanelPresence({
    open: {
      leftSidebar: false,
      propertiesPanel: false,
      bottomPanel: false,
      aiAssistant: false,
    },
    isAssistantDocked: true,
  }),
);

export const usePanelPresence = (): PanelPresence => use(PanelPresenceContext);
