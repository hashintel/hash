import { css } from "@hashintel/ds-helpers/css";

export const diagnosticsListStyle = css({
  margin: "[0]",
  paddingLeft: "[12px]",
  listStyle: "none",
});

export const diagnosticItemStyle = css({
  marginBottom: "[4px]",
});

export const diagnosticButtonStyle = css({
  marginLeft: "[8px]",
  padding: "[2px 4px]",
  fontSize: "[11px]",
  fontFamily: "mono",
  color: "[#dc2626]",
  lineHeight: "[1.5]",
  cursor: "pointer",
  borderRadius: "sm",
  transition: "[background-color 0.15s]",
  backgroundColor: "[transparent]",
  border: "none",
  textAlign: "left",
  width: "[100%]",
  _hover: {
    backgroundColor: "[rgba(220, 38, 38, 0.08)]",
  },
  // A warning or a note is not an error: its hover is plain.
  "&:is([data-severity=warning], [data-severity=info]):hover": {
    backgroundColor: "neutral.bg.surface.hover",
  },
});

export const bulletStyle = css({
  marginRight: "[4px]",
});
