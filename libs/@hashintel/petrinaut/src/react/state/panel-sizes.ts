import { motionValue, type MotionValue } from "motion";

/**
 * One size a user sets by dragging a panel edge, in CSS pixels.
 *
 * It is a Motion value, held outside React state, so a drag can set it on
 * every pointer move without rendering the editor. An element that depends on
 * it follows it with `styleRef`; a component that computes with it reads it
 * with `useReading` and re-renders on each change.
 */
type PanelSize = MotionValue<number>;

type PanelSizeName =
  | "leftSidebarWidth"
  | "propertiesPanelWidth"
  | "bottomPanelHeight"
  | "aiAssistantWidth";

/** The editor's panel sizes: one value each, so a drag of one notifies no reader of another. */
export type PanelSizes = Readonly<Record<PanelSizeName, PanelSize>>;

export const defaultPanelSizes: Readonly<Record<PanelSizeName, number>> = {
  leftSidebarWidth: 280,
  propertiesPanelWidth: 450,
  bottomPanelHeight: 180,
  aiAssistantWidth: 420,
};

export const createPanelSizes = (
  initial: Partial<Record<PanelSizeName, number>> = {},
): PanelSizes => {
  const sizes = { ...defaultPanelSizes, ...initial };

  return {
    leftSidebarWidth: motionValue(sizes.leftSidebarWidth),
    propertiesPanelWidth: motionValue(sizes.propertiesPanelWidth),
    bottomPanelHeight: motionValue(sizes.bottomPanelHeight),
    aiAssistantWidth: motionValue(sizes.aiAssistantWidth),
  };
};
