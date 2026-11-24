import { css } from "@hashintel/ds-helpers/css";

import type { RefObject } from "react";

const overlayHostStyle = css({
  display: "contents",
});

/**
 * Where the design system's overlays mount: menus, tooltips, selects, dialogs
 * and toasts. It is the last child of an editor's root and generates no box,
 * so an overlay is laid out as a child of the root.
 *
 * The overlays have an element of their own because one that closes while a
 * later one is open leaves from before a sibling, and the browser then
 * recalculates the style of everything in the parent. With this host the
 * parent holds the overlays alone, where the root held the whole editor.
 */
export const OverlayHost = ({
  ref,
}: {
  /** The ref given to `PortalContainerContext`. */
  ref: RefObject<HTMLDivElement | null>;
}) => <div ref={ref} className={overlayHostStyle} />;
