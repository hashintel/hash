/**
 * The layout the classic place and transition share: a centred name with a
 * fixed row above and below it.
 *
 * The rows are always in the layout, so a name sits at the same height on
 * every node and whatever a row holds -- the dynamics or lambda mark above,
 * a token count or the firing bolt below -- appears over or under the name
 * rather than pushing it aside. Each node sets its own row height and gap:
 * a flat transition has less room to give them than a circle, and two
 * classes setting one property would leave the winner to Panda's ordering.
 */

import { css } from "@hashintel/ds-helpers/css";

/** Half a pixel heavier than the compact card's hairline. */
const OUTLINE_WIDTH = "1.5px";

/**
 * The classic node is outlined by a ring rather than a border: a browser
 * floors a 1.5px border to a whole pixel, while a shadow's spread is painted
 * as given. `--node-outline-color` carries the colour, which a place takes
 * from its token type.
 */
export const classicNodeBoxStyle = css({
  shadow: `[0 0 0 ${OUTLINE_WIDTH} var(--node-outline-color, currentColor), 0px 2px 9px rgba(0, 0, 0, 0.04)]`,
  _hover: {
    shadow: `[0 0 0 ${OUTLINE_WIDTH} var(--node-outline-color, currentColor), 0px 4px 11px rgba(0, 0, 0, 0.1)]`,
  },
  // The ring is painted outside the box, so the hover and selection outlines
  // start beyond it, and the overlay that dims a node covers it.
  outlineOffset: `[${OUTLINE_WIDTH}]`,
  _after: {
    inset: `[-${OUTLINE_WIDTH}]`,
  },
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "[15px]",
  textAlign: "center",
});

export const classicNodeRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  lineHeight: "[1]",
});

export const classicNodeLabelStyle = css({
  maxWidth: "[100%]",
  overflowWrap: "break-word",
  textOverflow: "ellipsis",
  overflow: "hidden",
  lineClamp: "3",
  lineHeight: "[1.2]",
});
