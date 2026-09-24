import { css, cva } from "@hashintel/ds-helpers/css";

import type { Tone } from "../form-shared";

// The default suffix content of a multi-selection item, swapped out for the
// "Only" button while the item is hovered
const suffixDefaultContentClass = css({
  "[data-part='item']:hover &": {
    display: "none",
  },
});

const onlyButtonRecipe = cva({
  base: {
    display: "none",
    cursor: "pointer",
    fontWeight: "[500]",
    _hover: {
      textDecoration: "underline",
    },
    "[data-part='item']:hover &": {
      display: "inline-flex",
    },
  },
  variants: {
    tone: {
      neutral: {
        color: "neutral.s110",
        _hover: { color: "neutral.s125" },
      },
      brand: {
        color: "blue.s100",
        _hover: { color: "blue.s110" },
      },
    },
  },
  defaultVariants: { tone: "neutral" },
});

/**
 * The suffix slot content of a multi-selection item (a multiple Select or
 * Combobox): the item's own `suffix`, and — when `showOnlyButton` is set on
 * an enabled item — an "Only" button shown while the item is hovered, which
 * replaces the suffix and sets the selection to just this item.
 */
export const renderMultiItemSuffix = ({
  suffix,
  showOnlyButton,
  disabled,
  tone,
  onSelectOnly,
}: {
  suffix: React.ReactNode;
  showOnlyButton: boolean | undefined;
  disabled: boolean | undefined;
  tone: Exclude<Tone, "warning" | "success"> | undefined;
  onSelectOnly: () => void;
}): React.ReactNode => {
  if (!showOnlyButton || disabled) {
    return suffix;
  }
  return (
    <>
      {suffix !== undefined && (
        <span className={suffixDefaultContentClass}>{suffix}</span>
      )}
      <button
        type="button"
        className={onlyButtonRecipe({
          tone: tone === "brand" ? "brand" : "neutral",
        })}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectOnly();
        }}
      >
        Only
      </button>
    </>
  );
};
