import { css } from "@hashintel/ds-helpers/css";

export const overlayScrollDrawerBodyStyle = css({
  display: "flex",
  overflow: "hidden",
});
export const overlayScrollDrawerViewportStyle = css({
  paddingX: "[var(--panel-horizontal-padding)]",
  paddingBottom: "5",
  "& > [data-part=content]": { paddingTop: "4" },
  "& > [data-part=content] > :first-child > [data-section]:first-child > [data-section-header]":
    {
      paddingTop: "[0]",
    },
});
