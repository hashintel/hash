import { css, cva } from "@hashintel/ds-helpers/css";

export const dockSpaceStyle = css({
  flexShrink: 0,
  minWidth: "[0]",
  maxWidth: "[100%]",
  pointerEvents: "none",
  '&[data-animating="true"]': {
    transition: "[width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
});

export const shellStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    right: "[0]",
    height: "full",
    maxHeight: "full",
    maxWidth: "full",
    transform: "[translateX(0)]",
    visibility: "visible",
    zIndex: "[calc(var(--z-index-sticky) + 2)]",
    pointerEvents: "auto",
    '&[data-animating="true"]': {
      transition:
        "[top 150ms ease-in-out, right 150ms ease-in-out, height 150ms ease-in-out, max-height 150ms ease-in-out, transform 150ms ease-in-out, visibility 0s]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    floating: {
      true: {
        top: "[12px]",
        right: "[12px]",
        height: "[calc(100% - 24px)]",
        maxHeight: "[640px]",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
    open: {
      false: {
        transform: "[translateX(100%)]",
        visibility: "hidden",
        pointerEvents: "none",
        '&[data-animating="true"]': {
          transitionDelay: "[0s, 0s, 0s, 0s, 0s, 150ms]",
        },
      },
    },
    collapsed: {
      true: {
        top: "[auto]",
        bottom: "[12px]",
        right: "[12px]",
        height: "auto",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
  },
});

export const resizeAnchorStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  width: "[0]",
});

export const cardStyle = cva({
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "full",
    overflow: "hidden",
    backgroundColor: "neutral.s00",
    borderLeft: "[1px solid {colors.neutral.s40}]",
    borderRadius: "[0]",
    '&[data-animating="true"]': {
      transition:
        "[border-radius 150ms ease-in-out, box-shadow 150ms ease-in-out]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    setupOverlay: {
      true: { overflow: "visible" },
    },
    floating: {
      true: {
        borderLeftColor: "[transparent]",
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
    },
  },
});

export const panelContentStyle = cva({
  variants: {
    visible: {
      false: { display: "none" },
    },
  },
});

export const headerStyle = css({
  position: "relative",
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[40px]",
  paddingLeft: "3",
  paddingRight: "2",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
});

export const headerLabelStyle = css({
  position: "absolute",
  inset: "[0]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  color: "neutral.fg.heading",
  fontSize: "sm",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  border: "none",
  padding: "[0 12px]",
  backgroundColor: "[transparent]",
  textAlign: "left",
  _enabled: {
    cursor: "grab",
    touchAction: "none",
    _active: { cursor: "grabbing" },
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
  '&[data-icon-motion="true"] > svg': {
    transition: "[transform 180ms ease-out]",
  },
  '&[data-icon-motion="true"]:is(:hover, :focus-visible) > svg': {
    transform: "[rotate(8deg) scale(1.06)]",
  },
  '&[data-icon-motion="true"]:active > svg': {
    transform: "[rotate(-8deg) scale(0.94)]",
  },
});

export const headerTabsStyle = css({
  position: "relative",
  flex: "[1]",
  minWidth: "[0]",
  marginLeft: "[28px]",
  pointerEvents: "none",
  "& button": { pointerEvents: "auto" },
});

export const headerButtonStyle = css({
  position: "relative",
  color: "neutral.s90",
  _hover: {
    color: "neutral.s110",
  },
});

export const tabPanelStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "3",
    flex: "[1]",
    minHeight: "[0]",
    overflowY: "auto",
    padding: "3",
    overscrollBehavior: "contain",
  },
  variants: {
    appearance: {
      default: {},
      pill: { paddingBottom: "4" },
    },
  },
});

/** Holds the chat's own scroller, so the chat keeps its scrolling. */
export const chatPanelStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});
