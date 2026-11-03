import { useEffect, useRef } from "react";

import { Menu } from "@hashintel/ds-components";

import { stepNoun } from "../shared/step-display";
import { getAddStepMenuItems } from "./add-step-menu-items";

/**
 * The "+" list, opened from code at a place on the page: beside a port, where a connection was dropped, or where a
 * connection was right-clicked. Mount it to open the list; `onClose` is called when it closes, and the caller then
 * unmounts it.
 *
 * The DS `Menu` opens only when its own trigger is clicked (a gap logged in "Flows editor: design system gaps"), so
 * this lays an invisible trigger over `anchor` and clicks it once.
 */
export const AddStepMenu = ({
  anchor,
  onPick,
  onClose,
}: {
  /** Where the list opens from, in the window's coordinates. */
  anchor: DOMRect;
  onPick: (actionDefinitionId: string) => void;
  onClose: () => void;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    /* A frame later, so that a menu closing as this opens, such as the right-click menu it was opened from, doesn't close it too. */
    const frame = requestAnimationFrame(() => triggerRef.current?.click());

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Menu
      items={getAddStepMenuItems(onPick)}
      onOpen={(open) => {
        if (!open) {
          onClose();
        }
      }}
      trigger={
        <span
          ref={triggerRef}
          aria-label={`Add a ${stepNoun.singular}`}
          tabIndex={-1}
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
            height: anchor.height,
            pointerEvents: "none",
          }}
        />
      }
    />
  );
};
