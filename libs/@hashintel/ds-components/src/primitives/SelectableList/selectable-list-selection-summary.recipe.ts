import { cva } from "@hashintel/ds-helpers/css";

export const summaryRow = cva({
  base: {
    display: "flex",
    alignItems: "baseline",
    paddingX: "[0.5px]",
    marginBottom:
      "[calc(-0.25 * var(--selectable-list-header-footer-padding-y))]",
    // One step below the text size inherited from the list's footer slot,
    // like the list's group labels sit below its item text
    fontSize: "[0.85em]",
    lineHeight: "[round(1em * 1.334, 1px)]",
    gap: "[0.67em]",
  },
});

export const summaryCount = cva({
  base: {
    color: "neutral.s90",
    whiteSpace: "nowrap",
  },
});

export const summaryAction = cva({
  base: {
    appearance: "none",
    border: "none",
    background: "[transparent]",
    padding: "0",
    marginLeft: "[auto]",
    font: "[inherit]",
    fontWeight: "[450]",
    color: "neutral.s100",
    cursor: "pointer",
    borderRadius: "sm",
    whiteSpace: "nowrap",
    lineHeight: "[round(1em, 1px)]",
    _hover: {
      color: "neutral.s110",
      textDecoration: "underline",
    },
    "&:focus:not(:focus-visible)": { outline: "none" },
    _focusVisible: {
      outline: "[1px solid var(--colors-neutral-s80)]",
      outlineOffset: "[3px]",
    },
  },
});
