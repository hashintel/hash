import { cva } from "@hashintel/ds-helpers/css";

export const searchRow = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    marginTop:
      "[calc(-1 * (var(--selectable-list-content-padding) + var(--selectable-list-padding-y)))]",
    marginInline:
      "[calc(-1 * (var(--selectable-list-padding-x) + var(--selectable-list-content-padding)))]",
    marginBottom: "0.5",
    paddingInline: "[var(--selectable-list-padding-x)]",
    paddingTop: "1.5",
    paddingBottom: "1",
    background: "neutral.s10",
    borderBottom: "1px solid {colors.neutral.s35}",
    // Inside a swap-on-flip header of an upward-opening dropdown the search
    // lands on the bottom edge; mirror its chrome vertically
    "[data-placement^='top'] [data-selectable-list-swap-on-flip] &": {
      marginTop: "0.5",
      marginBottom:
        "[calc(-1 * (var(--selectable-list-content-padding) + var(--selectable-list-padding-y)))]",
      paddingTop: "1",
      paddingBottom: "1.5",
      borderBottom: "none",
      borderTop: "1px solid {colors.neutral.s35}",
    },
  },
});

export const searchIcon = cva({
  base: {
    color: "fg.muted",
    flexShrink: "0",
  },
});

export const searchInput = cva({
  base: {
    flex: "1",
    minWidth: "0",
    appearance: "none",
    border: "none",
    background: "[transparent]",
    outline: "none",
    padding: "0",
    font: "[inherit]",
    color: "[inherit]",
    _placeholder: { color: "neutral.s80" },
  },
});

export const searchEmpty = cva({
  base: {
    display: "block",
    color: "neutral.s90",
    paddingBlock: "0.5",
  },
});
