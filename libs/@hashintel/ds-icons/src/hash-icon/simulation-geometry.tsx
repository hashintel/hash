import { useId } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { IconMotionLayer } from "./shared/icon-motion-layer";

import type { SVGProps } from "react";

const simulationStyle = css({
  "--simulation-selected": "0",
  "--simulation-hover": "0",
  "--simulation-pressed": "0",
  '&[data-selected="true"], [data-scope="segment-group"][data-part="item"][data-state="checked"] &, button[aria-pressed="true"] &':
    { "--simulation-selected": "1" },
  '&[data-hover="true"]:is(button:is(:hover, :focus-visible) *, a[href]:is(:hover, :focus-visible) *, [data-scope="segment-group"][data-part="item"]:is(:hover, [data-focus-visible]) *, [data-icon-preview]:hover *):not(:is(button:disabled *, [aria-disabled="true"] *, [data-disabled] *))':
    {
      "--simulation-hover": "1",
      '&[data-wave="true"] [data-icon-part="bubbles"]': {
        animationName: "[petrinautIconLiquidWave]",
      },
    },
  '&[data-hover="true"]:is(button:active *, [data-scope="segment-group"][data-part="item"]:active *):not(:is(button:disabled *, [aria-disabled="true"] *, [data-disabled] *))':
    { "--simulation-pressed": "1" },
});

const waveStyle = css({
  animationName: "[none]",
  animationTimingFunction: "[cubic-bezier(0.4, 0, 0.2, 1)]",
  animationIterationCount: "[1]",
});

type SimulationGeometryProps = {
  selected: boolean;
  hover: boolean;
  filled: boolean;
  transition: string;
};

const flaskOutline =
  "M9 3v7L4 19a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-5-9V3Z";
const flatLiquid =
  "M-6 15.5C-2 15.5 2 15.5 6 15.5S14 15.5 18 15.5S26 15.5 30 15.5V26H-6Z";
const liquidWave = [
  flatLiquid,
  "M-6 15.5C-2 15.5 2 11.5 6 13.5S14 18.5 18 16.5S26 14.5 30 15.5V26H-6Z",
  "M-6 15.5C-2 15.5 2 16.5 6 17S14 11.5 18 13.5S26 18 30 15.5V26H-6Z",
  "M-6 15.5C-2 15.5 2 14.5 6 15S14 16.5 18 16S26 15 30 15.5V26H-6Z",
  flatLiquid,
].join(";");

const LiquidPath = ({
  animated,
  duration,
  ...props
}: SVGProps<SVGPathElement> & { animated: boolean; duration: number }) => (
  <path {...props} d={flatLiquid}>
    {animated && (
      <animate
        attributeName="d"
        begin="indefinite"
        dur={`${duration}ms`}
        values={liquidWave}
        keyTimes="0;0.25;0.5;0.75;1"
        calcMode="spline"
        keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
      />
    )}
  </path>
);

export const FlaskGeometry = ({
  selected,
  hover,
  filled,
  transition,
  waveDuration,
}: SimulationGeometryProps & { waveDuration: number }) => {
  const clipId = useId();
  const waveEnabled = hover && transition !== "none";

  return (
    <IconMotionLayer name="whole">
      <g
        className={simulationStyle}
        data-selected={selected}
        data-hover={hover}
        data-wave={waveEnabled}
        fill="none"
        onAnimationStart={(event) => {
          if (event.animationName === "petrinautIconLiquidWave") {
            event.currentTarget
              .querySelectorAll<SVGAnimateElement>("animate")
              .forEach((animation) => animation.beginElement());
          }
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={flaskOutline} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <g
            data-icon-part="liquid-level"
            style={{
              transform: "translateY(calc(var(--simulation-selected) * -1px))",
              transition,
            }}
          >
            <g
              data-icon-part="liquid-back"
              style={{
                transform:
                  "translateX(calc(var(--simulation-selected) * -2px))",
                transition,
              }}
            >
              <LiquidPath
                animated={waveEnabled}
                duration={waveDuration}
                fill="currentColor"
                fillOpacity={filled ? 0.28 : 0.2}
                stroke="none"
              />
            </g>
            <g
              data-icon-part="liquid-front"
              style={{
                transform: "translateX(calc(var(--simulation-selected) * 2px))",
                transition,
              }}
            >
              <LiquidPath
                animated={waveEnabled}
                duration={waveDuration}
                fill="currentColor"
                fillOpacity={filled ? 0.42 : 0.32}
                stroke="none"
              />
              <LiquidPath
                animated={waveEnabled}
                duration={waveDuration}
                strokeWidth="1.2"
                opacity="0.85"
              />
            </g>
            <g
              className={waveStyle}
              data-icon-part="bubbles"
              fill="currentColor"
              stroke="none"
              style={{
                animationDuration: `${waveDuration}ms`,
              }}
            >
              <circle cx="9" cy="18.5" r="0.6" />
              <circle cx="14.5" cy="19" r="0.4" opacity="0.6" />
            </g>
          </g>
        </g>
        <path d={flaskOutline} />
        <path d="M8 3h8" />
      </g>
    </IconMotionLayer>
  );
};

export const LayerGeometry = ({
  selected,
  hover,
  filled,
  transition,
}: SimulationGeometryProps) => (
  <IconMotionLayer name="whole">
    <g
      className={simulationStyle}
      data-selected={selected}
      data-hover={hover}
      fill="none"
    >
      <path
        data-icon-part="layer-top"
        d="m3 8 9-5 9 5-9 5Z"
        fill="currentColor"
        fillOpacity={filled ? 0.18 : 0.06}
        style={{
          transform:
            "translateY(calc(var(--simulation-selected) * -0.6px + var(--simulation-hover) * -0.8px + var(--simulation-pressed) * 1.2px))",
          transition,
        }}
      />
      <path data-icon-part="layer-middle" d="m3 12 9 5 9-5" />
      <path
        data-icon-part="layer-bottom"
        d="m3 16 9 5 9-5"
        style={{
          transform:
            "translateY(calc(var(--simulation-selected) * 0.6px + var(--simulation-hover) * 0.5px + var(--simulation-pressed) * -0.8px))",
          transition,
        }}
      />
    </g>
  </IconMotionLayer>
);
