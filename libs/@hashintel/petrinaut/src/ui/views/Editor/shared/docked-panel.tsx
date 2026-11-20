import { css, cx } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../components/glass-panel";
import { type BoundStyle, styleRef, useReading } from "../../../lib/readings";
import { docks, type DockName } from "./docks";
import { slideFromEdge } from "./slide-from-edge";

import type { CSSProperties, ReactNode } from "react";

// Where the panel is comes from its presence value; this is only what a
// closed panel must not do.
const closedPanelStyle = css({
  pointerEvents: "none",
});

/**
 * A panel docked to an edge of the canvas: it slides in and out with its
 * presence value and is as large as its size value. Its box follows both by
 * direct writes, with no render. `DockResizers` resizes it.
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
  panel: DockName;
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
  const { edge, ...names } = docks[panel];
  const size = usePanelSizes()[names.size];
  const shown = usePanelPresence().shown[panel];
  // Still sliding out, where a closed panel is not kept mounted.
  const isInView = useReading(() => shown.get() > 0);
  const keepPanelsMounted = useUserSettings(
    (settings) => settings.keepPanelsMounted,
  );

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
    >
      {children}
    </GlassPanel>
  );
};
