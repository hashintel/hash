import { Portal } from "@ark-ui/react/portal";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type VirtualElement,
} from "@floating-ui/react-dom";
import { useLayoutEffect } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { type Position } from "../Tooltip/tooltip";

const positionerStyles = css({
  zIndex: "popover",
});

export type PopoverProps = {
  className?: string;
  children: React.ReactNode;
  /**
   * The element the popover is positioned relative to. Positioning updates
   * automatically as this element moves, resizes, or scrolls.
   */
  triggerRef: React.Ref<Element>;
  /** The preferred position of the popover - depending on the viewport, trigger and content another position may be chosen for better fit */
  position?: Position;
  /** Instead of positioning around the trigger, position from a specific point inside or outside the trigger where 0,0 is the top left of the trigger element */
  positionFromPoint?: { x: number; y: number };
  /** The X distance the popover will be from the trigger in px */
  gapX?: number;
  /** The Y distance the popover will be from the trigger in px */
  gapY?: number;
};

export const Popover = ({
  className,
  children,
  triggerRef,
  position = "bottom",
  positionFromPoint,
  gapX = 8,
  gapY = 8,
}: PopoverProps) => {
  const portalContainerRef = usePortalContainerRef();

  const direction = position.split("-")[0];
  const isVertical = direction === "top" || direction === "bottom";

  const { refs, floatingStyles, isPositioned } = useFloating({
    placement: position,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(isVertical ? gapY : gapX),
      flip(),
      shift({ padding: 8 }),
    ],
  });

  // Reading discrete values keeps the effect from re-running on every render
  // when `positionFromPoint` is passed as an inline object.
  const pointX = positionFromPoint?.x;
  const pointY = positionFromPoint?.y;

  useLayoutEffect(() => {
    const getTriggerEl = (): Element | null =>
      triggerRef && typeof triggerRef === "object" && "current" in triggerRef
        ? triggerRef.current
        : null;

    // A virtual element resolves the trigger lazily, so positioning stays
    // correct if the ref is populated after mount and tracks the trigger as it
    // moves.
    const virtualElement: VirtualElement = {
      getBoundingClientRect: () => {
        const triggerRect = getTriggerEl()?.getBoundingClientRect();

        if (pointX !== undefined && pointY !== undefined) {
          return new DOMRect(
            (triggerRect?.left ?? 0) + pointX,
            (triggerRect?.top ?? 0) + pointY,
            0,
            0,
          );
        }

        return triggerRect ?? new DOMRect();
      },
      get contextElement() {
        return getTriggerEl() ?? undefined;
      },
    };

    refs.setReference(virtualElement);
  }, [refs, triggerRef, pointX, pointY]);

  return (
    <Portal container={portalContainerRef}>
      <div
        ref={refs.setFloating}
        className={cx(positionerStyles, className)}
        style={{
          ...floatingStyles,
          // Avoid a flash at the top-left corner before the first measurement.
          visibility: isPositioned ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </Portal>
  );
};
