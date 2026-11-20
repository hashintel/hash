import { css, cx } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../components/glass-panel";
import {
  MAX_BOTTOM_PANEL_HEIGHT,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_BOTTOM_PANEL_HEIGHT,
  MIN_LEFT_SIDEBAR_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
} from "../../../constants/ui";
import { type BoundStyle, styleRef, useReading } from "../../../lib/readings";
import { slideFromEdge } from "./slide-from-edge";

import type { CSSProperties, ReactNode } from "react";

/** The edge each panel slides in from, and the size a drag of its opposite edge changes. */
const docks = {
  leftSidebar: {
    edge: "left",
    resizeEdge: "right",
    size: "leftSidebarWidth",
    saveSize: "setLeftSidebarWidth",
    minSize: MIN_LEFT_SIDEBAR_WIDTH,
    maxSize: MAX_LEFT_SIDEBAR_WIDTH,
  },
  propertiesPanel: {
    edge: "right",
    resizeEdge: "left",
    size: "propertiesPanelWidth",
    saveSize: "setPropertiesPanelWidth",
    minSize: MIN_PROPERTIES_PANEL_WIDTH,
    maxSize: MAX_PROPERTIES_PANEL_WIDTH,
  },
  bottomPanel: {
    edge: "bottom",
    resizeEdge: "top",
    size: "bottomPanelHeight",
    saveSize: "setBottomPanelHeight",
    minSize: MIN_BOTTOM_PANEL_HEIGHT,
    maxSize: MAX_BOTTOM_PANEL_HEIGHT,
  },
} as const;

// Where the panel is comes from its presence value; this is only what a
// closed panel must not do.
const closedPanelStyle = css({
  pointerEvents: "none",
});

/**
 * A panel docked to an edge of the canvas: it slides in and out with its
 * presence value, is resized by its inner edge, and saves the size when the
 * drag ends. Its box follows Motion values by direct writes, with no render.
 */
export const DockedPanel = ({
  panel,
  isOpen,
  className,
  contentClassName,
  style,
  boundStyle,
  pushedBy,
  children,
}: {
  panel: keyof typeof docks;
  isOpen: boolean;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  /** What the box follows besides its size and its slide. */
  boundStyle?: BoundStyle;
  /** The pixels by which the panel makes way for another. */
  pushedBy?: () => number;
  children: ReactNode;
}) => {
  const { edge, resizeEdge, minSize, maxSize, ...names } = docks[panel];
  const size = usePanelSizes()[names.size];
  const shown = usePanelPresence().shown[panel];
  // Still sliding out, where a closed panel is not kept mounted.
  const isInView = useReading(() => shown.get() > 0);
  const keepPanelsMounted = useUserSettings(
    (settings) => settings.keepPanelsMounted,
  );
  const saveSize = useUserSettings((settings) => settings[names.saveSize]);

  if (!isOpen && !isInView && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(className, !isOpen && closedPanelStyle)}
      ref={styleRef({
        [edge === "bottom" ? "height" : "width"]: size,
        ...boundStyle,
        transform: () => slideFromEdge(edge, shown.get(), pushedBy?.()),
      })}
      style={style}
      contentClassName={contentClassName}
      resizable={{
        edge: resizeEdge,
        getSize: () => size.get(),
        onResize: (nextSize) => size.set(nextSize),
        onResizeEnd: () => saveSize(size.get()),
        minSize,
        maxSize,
      }}
    >
      {children}
    </GlassPanel>
  );
};
