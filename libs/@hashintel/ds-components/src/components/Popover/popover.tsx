import { Portal } from "@ark-ui/react/portal";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type VirtualElement,
} from "@floating-ui/react-dom";
import { useEffect, useLayoutEffect, useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  OverlayBody,
  OverlayContext,
  OverlayFooter,
} from "../../util/overlay-parts";
import { overlayPartsStyles } from "../../util/overlay-parts.recipe";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { type Position } from "../Tooltip/tooltip";
import { PopoverContainer, PopoverHeader } from "./popover-parts";
import { positionerStyles } from "./popover.recipe";

/** Reads the current element out of a (possibly callback) ref, when available. */
const resolveRef = (ref: React.Ref<Element>): Element | null =>
  ref && typeof ref === "object" && "current" in ref ? ref.current : null;

export type PopoverProps = {
  className?: string;
  /** Any content to position; use `Popover.Container` to frame panels */
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
  /** Called when the user interacts (pointer down) outside the popover and its trigger */
  onClose?: () => void;
};

const PopoverRoot = ({
  className,
  children,
  triggerRef,
  position = "bottom",
  positionFromPoint,
  gapX = 8,
  gapY = 8,
  onClose,
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
    // A virtual element resolves the trigger lazily, so positioning stays
    // correct if the ref is populated after mount and tracks the trigger as it
    // moves.
    const virtualElement: VirtualElement = {
      getBoundingClientRect: () => {
        const triggerRect = resolveRef(triggerRef)?.getBoundingClientRect();

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
        return resolveRef(triggerRef) ?? undefined;
      },
    };

    refs.setReference(virtualElement);
  }, [refs, triggerRef, pointX, pointY]);

  useEffect(() => {
    if (!onClose) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      // Interactions with the popover itself or its trigger are not "outside".
      const floatingEl = refs.floating.current;
      const triggerEl = resolveRef(triggerRef);
      if (floatingEl?.contains(target) || triggerEl?.contains(target)) {
        return;
      }

      onClose();
    };

    // Capture so the interaction is detected even if a descendant stops
    // propagation, and use the floating element's document to stay correct
    // when the popover is portalled into another frame.
    const ownerDocument = refs.floating.current?.ownerDocument ?? document;
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [onClose, refs, triggerRef]);

  // Provided so the Header/Body/Footer panels (via Popover.Container) can read
  // their shared chrome; harmless for plain children that ignore it.
  const overlayContextValue = useMemo(
    () => ({
      classes: overlayPartsStyles({ component: "popover" }),
      onClose,
      renderCloseButton: !!onClose,
      // Body/Footer never render these; the popover uses its own <Header>.
      Title: "h2" as const,
      Description: "p" as const,
      componentName: "Popover" as const,
    }),
    [onClose],
  );

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
        <OverlayContext.Provider value={overlayContextValue}>
          {children}
        </OverlayContext.Provider>
      </div>
    </Portal>
  );
};

export const Popover = Object.assign(PopoverRoot, {
  Container: PopoverContainer,
  Header: PopoverHeader,
  Body: OverlayBody,
  Footer: OverlayFooter,
});
