import {
  onlyButton,
  suffixDefaultContent,
} from "./selectable-list-multi-suffix.recipe";

import type { Tone } from "../form-shared";

/**
 * Whether {@link MultiItemSuffix} would render anything for the given item.
 * Callers gate the suffix slot on this: the element itself is truthy even
 * when it renders nothing, which would otherwise mount the slot (and its
 * spacing) on every multi item.
 */
export const hasMultiItemSuffix = ({
  suffix,
  showOnlyButton,
  disabled,
}: {
  suffix?: React.ReactNode;
  showOnlyButton?: boolean;
  disabled?: boolean;
}): boolean => suffix != null || (!!showOnlyButton && !disabled);

/**
 * The suffix slot content of a multi-selection item (a multiple Select or
 * Combobox): the item's own `suffix`, and — when `showOnlyButton` is set on
 * an enabled item — an "Only" button shown while the item is hovered, which
 * replaces the suffix and sets the selection to just this item.
 */
export const MultiItemSuffix = ({
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
      {suffix != null && <span className={suffixDefaultContent}>{suffix}</span>}
      <button
        type="button"
        className={onlyButton({
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
