import { useEffect, useRef } from "react";

import { Menu } from "@hashintel/ds-components";

import { getAddStepMenuItems, stepNoun } from "../shared/step-display";

/**
 * The "+" list, open while mounted. The DS `Menu` only opens from its own trigger (logged as a gap), so this clicks an
 * invisible trigger laid over `anchor`.
 */
export const AddStepMenu = ({
  anchor,
  onPick,
  onClose,
}: {
  /** In window coordinates. */
  anchor: DOMRect;
  onPick: (actionDefinitionId: string) => void;
  onClose: () => void;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    /* A frame later, so the right-click menu closing doesn't close this too. */
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
