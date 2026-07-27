import {
  Children,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { css } from "@hashintel/ds-helpers/css";

const wrapperDefault = css({ display: "inline-flex" });
const layer = css({
  position: "fixed",
  zIndex: "[9999]",
  p: "[10px]",
});
const surface = css({
  display: "block",
  w: "[max-content]",
  maxW: "[calc(100vw - 36px)]",
  maxH: "[calc(50vh - 20px)]",
  overflowX: "hidden",
  overflowY: "auto",
  bg: "[#0f172a]",
  borderWidth: "[1px]",
  borderColor: "[#000000]",
  borderRadius: "[6px]",
  boxShadow: "[0 10px 25px rgba(15,23,42,0.22)]",
  color: "[#ffffff]",
  fontSize: "[12px]",
  lineHeight: "[15px]",
  fontWeight: "normal",
  overflowWrap: "anywhere",
  textAlign: "left",
  whiteSpace: "normal",
  px: "[12px]",
  py: "[10px]",
  userSelect: "text",
});

const VIEWPORT_PADDING = 8;
const CLOSE_DELAY_MS = 150;
const SAFE_ZONE = 24;

let openInstanceId: string | null = null;
let closeOpenInstance: (() => void) | null = null;

type Side = "top" | "bottom";

interface TimelineTooltipProps {
  content: ReactElement | string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: Side;
  delayMs?: number;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
}

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

const anchorFromTrigger = (
  rect: DOMRect,
  pointerX: number | null,
): { x: number; top: number; bottom: number } => {
  const inset = Math.min(12, rect.width / 2);
  return {
    x:
      pointerX == null
        ? rect.left + rect.width / 2
        : Math.min(Math.max(pointerX, rect.left + inset), rect.right - inset),
    top: rect.top,
    bottom: rect.bottom,
  };
};

export const TimelineTooltip = ({
  content,
  children,
  side = "top",
  delayMs = 120,
  wrapperClassName,
  wrapperStyle,
}: TimelineTooltipProps) => {
  const instanceId = useId();
  const tooltipId = `${instanceId}-tooltip`;
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [positioned, setPositioned] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const pointerXRef = useRef<number | null>(null);
  const anchorRef = useRef<ReturnType<typeof anchorFromTrigger> | null>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelShow = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const closeSelf = useCallback(() => {
    cancelShow();
    cancelHide();
    setVisible(false);
    setPositioned(false);
  }, [cancelHide, cancelShow]);

  const open = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }
    if (closeOpenInstance && openInstanceId !== instanceId) {
      closeOpenInstance();
    }
    openInstanceId = instanceId;
    closeOpenInstance = closeSelf;
    anchorRef.current = anchorFromTrigger(triggerRect, pointerXRef.current);
    setPosition({ left: anchorRef.current.x, top: anchorRef.current.top });
    setPositioned(false);
    setVisible(true);
  }, [closeSelf, instanceId]);

  const show = useCallback(
    (event?: MouseEvent<HTMLSpanElement>) => {
      if (event) {
        pointerXRef.current = event.clientX;
      }
      cancelShow();
      cancelHide();
      if (visible) {
        return;
      }
      if (delayMs <= 0) {
        open();
      } else {
        showTimeoutRef.current = setTimeout(open, delayMs);
      }
    },
    [cancelHide, cancelShow, delayMs, open, visible],
  );

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimeoutRef.current = setTimeout(closeSelf, CLOSE_DELAY_MS);
  }, [cancelHide, closeSelf]);

  useLayoutEffect(() => {
    if (!visible || !layerRef.current || !anchorRef.current || positioned) {
      return;
    }
    const rect = layerRef.current.getBoundingClientRect();
    const anchor = anchorRef.current;
    const preferredTop =
      side === "top" ? anchor.top - rect.height : anchor.bottom;
    const alternateTop =
      side === "top" ? anchor.bottom : anchor.top - rect.height;
    const fitsVertically = (top: number) =>
      top >= VIEWPORT_PADDING &&
      top + rect.height <= window.innerHeight - VIEWPORT_PADDING;
    const candidateTop = fitsVertically(preferredTop)
      ? preferredTop
      : alternateTop;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, anchor.x - rect.width / 2),
      Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - VIEWPORT_PADDING - rect.width,
      ),
    );
    const top = Math.min(
      Math.max(VIEWPORT_PADDING, candidateTop),
      Math.max(
        VIEWPORT_PADDING,
        window.innerHeight - VIEWPORT_PADDING - rect.height,
      ),
    );
    setPosition({ left, top });
    setPositioned(true);
  }, [positioned, side, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSelf();
      }
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [closeSelf, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const keepOpenNearTriggerOrTooltip = (event: PointerEvent) => {
      const nearTrigger = withinRect(
        triggerRef.current?.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        SAFE_ZONE,
      );
      const nearTooltip = withinRect(
        layerRef.current?.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        SAFE_ZONE,
      );
      if (nearTrigger || nearTooltip) {
        cancelHide();
      } else if (!hideTimeoutRef.current) {
        scheduleHide();
      }
    };
    document.addEventListener("pointermove", keepOpenNearTriggerOrTooltip, {
      passive: true,
    });
    return () =>
      document.removeEventListener("pointermove", keepOpenNearTriggerOrTooltip);
  }, [cancelHide, scheduleHide, visible]);

  useEffect(() => {
    if (!visible && openInstanceId === instanceId) {
      openInstanceId = null;
      closeOpenInstance = null;
    }
  }, [instanceId, visible]);

  useEffect(
    () => () => {
      cancelShow();
      cancelHide();
      if (openInstanceId === instanceId) {
        openInstanceId = null;
        closeOpenInstance = null;
      }
    },
    [cancelHide, cancelShow, instanceId],
  );

  const trigger = Children.only(children);
  const describedTrigger = cloneElement(trigger, {
    "aria-describedby": visible
      ? [trigger.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
      : trigger.props["aria-describedby"],
  });

  return (
    <span
      ref={triggerRef}
      className={wrapperClassName ?? wrapperDefault}
      style={wrapperStyle}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocusCapture={() => show()}
      onBlurCapture={scheduleHide}
    >
      {describedTrigger}
      {visible &&
        position &&
        createPortal(
          <span
            id={tooltipId}
            ref={layerRef}
            role="tooltip"
            className={layer}
            data-timeline-tooltip="true"
            style={{
              left: position.left,
              opacity: positioned ? 1 : 0,
              top: position.top,
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <span className={surface} data-timeline-tooltip-surface="true">
              {content}
            </span>
          </span>,
          triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ??
            document.body,
        )}
    </span>
  );
};
