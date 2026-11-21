import { motionValue, type MotionValue } from "motion";

export type PanelName =
  | "leftSidebar"
  | "propertiesPanel"
  | "bottomPanel"
  | "aiAssistant";

/**
 * Where the editor's panels are between closed and open, and the AI assistant
 * between floating and docked, as Motion values.
 *
 * Motion animates them when a panel opens, closes, docks or floats. A panel
 * slides by the value it is bound to, and whatever keeps clear of the panels
 * follows the same values through the canvas insets. No component renders for
 * a frame of the animation, and no CSS transition is involved.
 */
export type PanelPresence = {
  /** How far each panel is in view, from 0 (closed) to 1 (open). */
  readonly shown: Readonly<Record<PanelName, MotionValue<number>>>;
  /** How far the AI assistant is docked: 0 is a window over the editor, 1 a column beside it. */
  readonly aiAssistantDocked: MotionValue<number>;
  /**
   * 1 while the docked assistant has the room beside the editor, 0 while the
   * editor has it. It changes in one step, because each change lays the whole
   * editor out: at once when the assistant leaves, so the editor already
   * shows under it, and when the assistant has arrived and covers the room.
   */
  readonly aiAssistantHasRoom: MotionValue<number>;
};

/** Which panels are open and where the assistant sits, as the editor's state has it. */
export type PanelPlacement = {
  readonly open: Readonly<Record<PanelName, boolean>>;
  readonly isAssistantDocked: boolean;
};

/** Whether the docked assistant is to have the room beside the editor. */
export const assistantWantsRoom = ({
  open,
  isAssistantDocked,
}: PanelPlacement): boolean => open.aiAssistant && isAssistantDocked;

/** The values at rest in a given placement, with nothing animating. */
export const createPanelPresence = (
  placement: PanelPlacement,
): PanelPresence => {
  const shown = (name: PanelName) => motionValue(placement.open[name] ? 1 : 0);

  return {
    shown: {
      leftSidebar: shown("leftSidebar"),
      propertiesPanel: shown("propertiesPanel"),
      bottomPanel: shown("bottomPanel"),
      aiAssistant: shown("aiAssistant"),
    },
    aiAssistantDocked: motionValue(placement.isAssistantDocked ? 1 : 0),
    aiAssistantHasRoom: motionValue(assistantWantsRoom(placement) ? 1 : 0),
  };
};

/**
 * How much of the docked assistant's width lies over the editor and not
 * beside it: all of it while the assistant arrives or leaves, none once it
 * has the room. What floats over the canvas keeps clear of this much more of
 * the right edge, so it slides out of the assistant's way while the editor
 * itself keeps its width.
 */
export const assistantCover = (
  { shown, aiAssistantDocked, aiAssistantHasRoom }: PanelPresence,
  assistantWidth: number,
): number =>
  Math.max(
    0,
    shown.aiAssistant.get() * aiAssistantDocked.get() -
      aiAssistantHasRoom.get(),
  ) * assistantWidth;
