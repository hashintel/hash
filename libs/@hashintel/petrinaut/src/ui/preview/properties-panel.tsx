import { use, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { usePanelTarget } from "../../react/state/use-selection";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { GlassPanel } from "../components/glass-panel";
import { SelectedItemProperties } from "../views/Editor/panels/PropertiesPanel/selected-item-properties";
import {
  CodeViewContext,
  type CodeViewTarget,
} from "../views/shared/code-view/context";
import { PreviewCodeView } from "./code-view";

const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 240;
const MAX_WIDTH = 560;

// Docked beside the canvas like the editor's inspector: a flat bordered
// column with square corners, no shadow or blur. Its open width rides a
// custom property so the narrow layout can animate its height from the same
// state without a second set of inline styles.
const previewPanelStyle = css({
  flexShrink: "0",
  width: "[var(--preview-panel-width)]",
  minHeight: "0",
  overflow: "hidden",
  borderLeftWidth: "thin",
  "@media (max-width: 640px)": {
    width: "auto",
    height: "[var(--preview-panel-height)]",
    borderLeftWidth: "0",
    borderTopWidth: "thin",
  },
});

const animatedPanelStyle = css({
  transition: "[width 180ms ease-in-out]",
  "@media (max-width: 640px)": {
    transition: "[height 180ms ease-in-out]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
  // A drag tracks the pointer, so the width it writes must not be animated.
  "&:has([data-resizing='true'])": {
    transition: "[none]",
  },
});

const previewPanelContentStyle = css({
  overflowY: "auto",
});

// The inspector content is shared with the full editor and sized for it;
// rendering it slightly smaller keeps the embed sheet compact without forking
// the editor components.
//
// The zoom belongs on the scrolling box itself: the property content fills its
// host with `flex: 1` against `height: 100%`, and a plain wrapper in between
// has no height of its own to give it, which collapses the whole subtree.
// Code is exempt, being monospaced at a size chosen for this view.
const scaledContentStyle = css({
  overflowY: "auto",
  zoom: "[0.85]",
});

/**
 * Space-constrained shell for the shared selected-item property content. It is
 * a column docked to the right of the canvas at normal embed widths and a band
 * under it on narrow viewports; the entity-specific content is identical to
 * the full editor.
 *
 * The shell stays mounted so opening and closing it animates, and it hosts the
 * read-only code view that the property panels link to.
 */
export const PreviewPropertiesPanel: React.FC<{ className?: string }> = ({
  className,
}) => {
  const panelTarget = usePanelTarget();
  const { showAnimations } = use(UserSettingsContext);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [codeTarget, setCodeTarget] = useState<CodeViewTarget | null>(null);

  const isOpen = panelTarget.kind !== "none";

  /**
   * Selecting something else leaves the code of the last selection behind, so
   * the panel returns to properties whenever the selection changes. Adjusting
   * during render rather than in an effect keeps the two from disagreeing for
   * a frame.
   */
  const [lastPanelTarget, setLastPanelTarget] = useState(panelTarget);
  if (lastPanelTarget !== panelTarget) {
    setLastPanelTarget(panelTarget);
    setCodeTarget(null);
  }

  /**
   * The content follows the selection, so a closing panel is an empty box for
   * the length of the transition. That is what stops the canvas jumping, which
   * is the point of animating it.
   */
  const content = codeTarget ? (
    <PreviewCodeView target={codeTarget} onBack={() => setCodeTarget(null)} />
  ) : (
    <SelectedItemProperties />
  );

  return (
    <GlassPanel
      className={cx(
        previewPanelStyle,
        showAnimations && animatedPanelStyle,
        className,
      )}
      contentClassName={
        codeTarget ? previewPanelContentStyle : scaledContentStyle
      }
      resizable={
        isOpen
          ? {
              edge: "left",
              size: width,
              onResize: setWidth,
              minSize: MIN_WIDTH,
              maxSize: MAX_WIDTH,
            }
          : undefined
      }
      style={
        {
          "--preview-panel-width": isOpen ? `${width}px` : "0px",
          "--preview-panel-height": isOpen ? "min(40%, 240px)" : "0px",
        } as React.CSSProperties
      }
    >
      <CodeViewContext value={{ open: setCodeTarget }}>
        {content}
      </CodeViewContext>
    </GlassPanel>
  );
};
