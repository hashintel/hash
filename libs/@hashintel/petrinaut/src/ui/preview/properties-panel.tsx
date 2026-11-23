import { css } from "@hashintel/ds-helpers/css";

import { usePanelTarget } from "../../react/state/use-selection";
import { GlassPanel } from "../shared/glass-panel";
import { SelectedItemProperties } from "../views/Editor/panels/PropertiesPanel/selected-item-properties";

// Docked beside the canvas like the editor's inspector: a flat bordered
// column with square corners, no shadow or blur.
const previewPanelStyle = css({
  flexShrink: "0",
  width: "[clamp(250px, 34vw, 320px)]",
  minHeight: "0",
  overflow: "hidden",
  borderLeftWidth: "thin",
  "@media (max-width: 640px)": {
    width: "auto",
    height: "[min(40%, 240px)]",
    borderLeftWidth: "0",
    borderTopWidth: "thin",
  },
});

const previewPanelContentStyle = css({
  overflowY: "auto",
  // The inspector content is shared with the full editor and sized for it;
  // rendering it slightly smaller keeps the embed sheet compact without
  // forking the editor components.
  zoom: "[0.85]",
});

/**
 * Space-constrained shell for the shared selected-item property content. It is
 * a column docked to the right of the canvas at normal embed widths and a band
 * under it on narrow viewports; the entity-specific content is identical to
 * the full editor.
 */
export const PreviewPropertiesPanel: React.FC = () => {
  const panelTarget = usePanelTarget();

  if (panelTarget.kind === "none") {
    return null;
  }

  return (
    <GlassPanel
      className={previewPanelStyle}
      contentClassName={previewPanelContentStyle}
    >
      <SelectedItemProperties panelTarget={panelTarget} />
    </GlassPanel>
  );
};
