import { animateValue, cancelFrame, frame, type MotionValue } from "motion";
import { useLayoutEffect, useState } from "react";

import { useAssistantPlacement } from "./assistant-placement-context";
import { useEditorFields } from "./editor-context";
import {
  assistantWantsRoom,
  createPanelPresence,
  type PanelPlacement,
} from "./panel-presence";
import { PanelPresenceContext } from "./panel-presence-context";
import { useUserSettings } from "./user-settings-context";

/** How a panel slides in and out. The duration is in milliseconds. */
const panelTransition = { duration: 150, ease: [0.16, 1, 0.3, 1] } as const;
/** How the AI assistant arrives, leaves, docks and floats. */
const assistantTransition = { duration: 150, ease: "easeInOut" } as const;

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Takes a Motion value to `target` whenever the target changes: animated, or
 * in one step where the user wants no animation. A change of target while an
 * animation runs starts the next one from where the value is.
 */
const useAnimatedTo = (
  value: MotionValue<number>,
  target: number,
  transition: typeof panelTransition | typeof assistantTransition,
  animated: boolean,
) => {
  // A layout effect, so the first frame of the animation is the frame in
  // which React shows the panel's new state.
  useLayoutEffect(() => {
    if (value.get() === target) {
      return;
    }
    if (!animated || prefersReducedMotion()) {
      value.jump(target);
      return;
    }
    // An animation of a number that sets the value, which is all a slide
    // needs: Motion's `animate` also animates elements, and adds five times
    // the code of everything else this editor takes from Motion.
    const animation = animateValue({
      keyframes: [value.get(), target],
      duration: transition.duration,
      ease: transition.ease,
      onUpdate: (latest) => value.set(latest),
    });
    // Motion counts an animation's time from this call. The render that
    // opens a panel can take as long as several frames, and the first frame
    // drawn would then show most of the slide already done. Counting from
    // that first frame shows the slide from its start, as a CSS transition
    // does.
    const startOnFirstFrame = () => {
      animation.time = 0;
    };
    frame.read(startOnFirstFrame);
    return () => {
      cancelFrame(startOnFirstFrame);
      animation.stop();
    };
  }, [value, target, transition, animated]);
};

/**
 * Owns the panels' presence: starts the values where the editor's state puts
 * the panels, and has Motion animate them whenever that state changes.
 */
export const PanelPresenceProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const {
    isLeftSidebarOpen,
    isSearchOpen,
    hasSelection,
    isBottomPanelOpen,
    isAiAssistantOpen,
  } = useEditorFields(
    "isLeftSidebarOpen",
    "isSearchOpen",
    "hasSelection",
    "isBottomPanelOpen",
    "isAiAssistantOpen",
  );
  const { placement: assistantPlacement } = useAssistantPlacement();
  const showAnimations = useUserSettings((settings) => settings.showAnimations);

  const placement: PanelPlacement = {
    open: {
      // Search opens the sidebar without its toggle.
      leftSidebar: isLeftSidebarOpen || isSearchOpen,
      // A selection opens the Properties panel.
      propertiesPanel: hasSelection,
      bottomPanel: isBottomPanelOpen,
      aiAssistant: isAiAssistantOpen,
    },
    isAssistantDocked: assistantPlacement === "docked",
  };
  const [presence] = useState(() => createPanelPresence(placement));
  const { shown, aiAssistantDocked, aiAssistantHasRoom } = presence;

  useAnimatedTo(
    shown.leftSidebar,
    placement.open.leftSidebar ? 1 : 0,
    panelTransition,
    showAnimations,
  );
  useAnimatedTo(
    shown.propertiesPanel,
    placement.open.propertiesPanel ? 1 : 0,
    panelTransition,
    showAnimations,
  );
  useAnimatedTo(
    shown.bottomPanel,
    placement.open.bottomPanel ? 1 : 0,
    panelTransition,
    showAnimations,
  );
  useAnimatedTo(
    shown.aiAssistant,
    placement.open.aiAssistant ? 1 : 0,
    assistantTransition,
    showAnimations,
  );
  useAnimatedTo(
    aiAssistantDocked,
    placement.isAssistantDocked ? 1 : 0,
    assistantTransition,
    showAnimations,
  );

  // After the animations above, which this effect relies on having started.
  const wantsRoom = assistantWantsRoom(placement);
  useLayoutEffect(() => {
    if (!wantsRoom) {
      aiAssistantHasRoom.set(0);
      return;
    }
    const takeRoomOnceArrived = () => {
      if (shown.aiAssistant.get() === 1 && aiAssistantDocked.get() === 1) {
        aiAssistantHasRoom.set(1);
      }
    };
    takeRoomOnceArrived();
    const stopWatchingShown = shown.aiAssistant.on(
      "change",
      takeRoomOnceArrived,
    );
    const stopWatchingDocked = aiAssistantDocked.on(
      "change",
      takeRoomOnceArrived,
    );
    return () => {
      stopWatchingShown();
      stopWatchingDocked();
    };
  }, [wantsRoom, shown.aiAssistant, aiAssistantDocked, aiAssistantHasRoom]);

  return (
    <PanelPresenceContext value={presence}>{children}</PanelPresenceContext>
  );
};
