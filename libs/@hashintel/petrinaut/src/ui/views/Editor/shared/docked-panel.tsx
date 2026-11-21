import { css, cx } from "@hashintel/ds-helpers/css";

import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
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

// The place of a panel among the canvas's siblings, with no box of its own:
// the panel inside it is laid out as a child of the canvas's container.
const dockStyle = css({
  display: "contents",
});

/**
 * A panel docked to an edge of the canvas: it slides in and out with its
 * presence value and is as large as its size value. Its box follows both by
 * direct writes, with no render. `EditorResizers` resizes it.
 *
 * A closed panel is not mounted: it mounts in the render that opens it and
 * unmounts once it has slid out. Its dock stays, an empty element in the
 * panel's place. Without the dock the panel would be inserted beside the
 * canvas, and the browser works out again the style of the element after an
 * inserted or a removed one, with all that is in it: every node and arc.
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
  // A closed panel is still sliding out.
  const isInView = useReading(() => shown.get() > 0);

  return (
    <div className={dockStyle}>
      {(isOpen || isInView) && (
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
      )}
    </div>
  );
};
