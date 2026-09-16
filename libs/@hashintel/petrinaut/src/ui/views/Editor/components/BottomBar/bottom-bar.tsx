import { use, useEffect, useRef } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../react/state/editor-context";
import {
  type BottomBarVariant,
  UserSettingsContext,
} from "../../../../../react/state/user-settings-context";
import { BottomBarCollapseContext } from "./collapse-context";
import { ModesBar } from "./modes-bar";
import { SingleBar } from "./single-bar";
import { SplitBar } from "./split-bar";
import { useBottomBarLayout } from "./use-bottom-bar-layout";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

import type { BarContentProps } from "./bar-content";

/** Gap between the bar and whatever is below it, canvas or bottom panel. */
const BOTTOM_BAR_GAP = 24;

// Spans the editor so the bar centres on the viewport rather than on the space
// between the panels, and lets clicks through everywhere the bar itself is not.
const bottomBarLaneStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
});

const bottomBarStyle = css({
  display: "flex",
  gap: "[20px]",
  pointerEvents: "auto",
  // A bar wider than the lane overflows rather than squashing its segments:
  // revealing the hidden controls in a cramped window does exactly that.
  flexShrink: 0,
});

/**
 * Only a panel opening or closing animates the bar into place. Folding moves
 * it too, but there the offset follows the width the bar is measured at, frame
 * by frame, and a transition would race that with a curve of its own; a resize
 * drag wants none either, so the bar tracks the edge under the pointer.
 *
 * Both axes ride one transform, which the compositor animates like the panel's
 * own slide. A main-thread property could not stay with it: the frames dropped
 * while a panel's content mounts leave a layout-driven animation behind.
 *
 * Reduced motion is deliberately not honoured here. This transition is not
 * decoration, it is what keeps the bar attached to a panel that animates
 * regardless of the setting, and stopping only the bar detaches it.
 */
const barAnimatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[transform 150ms ease-in-out]",
      },
    },
  },
});

/** The layouts a user can pick between in Settings. */
const barByVariant: Record<BottomBarVariant, React.FC<BarContentProps>> = {
  split: SplitBar,
  modes: ModesBar,
  single: SingleBar,
};

export const BottomBar: React.FC<BarContentProps> = (props) => {
  const { mode, editionMode, onEditionModeChange, onCursorModeChange } = props;
  const isActualMode = mode === "actual";
  const { isPanelAnimating } = use(EditorContext);
  const { bottomBarVariant } = use(UserSettingsContext);
  const BarContent = barByVariant[bottomBarVariant];

  // Fallback to cursor mode when switching away from edit while in a mutative mode.
  useEffect(() => {
    if (mode !== "edit" && editionMode !== "cursor") {
      onEditionModeChange("cursor");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(mode, onEditionModeChange, onCursorModeChange);

  const laneRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const layout = useBottomBarLayout(laneRef, barRef, {
    hasViewportControls: !isActualMode,
    isAnimating: isPanelAnimating,
  });

  return (
    <div
      ref={laneRef}
      className={bottomBarLaneStyle}
      style={{ bottom: BOTTOM_BAR_GAP }}
    >
      <div
        ref={barRef}
        data-bottom-bar
        className={`${bottomBarStyle} ${barAnimatingStyle({ animating: isPanelAnimating })}`}
        style={{
          transform: `translate(${layout.offsetX}px, ${-layout.liftY}px)`,
        }}
      >
        <BottomBarCollapseContext
          value={{
            isCollapsed: layout.isCollapsed,
            reportGroupWidth: layout.reportGroupWidth,
          }}
        >
          <BarContent {...props} />
        </BottomBarCollapseContext>
      </div>
    </div>
  );
};
