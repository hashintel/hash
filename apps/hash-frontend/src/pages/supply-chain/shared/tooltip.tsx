import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const wrapperDefault = css({ display: "inline-flex" });
const portalLayer = css({
  position: "fixed",
  zIndex: "[9999]",
  pointerEvents: "none",
});
const pillStyles = css({
  display: "block",
  bg: "neutral.s120",
  color: "neutral.s00",
  textStyle: "xs",
  lineHeight: "[15px]",
  fontWeight: "normal",
  borderRadius: "md",
  px: "2",
  py: "1.5",
  boxShadow: "lg",
  whiteSpace: "nowrap",
});

const TOOLTIP_VIEWPORT_PADDING_PX = 8;
const TOOLTIP_TRIGGER_OFFSET_PX = 6;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /**
   * Delay (ms) before the tooltip appears on hover. Defaults to 120ms.
   * Use 0 for charts / dense bar graphics where instant feedback is
   * preferred.
   */
  delayMs?: number;
  /**
   * When true, render `content` directly without the default dark pill
   * chrome (background, padding, rounding). The caller is responsible
   * for styling the popover; the portal + fixed-positioning + z-index
   * are still handled here.
   */
  bare?: boolean;
  /**
   * Optional class applied to the trigger wrapper span. By default the
   * wrapper is `inline-flex`, which is fine for inline triggers but
   * breaks if the trigger participates in flex sizing (e.g. as a flex
   * child with `flex: <pct> 1 0%`). Pass the layout class through to
   * keep the trigger correctly sized in its parent.
   */
  wrapperClassName?: string;
  /** Inline style applied to the trigger wrapper span. */
  wrapperStyle?: CSSProperties;
}

/**
 * Portal-based hover tooltip. Always renders into `document.body` with
 * `position: fixed` and `z-[9999]`, so the tooltip never gets clipped by
 * a parent's `overflow`, `border-radius`, transform stack, or sibling
 * stacking context.
 *
 * Every hover popover in the app should use this component (or follow
 * the same portal + fixed + z-[9999] pattern) -- inline `absolute`
 * tooltips will get hidden behind whatever sibling happens to render on
 * top of them.
 */
export const Tooltip = ({
  content,
  children,
  side = "top",
  delayMs = 120,
  bare = false,
  wrapperClassName,
  wrapperStyle,
}: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portalContainerRef = usePortalContainerRef();

  const show = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    timeoutRef.current = setTimeout(() => setVisible(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  }, []);

  useLayoutEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: side === "top" ? rect.top : rect.bottom,
      });
    }
  }, [visible, side]);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) {
      return;
    }
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current.getBoundingClientRect().width;
    const minimumCenter = TOOLTIP_VIEWPORT_PADDING_PX + tooltipWidth / 2;
    const maximumCenter =
      window.innerWidth - TOOLTIP_VIEWPORT_PADDING_PX - tooltipWidth / 2;
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const x =
      minimumCenter > maximumCenter
        ? window.innerWidth / 2
        : Math.min(Math.max(minimumCenter, triggerCenter), maximumCenter);

    setCoords((currentCoords) =>
      currentCoords && currentCoords.x === x
        ? currentCoords
        : { x, y: side === "top" ? triggerRect.top : triggerRect.bottom },
    );
  }, [visible, side, coords]);

  return (
    <span
      ref={triggerRef}
      className={wrapperClassName ?? wrapperDefault}
      style={wrapperStyle}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <span
            ref={tooltipRef}
            className={portalLayer}
            style={{
              left: coords.x,
              top:
                side === "top"
                  ? coords.y - TOOLTIP_TRIGGER_OFFSET_PX
                  : coords.y + TOOLTIP_TRIGGER_OFFSET_PX,
              transform: `translateX(-50%) ${side === "top" ? "translateY(-100%)" : ""}`,
            }}
          >
            {bare ? content : <span className={pillStyles}>{content}</span>}
          </span>,
          portalContainerRef?.current ?? document.body,
        )}
    </span>
  );
};
