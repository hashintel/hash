/**
 * The DS `Menu`, opened from code.
 *
 * DS gap (DS coverage audit, 21 Oct, section 3 item 8): code `Menu` has no controlled `open` / `onOpenChange`; it
 * opens only when its own trigger is clicked. The editor opens menus from other places: a field's "+", a pill, the
 * toolbar, a port, a keyboard shortcut. This wrapper, local to the prototype and additive, lays an invisible trigger
 * over the anchor and clicks it once on mount, so the DS Menu opens there as shipped. Mount it to open the menu;
 * `onClose` fires when the menu closes, and the caller then unmounts it. Ask the DS for `open` + `onOpenChange` and
 * delete this file.
 */
import { useEffect, useRef, useState } from "react";

import {
  type ItemOrGroup,
  Menu,
  type MenuItem,
} from "@hashintel/ds-components";

type Position = React.ComponentProps<typeof Menu>["position"];

export const OpenMenu = ({
  anchor,
  items,
  onClose,
  position = "bottom-start",
  header,
  footer,
  className,
  label,
}: {
  /** The menu's name: the DS Menu content is labelled by its trigger. */
  label: string;
  /** The element the menu opens from. */
  anchor: React.RefObject<Element | null>;
  items: Array<ItemOrGroup<MenuItem>>;
  onClose: () => void;
  position?: Position;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  // The anchor's place when the menu opened; the menu stays where it opened, as a DS Menu does. Read after mount:
  // an anchor rendered in the same commit has no element during render.
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Callers may pass a fresh ref object each render; the first one names the anchor.
  const firstAnchor = useRef(anchor);

  useEffect(() => {
    // A frame later: an anchor its parent sets in an effect (which runs after this child's) is there by then.
    const frame = requestAnimationFrame(() =>
      setRect(firstAnchor.current.current?.getBoundingClientRect() ?? null),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (rect) {
      triggerRef.current?.click();
    }
  }, [rect]);

  return (
    <Menu
      // The DS Menu renders only its trigger when it has no items; there is always at least one row here.
      items={items}
      position={position}
      header={header}
      footer={footer}
      className={className}
      onOpen={(open) => {
        if (!open) {
          onClose();
        }
      }}
      trigger={
        <span
          ref={triggerRef}
          aria-label={label}
          tabIndex={-1}
          style={{
            position: "fixed",
            left: rect?.left ?? 0,
            top: rect?.top ?? 0,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            pointerEvents: "none",
          }}
        />
      }
    />
  );
};
