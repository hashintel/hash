import { Popover as ArkPopover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { proxyTabFocus } from "@zag-js/dom-query";
import { useEffect, useMemo, useRef, useState } from "react";

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
  /** Called when the popover requests to close (e.g. Escape or an interaction outside it). Required for the popover to be dismissable. */
  onClose?: () => void;
  /**
   * Whether a pointer interaction outside the popover and its trigger requests
   * close via `onClose`. Requires `onClose`.
   * @default true
   */
  closeOnInteractOutside?: boolean;
  /** The element to focus when the popover opens. Defaults to the first focusable element inside it. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** The element to return focus to when the popover closes. Defaults to the trigger. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
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
  closeOnInteractOutside = true,
  initialFocusRef,
  returnFocusRef,
}: PopoverProps) => {
  const portalContainerRef = usePortalContainerRef();
  const contentRef = useRef<HTMLDivElement>(null);

  const direction = position.split("-")[0];
  const isVertical = direction === "top" || direction === "bottom";

  // Reading discrete values keeps the callback stable when `positionFromPoint`
  // is passed as an inline object.
  const pointX = positionFromPoint?.x;
  const pointY = positionFromPoint?.y;

  // The consumer opens the popover by mounting it, but Ark only runs its open
  // transition - which focuses the first item inside the popover - when `open`
  // flips false -> true. So we start closed and open on the next frame. On
  // dismissal we flip back to closed (so Ark restores focus to the trigger),
  // then tell the parent via `onClose` once the exit has completed.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOpen(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  // When no explicit `returnFocusRef` is given, take over tab-focus proxying so
  // that tabbing out of the portalled content moves to the next/previous
  // focusable around the trigger (as if the popover were inline after it). Ark's
  // own proxy is anchored to its trigger - which we don't render - so we disable
  // it (via `portalled` below) and run our own against the external trigger.
  const proxyTabToTrigger = !returnFocusRef;
  useEffect(() => {
    if (!open || !proxyTabToTrigger) {
      return undefined;
    }

    return proxyTabFocus(() => contentRef.current, {
      triggerElement: () => {
        const el = resolveRef(triggerRef);
        return el instanceof HTMLElement ? el : null;
      },
      defer: true,
      getShadowRoot: true,
      onFocus: (el) => {
        el.focus({ preventScroll: true });
      },
    });
  }, [open, proxyTabToTrigger, triggerRef]);

  // Provided so the Header/Body/Footer panels (via Popover.Container) can read
  // their shared chrome; harmless for plain children that ignore it.
  const overlayContextValue = useMemo(
    () => ({
      classes: overlayPartsStyles({ component: "popover" }),
      onClose: onClose ? () => setOpen(false) : undefined,
      renderCloseButton: !!onClose,
      // Body/Footer never render these; the popover uses its own <Header>.
      Title: "h2" as const,
      Description: "p" as const,
      componentName: "Popover" as const,
    }),
    [onClose],
  );

  return (
    <ArkPopover.Root
      open={open}
      lazyMount
      unmountOnExit
      // Disable Ark's tab-focus proxy when we run our own (see above); it
      // targets Ark's own, absent, trigger otherwise.
      portalled={!proxyTabToTrigger}
      // Dismissal requires an `onClose` to act on; without it the popover can
      // only be closed by the consumer unmounting it.
      closeOnEscape={!!onClose}
      closeOnInteractOutside={!!onClose && closeOnInteractOutside}
      // The trigger lives outside Ark (we position against it via
      // `getAnchorRect`), so mark it persistent - interacting with it must not
      // count as an outside interaction and dismiss the popover.
      persistentElements={[() => resolveRef(triggerRef)]}
      initialFocusEl={
        initialFocusRef ? () => initialFocusRef.current : undefined
      }
      // Ark restores focus to its own trigger on close; ours is external, so
      // default to the trigger explicitly (otherwise focus falls to <body>).
      finalFocusEl={() => {
        if (returnFocusRef) {
          return returnFocusRef.current;
        }
        const el = resolveRef(triggerRef);
        return el instanceof HTMLElement ? el : null;
      }}
      onOpenChange={(details) => {
        if (!details.open) {
          setOpen(false);
        }
      }}
      onExitComplete={() => {
        onClose?.();
      }}
      positioning={{
        placement: position,
        offset: { mainAxis: isVertical ? gapY : gapX },
        // Anchor to the external trigger (or a point relative to its top-left).
        // Reads the ref lazily so positioning tracks the trigger as it moves.
        getAnchorRect: () => {
          const rect = resolveRef(triggerRef)?.getBoundingClientRect();

          if (pointX !== undefined && pointY !== undefined) {
            return {
              x: (rect?.left ?? 0) + pointX,
              y: (rect?.top ?? 0) + pointY,
              width: 0,
              height: 0,
            };
          }

          return rect
            ? {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              }
            : null;
        },
      }}
    >
      <Portal container={portalContainerRef}>
        <ArkPopover.Positioner className={positionerStyles}>
          <ArkPopover.Content ref={contentRef} className={className}>
            <OverlayContext.Provider value={overlayContextValue}>
              {children}
            </OverlayContext.Provider>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
};

export const Popover = Object.assign(PopoverRoot, {
  Container: PopoverContainer,
  Header: PopoverHeader,
  Body: OverlayBody,
  Footer: OverlayFooter,
});
