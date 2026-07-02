import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon, usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const trigger = css({
  display: "inline-flex",
  alignItems: "center",
  width: "[fit-content]",
  maxWidth: "full",
});
const portalLayer = css({
  position: "fixed",
  zIndex: "[9999]",
});
const card = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  bg: "neutral.s120",
  color: "neutral.s00",
  borderRadius: "md",
  boxShadow: "lg",
  px: "2",
  py: "1.5",
  whiteSpace: "nowrap",
});
const value = css({
  fontFamily: "mono",
  textStyle: "xs",
  fontWeight: "medium",
});
const copyButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  h: "4",
  w: "4",
  borderRadius: "sm",
  color: "neutral.s40",
  cursor: "pointer",
  transition: "colors",
  _hover: { color: "neutral.s00" },
});
const copiedIcon = css({ color: "neutral.s00" });

type Side = "top" | "bottom" | "right";

// Invisible padding around the card. It both bridges the visual gap to the
// trigger (so the pointer can cross without the card closing) and enlarges the
// hit target so a slightly-off approach still lands on it.
const HIT_AREA = 10;

// While open, the card stays visible whenever the pointer is within this many
// pixels of the trigger or the card. This "safe zone" spans the gap between
// them, so the card never closes mid-approach (robust for wide triggers like
// the slide-over title where enter/leave gap-bridging is fragile).
const SAFE_ZONE = 24;

const withinRect = (
  rect: DOMRect | undefined,
  x: number,
  y: number,
  margin: number,
): boolean =>
  rect != null &&
  x >= rect.left - margin &&
  x <= rect.right + margin &&
  y >= rect.top - margin &&
  y <= rect.bottom + margin;

/**
 * Anchor point (viewport coords) for the card. For top/bottom the card follows
 * the pointer's horizontal position (clamped within the trigger) so it appears
 * directly under/over the cursor -- important for wide triggers like the
 * slide-over title, where a centred card would be far from the cursor.
 */
const anchorForSide = (
  rect: DOMRect,
  side: Side,
  pointer: { x: number; y: number } | null,
): { x: number; y: number } => {
  if (side === "right") {
    return { x: rect.right, y: rect.top + rect.height / 2 };
  }
  const inset = Math.min(12, rect.width / 2);
  const x = pointer
    ? Math.min(Math.max(pointer.x, rect.left + inset), rect.right - inset)
    : rect.left + rect.width / 2;
  return { x, y: side === "top" ? rect.top : rect.bottom };
};

/**
 * Positioning for the portal wrapper. Uniform padding means the wrapper's
 * leading edge sits flush against the trigger (no dead gap) while still leaving
 * a visual gap to the card.
 */
const layerStyleForSide = (
  { x, y }: { x: number; y: number },
  side: Side,
): CSSProperties => {
  const padding = HIT_AREA;
  if (side === "right") {
    return { left: x, top: y, transform: "translateY(-50%)", padding };
  }
  if (side === "top") {
    return {
      left: x,
      top: y,
      transform: "translateX(-50%) translateY(-100%)",
      padding,
    };
  }
  return { left: x, top: y, transform: "translateX(-50%)", padding };
};

// Only one material card is ever open at once. When an instance opens it closes
// whoever was open before, so hovering across chips/titles never leaves a trail
// of cards lingering during their close grace period.
let openInstanceId: string | null = null;
let closeOpenInstance: (() => void) | null = null;

interface MaterialTagProps {
  /**
   * The material number to reveal on hover. When empty/null the
   * component renders `children` unchanged, so it is safe to use anywhere a
   * material may or may not be known.
   */
  material?: string | null;
  children: ReactNode;
  /** Which side of the trigger the hover card appears on. Defaults to "bottom". */
  side?: Side;
}

/**
 * Wraps a material name (product or step) and, on hover, reveals a small card
 * showing the material number with a copy-to-clipboard button.
 *
 * Uses the portal + fixed + high z-index pattern (like the shared `Tooltip`) so
 * the card is never clipped by a parent's `overflow` or a sibling stacking
 * context. Unlike the plain tooltip the card keeps pointer events and stays
 * open while hovered, so the copy button remains clickable.
 */
