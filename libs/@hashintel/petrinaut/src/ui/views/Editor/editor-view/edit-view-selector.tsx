import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import {
  EditorContext,
  type EditViewMode,
} from "../../../../react/state/editor-context";
import {
  useEffectiveEditViewMode,
  useKanbanViewAvailable,
} from "../../../../react/state/use-effective-edit-view-mode";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";

import type { SegmentedControlItem } from "@hashintel/ds-components";

const selectorStyle = css({
  display: "flex",
  position: "absolute",
  width: "[var(--edit-view-selector-width)]",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  borderRadius: "[6px]",
  backgroundColor: "white.a95",
});

const controlStyle = cva({
  base: {
    "&&": { width: "full", height: "[24px]", boxSizing: "border-box" },
    // Fade the controls so the blur layer stays fully opaque.
    opacity: "[0.8]",
    _hover: { opacity: "[1]" },
    _focusWithin: { opacity: "[1]" },
  },
  variants: {
    animated: {
      true: {
        transition: "[opacity 150ms ease-in-out]",
        "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
      },
    },
    floating: {
      true: {
        "&&": {
          backgroundColor: "[transparent]",
          boxShadow: "[none]",
          outline: "[1px solid {colors.neutral.a60}]",
          outlineOffset: "[-1px]",
        },
        "& [data-part='indicator']": {
          backgroundColor: "white/60",
          borderColor: "neutral.a70",
          boxShadow: "[none]",
        },
      },
    },
  },
});

const placementStyle = cva({
  base: {},
  variants: {
    floating: {
      true: {
        backgroundColor: "white/35",
        backdropFilter: "[blur(8px)]",
      },
    },
    animated: {
      true: {
        transition:
          "[left 150ms cubic-bezier(0.16, 1, 0.3, 1), top 150ms cubic-bezier(0.16, 1, 0.3, 1)]",
        "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
      },
    },
  },
});

/**
 * Definitions is an editing surface, so Actual mode offers only the canvas
 * and, when available, the Kanban board.
 */
export const EditViewSelector = () => {
  const {
    globalMode,
    setEditViewMode,
    isLeftSidebarOpen,
    isSearchOpen,
    leftSidebarWidth,
    isPanelAnimating,
  } = use(EditorContext);
  const { showAnimations } = use(UserSettingsContext);
  const editViewMode = useEffectiveEditViewMode();
  const kanbanAvailable = useKanbanViewAvailable();
  // The canvas and the Kanban board share the floating panels, so the
  // selector clears the left sidebar over both; Definitions has a toolbar.
  const overlaysPanels = editViewMode !== "definitions";
  const left =
    overlaysPanels && (isLeftSidebarOpen || isSearchOpen)
      ? leftSidebarWidth + 12
      : 12;
  const items: SegmentedControlItem<EditViewMode>[] = [
    { label: "Canvas", value: "canvas" },
    ...(globalMode === "edit"
      ? [{ label: "Definitions", value: "definitions" as const }]
      : []),
    ...(kanbanAvailable ? [{ label: "Kanban", value: "kanban" as const }] : []),
  ];

  return (
    <div
      className={cx(
        selectorStyle,
        placementStyle({
          floating: overlaysPanels,
          animated: showAnimations && isPanelAnimating,
        }),
      )}
      style={{
        left: `min(${left}px, max(12px, calc(100% - var(--edit-view-selector-width) - 12px)))`,
        top: overlaysPanels ? 12 : 10,
      }}
    >
      <SegmentedControl
        className={controlStyle({
          floating: overlaysPanels,
          animated: showAnimations,
        })}
        aria-label={globalMode === "actual" ? "Actual view" : "Edit view"}
        size="xs"
        value={editViewMode}
        onChange={setEditViewMode}
        items={items}
      />
    </div>
  );
};
