import {
  Popover as ArkPopover,
  usePopoverContext,
} from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { proxyTabFocus } from "@zag-js/dom-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
import { contentStyles, positionerStyles } from "./popover.recipe";

/** Reads the current element out of a (possibly callback) ref, when available. */
const resolveRef = (ref: React.Ref<Element>): Element | null =>
  ref && typeof ref === "object" && "current" in ref ? ref.current : null;

export type PopoverProps = {
  className?: string;
  /**
   * Applied to the portalled positioner — the popover's outermost element, which
   * owns its placement and z-index. Use it to override the layer. Style
   * the panel itself via `className`, `Popover.Container`, or the children.
   */
  positionerClassName?: string;
  /** Any content to position; use `Popover.Container` to frame panels */
  children: React.ReactNode;
  /**
   * The element the popover is positioned relative to. Positioning updates
   * automatically as this element moves, resizes, or scrolls.
   */
  triggerRef: React.Ref<Element>;
  /** The preferred position of the popover - depending on the viewport, trigger and content another position may be chosen for better fit */
  position?: Position;
  /** Instead of positioning around the trigger, position from a specific point inside or outside the trigger where 0,0 is the top left of the trigger element. The popover repositions as this point changes. */
  positionFromPoint?: { x: number; y: number };
  /**
   * The horizontal distance the popover will be from the anchor in px. Applied
   * when the placement is horizontal (`left`/`right`), or - with a
   * `positionFromPoint` point anchor - always, alongside `gapY`.
   */
  gapX?: number;
  /**
   * The vertical distance the popover will be from the anchor in px. Applied
   * when the placement is vertical (`top`/`bottom`), or - with a
   * `positionFromPoint` point anchor - always, alongside `gapX`.
   */
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

/**
 * Nudges Ark to reposition when a gap changes.
 *
 * Zag reads the positioning options (including `offset`) whenever it computes a
 * placement, but it never repositions on its own when those options change - the
 * only prop it watches is `open`. The main-axis gap rides Ark's flip-aware
 * `offset` middleware (so it lands on whichever side a flip resolves to), and
 * that value is only re-read when a reposition runs: a trigger-anchored popover
 * recomputes on scroll/resize, and a point-anchored one every frame, but each
 * running loop reuses the `offset` captured at its last setup - so neither picks
 * up a gap change on its own. `reposition` recomputes now, reading the latest
 * `offset` prop (computed inline from the current gaps in `PopoverRoot`), so the
 * new gap is applied immediately - and, because subsequent recomputes reuse that
 * same fresh `offset`, they keep it rather than reverting.
 *
 * `reposition` is exposed only through context, hence this child component. A
 * point anchor's cross-axis gap doesn't need it: that gap is baked into
 * `getAnchorRect`, whose closure the per-frame loop re-invokes with fresh gaps.
 */
const RepositionOnGapChange = ({
  gapX,
  gapY,
  isVertical,
}: {
  gapX: number;
  gapY: number;
  isVertical: boolean;
}) => {
  const { reposition } = usePopoverContext();
  // `reposition` gets a fresh identity each render but always calls the machine's
  // stable dispatch, so hold the latest in a ref and depend only on the gaps -
  // depending on `reposition` itself would fire this on every render.
  const repositionRef = useRef(reposition);
  useLayoutEffect(() => {
    repositionRef.current = reposition;
  });
  useLayoutEffect(() => {
    repositionRef.current();
  }, [gapX, gapY, isVertical]);
  return null;
};

const PopoverRoot = ({
  className,
  positionerClassName,
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

  const [direction, alignment] = position.split("-");
  const isVertical = direction === "top" || direction === "bottom";

  const hasPoint = positionFromPoint !== undefined;

  // Ark reads the positioning options when it computes a placement and never
  // re-reads a prop mid-flight: its running loop (per frame for a point anchor
  // via `animationFrame` below; on scroll/resize for a trigger anchor) keeps
  // calling the *original* `getAnchorRect` closure captured when the popover
  // opened. So point-anchor values that can change while open and feed that rect
  // - the point itself and the cross-axis gap - are routed through refs the
  // closure reads, keeping the loop current (e.g. an overlay tracking a node as a
  // chart is panned or zoomed). The main-axis gap instead rides `offset` below
  // (computed inline from the current gaps) for both anchor kinds, so it stays
  // flip-aware; a change to it is applied by nudging a reposition - see
  // `RepositionOnGapChange`.
  const pointRef = useRef(positionFromPoint);
  const gapRef = useRef({ x: gapX, y: gapY });
  // Synced before paint so the frame loop never reads stale values.
  useLayoutEffect(() => {
    pointRef.current = positionFromPoint;
    gapRef.current.x = gapX;
    gapRef.current.y = gapY;
  }, [positionFromPoint, gapX, gapY]);

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
  // own popover-level proxy resolves its trigger by DOM id via
  // `getActiveTriggerEl` - and we render the trigger externally, so it can't
  // find it. We disable it (via `portalled` below) and instead drive the
  // underlying `proxyTabFocus` ourselves, handing it the trigger by element from
  // our ref. Its fix for skipping tabbables inside the portalled content is what
  // keeps focus from looping back in when the trigger is the last on the page.
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
      closeOnInteractOutside,
    }),
    [onClose, closeOnInteractOutside],
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
        // The gap along the placement direction (the main axis), for both anchor
        // kinds. It rides Ark's offset middleware, which stays flip-aware, so the
        // gap lands on whichever side a flip resolves to. Computed inline from the
        // current gaps so a change is in the prop Ark reads on its next reposition
        // (see `RepositionOnGapChange`); a point anchor's cross-axis gap is baked
        // into the anchor rect instead (see `getAnchorRect`).
        offset: { mainAxis: isVertical ? gapY : gapX },
        // When anchored to a point, the trigger element itself doesn't move as
        // the point changes, so floating-ui's default scroll/resize listeners
        // never fire and the popover would stay put. Poll on each animation
        // frame instead so it tracks a moving point (e.g. an overlay following
        // a node as a chart is panned/zoomed). The other auto-update listeners
        // keep their defaults. Trigger-anchored popovers don't need this.
        listeners: hasPoint ? { animationFrame: true } : true,
        // Anchor to the external trigger (or a point relative to its top-left).
        // Reads the ref lazily so positioning tracks the trigger as it moves.
        getAnchorRect: () => {
          const rect = resolveRef(triggerRef)?.getBoundingClientRect();
          const point = pointRef.current;

          if (point) {
            // Bake only the cross-axis gap into the zero-size anchor rect: it
            // shifts the point across the placement direction (flipped for `end`
            // alignment) and, keyed to alignment rather than side, survives a flip
            // unchanged. The main-axis gap rides the flip-aware `offset`
            // middleware above instead, so it lands on the correct side after a
            // flip. Read the cross gap from `gapRef` so the running loop tracks a
            // change - a shifted rect makes it recompute on its own.
            const { x: gapXNow, y: gapYNow } = gapRef.current;
            const crossGap = isVertical ? gapXNow : gapYNow;
            const crossOffset = alignment === "end" ? -crossGap : crossGap;

            return {
              x: (rect?.left ?? 0) + point.x + (isVertical ? crossOffset : 0),
              y: (rect?.top ?? 0) + point.y + (isVertical ? 0 : crossOffset),
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
      <RepositionOnGapChange gapX={gapX} gapY={gapY} isVertical={isVertical} />
      <Portal container={portalContainerRef}>
        <ArkPopover.Positioner
          className={cx(positionerStyles, positionerClassName)}
        >
          <ArkPopover.Content
            ref={contentRef}
            className={cx(contentStyles, className)}
          >
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
