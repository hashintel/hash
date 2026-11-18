import { createReadableStore } from "@hashintel/petrinaut-core";

import {
  DEFAULT_AI_ASSISTANT_WIDTH,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "./panel-defaults";

import type { ReadableStore } from "@hashintel/petrinaut-core";

/**
 * One size a user sets by dragging a panel edge, in CSS pixels.
 *
 * It is held outside React state, so a drag can set it on every pointer move
 * without rendering the editor. An element that depends on it follows it with
 * `styleFromStores`; a component that computes with it reads it with
 * `useStore` and re-renders on each change.
 */
export type PanelSize = ReadableStore<number> & { set(size: number): void };

export type PanelSizeName =
  | "leftSidebarWidth"
  | "propertiesPanelWidth"
  | "bottomPanelHeight"
  | "aiAssistantWidth";

/** The editor's panel sizes: one store each, so a drag of one notifies no reader of another. */
export type PanelSizes = Readonly<Record<PanelSizeName, PanelSize>>;

export const defaultPanelSizes: Readonly<Record<PanelSizeName, number>> = {
  leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
  propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
  bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
  aiAssistantWidth: DEFAULT_AI_ASSISTANT_WIDTH,
};

export const createPanelSizes = (
  initial: Partial<Record<PanelSizeName, number>> = {},
): PanelSizes => {
  const sizes = { ...defaultPanelSizes, ...initial };

  return {
    leftSidebarWidth: createReadableStore(sizes.leftSidebarWidth),
    propertiesPanelWidth: createReadableStore(sizes.propertiesPanelWidth),
    bottomPanelHeight: createReadableStore(sizes.bottomPanelHeight),
    aiAssistantWidth: createReadableStore(sizes.aiAssistantWidth),
  };
};
