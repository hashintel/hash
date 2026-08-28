import { css, cx } from "@hashintel/ds-helpers/css";

import { usePanelTarget } from "../../react/state/use-selection";
import { GlassPanel } from "../components/glass-panel";
import { SelectedItemProperties } from "../views/Editor/panels/PropertiesPanel/selected-item-properties";

const previewPanelStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) - 3)]",
  top: "2",
  right: "2",
  bottom: "[72px]",
  width: "[clamp(280px, 36vw, 360px)]",
  overflow: "hidden",
  borderWidth: "thin",
  borderRadius: "lg",
  boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.14)]",
  "@media (max-width: 640px)": {
    top: "[auto]",
    left: "2",
    width: "auto",
    height: "[min(42%, 280px)]",
  },
});

const previewPanelContentStyle = css({
  overflowY: "auto",
});

/**
 * Space-constrained shell for the shared selected-item property content. It is
 * a side panel at normal embed widths and becomes a bottom sheet on narrow
 * viewports; the entity-specific content is identical to the full editor.
 */
export const PreviewPropertiesPanel: React.FC<{ className?: string }> = ({
  className,
}) => {
  const panelTarget = usePanelTarget();

  if (panelTarget.kind === "none") {
    return null;
  }

  return (
    <GlassPanel
      className={cx(previewPanelStyle, className)}
      contentClassName={previewPanelContentStyle}
    >
      <SelectedItemProperties />
    </GlassPanel>
  );
};
