/**
 * @layerRoot ui.visualizer-frame
 * @role Shares the floating visualizer outline with its rendered SVG background.
 */
import { createContext, use, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { css } from "@hashintel/ds-helpers/css";

const BackgroundContext = createContext<{
  path: string;
  layer: SVGGElement | null;
} | null>(null);

const frameStyle = css({
  position: "absolute",
  inset: "[0]",
  width: "[100%]",
  height: "[100%]",
  overflow: "visible",
  pointerEvents: "none",
  filter: "[drop-shadow(0 8px 12px rgba(0, 0, 0, 0.16))]",
  transition: "[filter 140ms ease]",
  "[data-visualizer-window]:hover &": {
    filter: "[drop-shadow(0 9px 13px rgba(0, 0, 0, 0.18))]",
  },
  "[data-dragging='true'] &": {
    filter: "[drop-shadow(0 11px 14px rgba(0, 0, 0, 0.2))]",
  },
  "[data-animated='false'] &": { transition: "[none]" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

export const VisualizerFrame = ({
  path,
  marker,
  children,
}: {
  path: string;
  marker?: { x: number; y: number } | null;
  children: ReactNode;
}) => {
  const [layer, setLayer] = useState<SVGGElement | null>(null);
  return (
    <BackgroundContext value={{ path, layer }}>
      <svg className={frameStyle} aria-hidden="true" data-visualizer-bubble>
        <path d={path} className={css({ fill: "neutral.s00" })} />
        <g ref={setLayer} fill="none" />
        <path
          d={path}
          fill="none"
          className={css({
            stroke: "neutral.bd.subtle",
            strokeWidth: "[1px]",
            "[data-editing='true'] &, [data-visualizer-window]:has([data-visualizer-drag]:focus-visible) &":
              {
                stroke: "blue.s80",
                strokeWidth: "[2px]",
              },
          })}
        />
      </svg>
      {children}
      {marker && (
        <svg
          aria-hidden="true"
          data-visualizer-marker
          className={css({
            position: "absolute",
            inset: "[0]",
            width: "[100%]",
            height: "[100%]",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: "[1]",
          })}
        >
          <circle
            cx={marker.x}
            cy={marker.y}
            r="3"
            className={css({
              fill: "neutral.s90",
              stroke: "neutral.s00",
              strokeWidth: "[1.5px]",
            })}
          />
        </svg>
      )}
    </BackgroundContext>
  );
};

/** Paint from the compiled picture so suspended edits keep the previous bubble color. */
export const useVisualizerBackground = (
  color?: string | number,
  background?: string | number,
) => {
  const frame = use(BackgroundContext);
  const fill = color ?? background;
  const inFrame =
    !!frame?.layer &&
    typeof fill === "string" &&
    typeof CSS !== "undefined" &&
    CSS.supports("color", fill) &&
    (background === undefined ||
      (typeof background === "string" && CSS.supports("color", background)));
  return {
    inFrame,
    background: inFrame
      ? createPortal(<path d={frame.path} fill={fill} />, frame.layer!)
      : null,
  };
};
