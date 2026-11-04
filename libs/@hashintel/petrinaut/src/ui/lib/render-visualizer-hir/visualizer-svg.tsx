/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions -- The SVG switches from an image to a keyboard-accessible application while exploring. */
import { useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  cameraViewBox,
  fitCamera,
  panCamera,
  pointerFrame,
  zoomCamera,
} from "./visualizer-svg/camera";

import type { Point, Size } from "./visualizer-svg/camera";
import type { VisualizerSvgOptions } from "@hashintel/petrinaut-core";
import type { PointerEvent, ReactNode } from "react";

const containerStyle = css({
  position: "relative",
  width: "[100%]",
  height: "[100%]",
  overflow: "hidden",
});
const controlsStyle = css({
  position: "absolute",
  bottom: "[8px]",
  left: "[8px]",
  display: "flex",
  gap: "[2px]",
  zIndex: "[1]",
  padding: "[2px]",
  borderRadius: "[8px]",
  backgroundColor: "[rgba(255,255,255,0.8)]",
  backdropFilter: "[blur(8px)]",
  opacity: "[0]",
  transition: "[opacity 100ms ease]",
  "[data-visualizer-scene]:hover &": { opacity: "[1]" },
  _focusWithin: { opacity: "[1]" },
  "&[data-exploring='true']": { opacity: "[1]" },
  "@media (hover: none)": { opacity: "[1]" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

const localPoint = (
  element: SVGSVGElement,
  point: { clientX: number; clientY: number },
  size: Size,
): Point => {
  const bounds = element.getBoundingClientRect();
  return {
    x: ((point.clientX - bounds.left) * size.width) / bounds.width,
    y: ((point.clientY - bounds.top) * size.height) / bounds.height,
  };
};

export const VisualizerSvg = ({
  options,
  size,
  children,
}: {
  options: VisualizerSvgOptions;
  size: Size;
  children?: ReactNode;
}) => {
  const [camera, setCamera] = useState(() => fitCamera(options, size));
  const [exploring, setExploring] = useState(false);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const exploreRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const navigable = options.navigation === "pan-zoom";
  const displayedCamera = navigable ? camera : fitCamera(options, size);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !exploring) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      const anchor = localPoint(svg, event, size);
      setCamera((previous) =>
        zoomCamera(
          previous,
          Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.005),
          anchor,
          size,
        ),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [exploring, size]);

  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    event.stopPropagation();
    setDragging(pointers.current.size > 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={containerStyle}
      data-visualizer-scene
      role="group"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !exploring) return;
        event.preventDefault();
        event.stopPropagation();
        setExploring(false);
        exploreRef.current?.focus({ preventScroll: true });
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={cameraViewBox(displayedCamera, size)}
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: "block",
          backgroundColor: options.backgroundColor,
          cursor: exploring ? (dragging ? "grabbing" : "grab") : undefined,
          touchAction: exploring ? "none" : undefined,
        }}
        role={exploring ? "application" : "img"}
        tabIndex={exploring ? 0 : -1}
        aria-label={exploring ? "Explore SVG scene" : undefined}
        onPointerDown={(event) => {
          if (!exploring || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(
            event.pointerId,
            localPoint(event.currentTarget, event, size),
          );
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!exploring || !pointers.current.has(event.pointerId)) return;
          event.stopPropagation();
          const previous = pointerFrame(pointers.current)!;
          pointers.current.set(
            event.pointerId,
            localPoint(event.currentTarget, event, size),
          );
          const next = pointerFrame(pointers.current)!;
          setCamera((current) => {
            const panned = panCamera(current, {
              x: next.center.x - previous.center.x,
              y: next.center.y - previous.center.y,
            });
            return previous.distance > 0 && next.distance > 0
              ? zoomCamera(
                  panned,
                  next.distance / previous.distance,
                  next.center,
                  size,
                )
              : panned;
          });
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onKeyDown={(event) => {
          if (!exploring) return;
          const delta = event.shiftKey ? 80 : 20;
          const movement: Record<string, Point> = {
            ArrowLeft: { x: delta, y: 0 },
            ArrowRight: { x: -delta, y: 0 },
            ArrowUp: { x: 0, y: delta },
            ArrowDown: { x: 0, y: -delta },
          };
          const direction = movement[event.key];
          if (direction)
            setCamera((previous) => panCamera(previous, direction));
          else if (["+", "=", "-"].includes(event.key))
            setCamera((previous) =>
              zoomCamera(
                previous,
                event.key === "-" ? 1 / 1.2 : 1.2,
                { x: size.width / 2, y: size.height / 2 },
                size,
              ),
            );
          else if (event.key === "0") setCamera(fitCamera(options, size));
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </svg>
      {navigable && (
        <div
          className={controlsStyle}
          data-exploring={exploring}
          data-visualizer-control
        >
          <Button
            ref={exploreRef}
            size="xxs"
            variant="ghost"
            aria-pressed={exploring}
            tooltip="Drag to pan · Scroll to zoom · Arrow keys, +/−, 0 to reset · Escape to exit"
            onClick={() => {
              setExploring(!exploring);
              if (!exploring) svgRef.current?.focus({ preventScroll: true });
            }}
          >
            Explore
          </Button>
          {exploring && (
            <Button
              size="xxs"
              variant="ghost"
              onClick={() => setCamera(fitCamera(options, size))}
            >
              Reset view
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
