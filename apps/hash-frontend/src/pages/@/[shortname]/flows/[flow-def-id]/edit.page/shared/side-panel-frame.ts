import { css } from "@hashintel/ds-helpers/css";

/** Where the panel sits, for what opens in its place, e.g. a value from it. */
export const sidePanelFrame = css({
  position: "absolute",
  zIndex: "docked",
  top: "0",
  right: "0",
  bottom: "0",
  width: "[384px]",
  bg: "bgSolid.min",
  borderLeftWidth: "1px",
  borderLeftStyle: "solid",
  borderLeftColor: "bd.subtle",
});
