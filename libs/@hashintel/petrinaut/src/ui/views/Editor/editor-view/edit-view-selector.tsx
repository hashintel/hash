import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";

const selectorStyle = css({
  position: "absolute",
  width: "[var(--edit-view-selector-width)]",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  borderRadius: "[8px]",
  backgroundColor: "white.a95",
});

const controlStyle = css({
  "&&": { width: "full", boxSizing: "border-box" },
});

const placementStyle = cva({
  base: {},
  variants: {
    floating: {
      true: { boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.08)]" },
    },
    animated: {
      true: {
        transition:
          "[left 150ms ease-in-out, top 150ms ease-in-out, box-shadow 150ms ease-in-out]",
        "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
      },
    },
  },
});

export const EditViewSelector = () => {
  const {
    editViewMode,
    setEditViewMode,
    isLeftSidebarOpen,
    isSearchOpen,
    leftSidebarWidth,
  } = use(EditorContext);
  const { showAnimations } = use(UserSettingsContext);
  const isCanvas = editViewMode === "canvas";
  const left =
    isCanvas && (isLeftSidebarOpen || isSearchOpen)
      ? leftSidebarWidth + 12
      : 12;

  return (
    <div
      className={cx(
        selectorStyle,
        placementStyle({ floating: isCanvas, animated: showAnimations }),
      )}
      style={{
        left: `min(${left}px, max(12px, calc(100% - var(--edit-view-selector-width) - 12px)))`,
        top: isCanvas ? 12 : 8,
      }}
    >
      <SegmentedControl
        className={controlStyle}
        aria-label="Edit view"
        size="sm"
        value={editViewMode}
        onChange={setEditViewMode}
        items={[
          { label: "Canvas", value: "canvas" },
          { label: "Definitions", value: "definitions" },
        ]}
      />
    </div>
  );
};
