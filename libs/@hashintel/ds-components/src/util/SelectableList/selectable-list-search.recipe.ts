import { cva } from "@hashintel/ds-helpers/css";

export const searchRow = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    marginInline:
      "[calc(-1 * (var(--selectable-list-item-padding-x) + var(--selectable-list-container-padding-x)))]",
    paddingInline:
      "[calc(var(--selectable-list-item-padding-x) + var(--selectable-list-container-padding-x))]",
    marginTop:
      "[calc(-1 * (var(--selectable-list-container-padding-y) + var(--selectable-list-header-footer-padding-y)))]",
    marginBottom: "0",
    paddingTop: "1.5",
    paddingBottom: "1",
    background: "neutral.s10",
    borderBottom: "1px solid {colors.neutral.s35}",
    "& svg": {
      "--icon-size": "1.143em",
    },
    "[data-placement^='top'] [data-selectable-list-swap-on-flip] &": {
      marginTop: "0",
      marginBottom:
        "[calc(-1 * (var(--selectable-list-container-padding-y) + var(--selectable-list-header-footer-padding-y)))]",
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
