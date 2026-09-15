import { use } from "react";

import { Icon } from "@hashintel/ds-components";

import { EditorContext } from "../../../../../react/state/editor-context";
import { ToolbarButton } from "./toolbar-button";

/**
 * Shows or hides the bottom panel. The chevron points where the panel will
 * go; the chart glyph is the design file's reading of the same control, where
 * the panel is where the timeline lives.
 */
export const PanelToggle: React.FC<{ glyph: "chevron" | "chart" }> = ({
  glyph,
}) => {
  const { isBottomPanelOpen, setBottomPanelOpen } = use(EditorContext);

  return (
    <ToolbarButton
      tooltip={isBottomPanelOpen ? "Hide Panel" : "Show Panel"}
      onClick={() => setBottomPanelOpen(!isBottomPanelOpen)}
      ariaLabel={isBottomPanelOpen ? "Hide panel" : "Show panel"}
      ariaExpanded={isBottomPanelOpen}
      isSelected={glyph === "chart" && isBottomPanelOpen}
    >
      {glyph === "chart" ? (
        <Icon name="chartLine" size="sm" />
      ) : isBottomPanelOpen ? (
        <Icon name="chevronDown" size="sm" />
      ) : (
        <Icon name="chevronUp" size="sm" />
      )}
    </ToolbarButton>
  );
};