export const MaterialTag = ({
  material,
  children,
  side = "bottom",
}: MaterialTagProps): ReactNode => {
  const instanceId = useId();
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // While a control inside the trigger is focused (e.g. the scope select is
  // open), suppress the card so it doesn't cover the input the user is using.
  const suppressedRef = useRef(false);
  const portalContainerRef = usePortalContainerRef();

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const closeSelf = useCallback(() => {
    cancelHide();
    setVisible(false);
  }, [cancelHide]);

  const show = useCallback(
    (event?: MouseEvent) => {
      if (suppressedRef.current) {
        return;
      }
      if (event) {
        pointerRef.current = { x: event.clientX, y: event.clientY };
      }
      // Close any other card that's currently open before showing this one.
      if (closeOpenInstance && openInstanceId !== instanceId) {
        closeOpenInstance();
      }
      openInstanceId = instanceId;
      closeOpenInstance = closeSelf;
      cancelHide();
      setVisible(true);
    },
    [cancelHide, closeSelf, instanceId],
  );

  const scheduleHide = useCallback(() => {
    cancelHide();
    // Short grace period so the pointer can cross the small trigger-to-card gap
    // without it closing underneath them.
    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null;
      setVisible(false);
    }, 150);
  }, [cancelHide]);

  const handleFocusCapture = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      // The card is portaled but its focus events still bubble here through the
      // React tree. Ignore focus coming from inside the card (e.g. clicking the
      // copy button) so it doesn't dismiss itself.
      if (
        event.target instanceof Node &&
        cardRef.current?.contains(event.target)
      ) {
        return;
      }
      suppressedRef.current = true;
      cancelHide();
      setVisible(false);
    },
    [cancelHide],
  );

  const handleBlurCapture = useCallback(() => {
    suppressedRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (visible && triggerRef.current) {
      setCoords(
        anchorForSide(
          triggerRef.current.getBoundingClientRect(),
          side,
          pointerRef.current,
        ),
      );
    }
  }, [visible, side]);

  // While open, keep the card visible whenever the pointer is near the trigger
  // or the card, and close it once the pointer leaves that safe zone.
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const nearTrigger = withinRect(
        triggerRef.current?.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        SAFE_ZONE,
      );
      const nearCard = withinRect(
        cardRef.current?.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        SAFE_ZONE,
      );
      if (nearTrigger || nearCard) {
        cancelHide();
      } else if (hideTimeoutRef.current == null) {
        // Start the close timer once on leaving the safe zone; don't reset it
        // on every subsequent move, or moving around the page keeps it open.
        scheduleHide();
      }
    };
    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () => document.removeEventListener("pointermove", handlePointerMove);
  }, [visible, cancelHide, scheduleHide]);

  useEffect(() => {
    if (!visible && openInstanceId === instanceId) {
      openInstanceId = null;
      closeOpenInstance = null;
    }
  }, [visible, instanceId]);

  useEffect(
    () => () => {
      cancelHide();
      if (openInstanceId === instanceId) {
        openInstanceId = null;
        closeOpenInstance = null;
      }
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    },
    [cancelHide, instanceId],
  );

  const handleCopy = useCallback(
    (event: MouseEvent) => {
      // The card is portaled, so React events still bubble to the trigger's
      // ancestors (e.g. a wrapping `Link`). Stop them here so copying never
      // triggers navigation or opens a wrapped control.
      event.preventDefault();
      event.stopPropagation();
      if (!material) {
        return;
      }
      void navigator.clipboard.writeText(material).then(() => {
        setCopied(true);
        if (copiedTimeoutRef.current) {
          clearTimeout(copiedTimeoutRef.current);
        }
        copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
      });
    },
    [material],
  );

  if (!material) {
    return children;
  }

  return (
    <span
      ref={triggerRef}
      className={trigger}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <span
            ref={cardRef}
            className={portalLayer}
            style={layerStyleForSide(coords, side)}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <span className={card}>
              <span className={value}>{material}</span>
              <button
                type="button"
                className={copyButton}
                aria-label="Copy material number"
                onClick={handleCopy}
              >
                <Icon
                  name={copied ? "check" : "copy"}
                  size="xs"
                  className={copied ? copiedIcon : undefined}
                />
              </button>
            </span>
          </span>,
          // When inside a modal dialog (the slide-over), portal into the dialog
          // itself -- a modal makes everything outside its subtree inert, so a
          // card portaled to the layout container would show but not be
          // clickable. `position: fixed` still positions it against the
          // viewport regardless of the portal parent.
          triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ??
            portalContainerRef?.current ??
            document.body,
        )}
    </span>
  );
};
