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

/** How far the panel's right edge is inside the window edge in Figma (1436 of 1440). */
const panelInset = 4;

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
  alignToPanel = false,
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
  /** Open with the menu's right edge on the properties panel's, under the anchor (Figma J3 · C1). */
  alignToPanel?: boolean;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  // The anchor's place when the menu opened; the menu stays where it opened, as a DS Menu does. Read after mount:
  // an anchor rendered in the same commit has no element during render.
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Callers may pass a fresh ref object each render; the first one names the anchor.
  const firstAnchor = useRef(anchor);

  useEffect(() => {
    // Two frames later: an anchor its parent sets in an effect, or one inside a DS part that mounts its own pieces
    // late (a Filter's value slot), is in place by then.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const element = firstAnchor.current.current;
        const box = element?.getBoundingClientRect() ?? null;
        const panel = element?.closest("aside");
        setRect(
          box && panel && alignToPanel
            ? new DOMRect(
                panel.getBoundingClientRect().right - panelInset - box.width,
                box.top,
                box.width,
                box.height,
              )
            : box,
        );
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
    // The anchor names the place once, as the first anchor does.
  }, [alignToPanel]);

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
