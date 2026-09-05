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

// The flippable direction icon is passed as a Button prefix, so it misses the
// Button recipe's icon-slot sizing; mirror its lg 20px override (&& outranks
// the Icon recipe's own --icon-size class, which ties on specificity).
export const triggerIcon = cva({
  variants: {
    size: {
      xxs: {},
      xs: {},
      sm: {},
      md: {},
      lg: { "&&": { "--icon-size": "20px" } },
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
  // Smaller hit-area chrome on the compact triggers so the hover background
  // keeps clear of the trigger border; the icon size is unchanged.
  variants: {
    size: {
      xxs: { padding: "[1px]", margin: "[-1px]" },
      xs: { padding: "[2px]", margin: "[-2px]" },
      sm: {},
      md: {},
      lg: {},
    },
  },
});
