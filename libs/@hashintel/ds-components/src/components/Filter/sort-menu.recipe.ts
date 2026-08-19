import { cva } from "@hashintel/ds-helpers/css";

export const directionSuffix = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "top",
    fontSize: "[calc(1em / 0.85)]",
    width: "[1lh]",
    height: "[1lh]",
    visibility: "hidden",
    "[data-highlighted] &, [data-selected] &": {
      visibility: "visible",
    },
  },
});

export const directionToggle = cva({
  base: {
    appearance: "none",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[100%]",
    height: "[100%]",
    background: "[transparent]",
    color: "neutral.s110",
    cursor: "pointer",
    outline: "none",
    borderRadius: "sm",
    padding: "0",
    transition: "[background 0.1s ease, color 0.1s ease]",
    "&:hover": {
      background: "neutral.a50",
      color: "neutral.s120",
    },
    "&:focus": {
      background: "neutral.a50",
      color: "neutral.s120",
    },
  },
});

export const placeholderLabel = cva({
  base: {
    color: "neutral.s110",
  },
});

export const menuContent = cva({
  base: {
    maxWidth: "[300px]",
  },
});

export const searchRow = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    marginTop:
      "[calc(-1 * (var(--spacing-1) + var(--selectable-list-padding-y)))]",
    marginInline:
      "[calc(-1 * (var(--selectable-list-padding-x) + var(--spacing-1)))]",
    marginBottom: "0.5",
    paddingInline: "[var(--selectable-list-padding-x)]",
    paddingTop: "1.5",
    paddingBottom: "1",
    background: "neutral.s20",
    borderBottom: "1px solid {colors.neutral.s50}",
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

export const triggerButton = cva({
  base: {
    maxWidth: "[100%]",
    "& svg": {
      flexShrink: "0",
    },
    "& > span:last-child": {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

export const triggerDirectionToggle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: "sm",
    padding: "[3px]",
    margin: "[-3px]",
    transition: "[background 0.1s ease]",
    "&:hover": {
      background: "neutral.a50",
    },
  },
});
