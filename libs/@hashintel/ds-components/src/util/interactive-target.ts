/**
 * Whether an event's target sits on an interactive element — a button, link,
 * form control, or editable region — within `boundary` (exclusive). The
 * composite inputs built around chip rows (TagsInput, the multiple Combobox,
 * OverflowRow) use this at pointerdown to leave the press to that element:
 * pulling focus into their own input mid-press scrolls the row, moving the
 * pressed element from under the pointer before its click can land.
 */
export const isInteractiveTarget = (
  target: EventTarget | null,
  boundary: Element,
): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  const interactive = target.closest(
    "button, [role='button'], a[href], [role='link'], input, select, textarea, [contenteditable]:not([contenteditable='false'])",
  );
  return (
    interactive !== null &&
    interactive !== boundary &&
    boundary.contains(interactive)
  );
};
