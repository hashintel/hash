import { cva } from "@hashintel/ds-helpers/css";

/**
 * Wrapper for the direction toggle / indicator rendered as an item suffix
 * inside the SortMenu dropdown. The suffix slot is styled for text hints:
 * top-aligned and 0.85em. Undo the shrink and span exactly one line of the
 * row's text, so the content centers on the item label without growing the
 * row.
 *
 * Hidden (but still occupying space, so the menu width is stable) unless the
 * row is selected, hovered or keyboard-highlighted — ark-ui applies
 * `data-highlighted` to the item for both pointer and keyboard navigation.
 */
export const directionSuffix = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    // Top-align within the suffix's line box: baseline alignment would add
    // the descent below the box and grow the row by a fraction of a pixel.
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

/**
 * The direction-toggle button itself: a square flush with the row's text
 * line, so it adds no height to the menu item.
 */
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
    // Separate keys: a comma list in one arbitrary selector produces a rule
    // the browser's CSS parser rejects.
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

/** Trigger label shown while no sort is selected: slightly lighter than the
 * button's own text, without dimming the icon. */
export const placeholderLabel = cva({
  base: {
    color: "neutral.s110",
  },
});

/** Caps the dropdown's width; long sorter names wrap onto multiple lines. */
export const menuContent = cva({
  base: {
    maxWidth: "[300px]",
  },
});

/**
 * The search row at the top of the dropdown (`searchable`): hosts a subtle
 * `TextInput`, separated from the items by a hairline that bleeds across the
 * content's padding.
 */
export const searchRow = cva({
  base: {
    marginInline: "[calc(var(--selectable-list-padding-x) / 2 * -1)]",
    paddingTop: "1",
    paddingBottom: "0.5",
  },
});

/**
 * Applied to the search row while focus inside it is NOT keyboard-driven.
 * BaseInput outlines its container on any :focus-within — and a text input
 * matches :focus-visible on ANY focus (spec carve-out for keyboard-input
 * elements), so the ring would light up on the menu's open autofocus and on
 * clicks. The row tracks the interaction modality in JS and drops this class
 * for keyboard-driven focus. Suppresses only focus-carrying ancestors (never
 * the focused element itself, so e.g. the clear button keeps its own
 * focus-visible outline); the `div` tag qualifier out-specifies BaseInput's
 * `:focus-within` container rule deterministically.
 */
export const searchRowRingHidden = cva({
  base: {
    "& div:focus-within:not(:focus)": {
      outline: "none",
    },
  },
});

/** Shown instead of rows when the search matches no sorter. */
export const searchEmpty = cva({
  base: {
    display: "block",
    color: "neutral.s90",
    paddingBlock: "0.5",
  },
});

/**
 * Lets the trigger `Button` shrink to its container and ellipsize its label
 * on a single line. With an icon the button is a flex row whose label span
 * (its last element child; the icon/direction toggle precedes it) needs
 * `minWidth` to shrink below its content.
 */
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

/**
 * The trigger's direction icon when the active sorter is bidirectional:
 * clickable to flip the direction without opening the menu. Padding grows
 * the hit area; the negative margin keeps the icon exactly where the plain
 * (non-interactive) icon sits.
 */
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
