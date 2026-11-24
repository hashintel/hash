import {
  MAX_BOTTOM_PANEL_HEIGHT,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_BOTTOM_PANEL_HEIGHT,
  MIN_LEFT_SIDEBAR_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
} from "../../../shared/ui-constants";

/**
 * The panels docked to an edge of the canvas: the edge each slides in from,
 * where its size is kept and saved, and the sizes a drag of its inner edge
 * may give it.
 */
export const docks = {
  leftSidebar: {
    edge: "left",
    label: "Resize the left sidebar",
    size: "leftSidebarWidth",
    saveSize: "setLeftSidebarWidth",
    minSize: MIN_LEFT_SIDEBAR_WIDTH,
    maxSize: MAX_LEFT_SIDEBAR_WIDTH,
  },
  propertiesPanel: {
    edge: "right",
    label: "Resize the properties panel",
    size: "propertiesPanelWidth",
    saveSize: "setPropertiesPanelWidth",
    minSize: MIN_PROPERTIES_PANEL_WIDTH,
    maxSize: MAX_PROPERTIES_PANEL_WIDTH,
  },
  bottomPanel: {
    edge: "bottom",
    label: "Resize the bottom panel",
    size: "bottomPanelHeight",
    saveSize: "setBottomPanelHeight",
    minSize: MIN_BOTTOM_PANEL_HEIGHT,
    maxSize: MAX_BOTTOM_PANEL_HEIGHT,
  },
} as const;

export type DockName = keyof typeof docks;
