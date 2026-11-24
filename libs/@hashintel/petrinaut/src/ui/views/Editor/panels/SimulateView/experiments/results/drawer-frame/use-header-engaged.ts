import { type FocusEvent, useState } from "react";

/**
 * The handlers the header's root element takes so the pointer and the
 * keyboard focus can hold it at its full height while the body is scrolled.
 */
export type FrameHeaderEngagement = {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
};

/**
 * Whether the pointer or the keyboard focus is on the header. The pointer
 * is tracked by its enter and leave; focus is remembered as the element
 * that took it, because an element disabled or removed while focused fires
 * no blur and would otherwise hold the header open for good. `settleFocus`,
 * called when the body scrolls, drops a remembered focus that element no
 * longer holds.
 */
export const useHeaderEngaged = (): {
  engaged: boolean;
  engagement: FrameHeaderEngagement;
  settleFocus: () => void;
} => {
  const [hovered, setHovered] = useState(false);
  const [focusedElement, setFocusedElement] = useState<Element | null>(null);

  return {
    engaged: hovered || focusedElement !== null,
    engagement: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onFocus: (event) => setFocusedElement(event.target),
      onBlur: () => setFocusedElement(null),
    },
    settleFocus: () => {
      if (focusedElement === null) {
        return;
      }
      const holdsFocus =
        focusedElement.isConnected &&
        document.activeElement === focusedElement &&
        !focusedElement.matches(":disabled");
      if (!holdsFocus) {
        setFocusedElement(null);
      }
    },
  };
};
