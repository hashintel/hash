import { css } from "@hashintel/ds-helpers/css";

export const collapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",
  "&[data-state=open]": {
    animationName: "expand",
  },
  "&[data-state=closed]": {
    animationName: "collapse",
  },
});
