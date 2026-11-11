/**
 * Esc closes the topmost thing (11 Nov convergence A17). A layer listens only while it is open, and steps aside when
 * something sits above it: an open menu, listbox or dialog that is not the layer itself or one of its parents. In a
 * text field the first Esc leaves the field and the next one closes the layer, so typing is never thrown away.
 */
import { useEffect, useRef } from "react";

import { isTyping } from "./toolbar";

const above = "[role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

export const useEscapeCloses = <Element extends HTMLElement = HTMLElement>(
  onClose: () => void,
  open = true,
) => {
  const layer = useRef<Element>(null);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      const own = layer.current;
      const covered = [...globalThis.document.querySelectorAll(above)].some(
        (element) => element !== own && !(own && element.contains(own)),
      );
      if (covered) {
        return;
      }
      if (isTyping(event.target)) {
        (event.target as HTMLElement).blur();
        event.preventDefault();
        return;
      }
      event.preventDefault();
      latest.current();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open]);
  return layer;
};
