import { cva } from "@hashintel/ds-helpers/css";

import { formWidths } from "../../util/form-width.recipe";

export const comboboxDropdownRecipe = cva({
  base: {
    // At least as wide as the input's visible box, growing to fit item
    // content up to 18rem. !important beats the SelectableList content
    // min-width (140px).
    ...formWidths.base,
    "--combobox-list-reference-width":
      "calc(var(--reference-width) + var(--combobox-list-anchor-inset, 0px) * 2)",
    width: "[fit-content]",
    minWidth:
      "[max(var(--combobox-list-reference-width), var(--form-min-width)) !important]",
    maxWidth: "[max(var(--combobox-list-reference-width), 18rem)]",
    marginLeft: "[calc(-1 * var(--combobox-list-anchor-inset, 0px))]",
    // Items need the same inter-item gap as Menu lists so that adjacent
    // highlight-style selections read as separate rows (matches multi Select)
    "& [data-part='item'] + [data-part='item']": {
      marginTop: "[1px]",
    },
  },
  variants: {
    variant: {
      default: {},
      subtle: {
        // A subtle input's visible box (its hover/focus ::before) extends one
        // padding-x beyond the anchor rect on each side; widen and shift the
        // list by the same inset. Matches the subtle input's
        // --base-input-padding-x, which is spacing.2 at every size.
        "--combobox-list-anchor-inset": "spacing.2",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

// The default "commit typed text" option row: a plus icon beside the raw
// input, the icon one size smaller than a regular item icon.
export const comboboxNewValueOptionRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1.5",
  },
});
