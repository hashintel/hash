import { css } from "@hashintel/ds-helpers/css";

/**
 * Frame drawn around the header / body / footer panels by `Popover.Container`,
 * matching the `@hashintel/petrinaut` popover.
 */
export const containerStyles = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
  backgroundColor: "neutral.s25",
  borderRadius: "xl",
  overflow: "hidden",
  boxShadow:
    "[0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.12), 0 12px 28px -8px rgba(0, 0, 0, 0.14)]",
});

export const headerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  paddingX: "3",
  paddingY: "2",
});

export const headerTitleStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  textTransform: "uppercase",
  letterSpacing: "[0.48px]",
});

export const headerActionsStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flex: "[0 0 auto]",
});
