import { css, cx } from "@hashintel/ds-helpers/css";

export const nodeContainerStyle = css({
  position: "relative",
  height: "full",
});

/**
 * Shared card style. Consumers pass `borderRadius` per node type, name the
 * card's colours as `--node-fill` and `--node-border`, and compose
 * `nodeFocusStyle` for the focus ring. A card that names no border colour
 * takes the colour of its text. The card fills the node wrapper, which React
 * Flow sizes to the node's declared dimensions (see `RenderNodeDimensions` in
 * petrinaut-core).
 */
export const nodeCardStyle = cx(
  "node-surface",
  "node-border",
  css({
    width: "full",
    height: "full",
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    padding: "[4px 12px 4px 4px]",
    border: "1px solid",
    borderColor: "[var(--node-border, currentColor)]",
    backgroundColor: "[var(--node-fill)]",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    // Contributed to the shadow `nodeFocusStyle` owns, so the focus glow
    // and the elevation can sit in one declaration.
    "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
    // The pointer gets its own feedback straight away; only the neighbourhood
    // highlight waits for the hover to settle.
    _hover: { "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)" },
  }),
);

/**
 * The box an icon sits in. `color` is the icon's. The node says how the box
 * fades: with `node-fill` where it lies on a fill of another colour, and with
 * `node-inlay` where it lies on a card of nearly its own.
 */
export const iconContainerBaseStyle = cx(
  "node-border",
  css({
    width: "[40px]",
    height: "[40px]",
    "--node-fill": "var(--colors-neutral-s10)",
    "--node-border": "rgba(0,0,0,0.06)",
    backgroundColor: "[var(--node-fill)]",
    border: "[1px solid var(--node-border)]",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    fontSize: "2xl",
    color: "neutral.s80",
    position: "relative",
  }),
);

/** The disc a badge sits on, at the corner of an icon. */
export const iconBadgeStyle = cx(
  "node-fill",
  css({
    position: "absolute",
    bottom: "[-2px]",
    right: "[-2px]",
    fontSize: "xs",
    "--node-fill": "var(--colors-neutral-s00)",
    backgroundColor: "[var(--node-fill)]",
    borderRadius: "[50%]",
    width: "[16px]",
    height: "[16px]",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),
);

export const nodeTextAreaStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "0",
  overflow: "hidden",
});

export const nodeTitleStyle = cx(
  "node-text",
  css({
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[1.2]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
);

export const nodeSubtitleStyle = cx(
  "node-text",
  css({
    fontSize: "xs",
    "--node-text": "var(--colors-neutral-a90)",
    color: "[var(--node-text)]",
    lineHeight: "[1.2]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
);
