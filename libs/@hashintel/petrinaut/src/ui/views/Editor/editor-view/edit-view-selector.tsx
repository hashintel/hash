import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import {
  useEditorActions,
  useEditorState,
} from "../../../../react/state/editor-context";
import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";
import { styleRef } from "../../../lib/readings";

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
  },
});

export const EditViewSelector = () => {
  const editViewMode = useEditorState((editor) => editor.editViewMode);
  const { setEditViewMode } = useEditorActions();
  const { leftSidebarWidth } = usePanelSizes();
  const { shown } = usePanelPresence();
  const { showAnimations } = use(UserSettingsContext);
  const isCanvas = editViewMode === "canvas";

  return (
    <div
      className={cx(selectorStyle, placementStyle({ floating: isCanvas }))}
      // Over the canvas the selector sits beside the left sidebar, as far as
      // that is in view.
      ref={styleRef({
        left: () =>
          `min(${12 + (isCanvas ? shown.leftSidebar.get() * leftSidebarWidth.get() : 0)}px, max(12px, calc(100% - var(--edit-view-selector-width) - 12px)))`,
      })}
      style={{ top: isCanvas ? 12 : 10 }}
    >
      <SegmentedControl
        className={controlStyle({
          floating: isCanvas,
          animated: showAnimations,
        })}
        aria-label="Edit view"
        size="xs"
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
