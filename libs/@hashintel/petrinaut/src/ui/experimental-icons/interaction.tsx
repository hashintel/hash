import { css } from "@hashintel/ds-helpers/css";

import { petriconHints } from "./shared/petricon-hints";

import type { ExperimentalIconName } from "../experimental-icons";
import type { PropsWithChildren } from "react";

const interactionStyle = css({
  transformOrigin: "[12px 12px]",
  "& g": { transition: "[inherit]" },
  "& [data-icon-detail]": {
    transformOrigin: "[12px 12px]",
    transition: "[inherit]",
    animationDuration: "[var(--petricon-detail-duration)]",
    animationTimingFunction: "[cubic-bezier(0.2, 0, 0.2, 1)]",
    animationIterationCount: "[1]",
  },
  '&[data-hint="sequence"] > g > g > *': {
    transformOrigin: "[12px 12px]",
    animationDuration: "[var(--petricon-detail-duration)]",
    animationTimingFunction: "[ease-out]",
    "&:nth-child(2)": { animationDelay: "[35ms]" },
    "&:nth-child(3)": { animationDelay: "[70ms]" },
    "&:nth-child(4)": { animationDelay: "[105ms]" },
  },
  "& [data-icon-detail=eyes]": { transformOrigin: "[12px 13px]" },
  "& [data-icon-detail=scan-bar]": { transformOrigin: "[12px 20px]" },
  "& [data-icon-detail=lid]": { transformOrigin: "[5px 6px]" },
  "& [data-icon-detail=bars]": { transformOrigin: "[12px 19px]" },
  "& [data-icon-detail=calendar-day]": { transformOrigin: "[9.5px 15.5px]" },
  "& [data-icon-detail=calendar-hand]": { transformOrigin: "[16px 16px]" },
  "& [data-icon-detail=tag-token]": { transformOrigin: "[13.5px 13.5px]" },
  '&[data-hover="true"]:is(button:is(:hover, :focus-visible) *, a[href]:is(:hover, :focus-visible) *, [role="tab"]:hover *, [role="menuitem"][data-highlighted] *, [data-icon-preview]:hover *, label[data-scope="checkbox"]:is(:hover, [data-focus-visible]) *, [data-scope="segment-group"][data-part="item"]:is(:hover, [data-focus-visible]) *):not(:is(button:disabled *, [aria-disabled="true"] *, [data-disabled] *))':
    {
      '&[data-hint="right"]': { transform: "[translateX(1px)]" },
      '&[data-hint="left"]': { transform: "[translateX(-1px)]" },
      '&[data-hint="up"], &[data-hint="lift"]': {
        transform: "[translateY(-1px)]",
      },
      '&[data-hint="down"]': { transform: "[translateY(1px)]" },
      '&[data-hint="out"]': { transform: "[translate(0.7px, -0.7px)]" },
      '&[data-hint="tilt"]': { transform: "[rotate(-6deg)]" },
      '&[data-hint="rewind"]': { transform: "[rotate(-12deg)]" },
      '&[data-hint="turn"]': { transform: "[rotate(12deg)]" },
      '&[data-hint="grow"]': { transform: "[scale(1.06)]" },
      '&[data-hint="shrink"]': { transform: "[scale(0.94)]" },
      '&[data-hint="sequence"] > g > g > *': {
        animationName: "[petriconSequence]",
      },
      "& [data-icon-detail=open-left]": { transform: "[translateX(-0.8px)]" },
      "& [data-icon-detail=open-right]": { transform: "[translateX(0.8px)]" },
      "& [data-icon-detail=notation], & [data-icon-detail=type-mark]": {
        animationName: "[petriconNotation]",
      },
      "& [data-icon-detail=bounds]": { transform: "[scaleY(1.08)]" },
      "& [data-icon-detail=row], & [data-icon-detail=connection]": {
        animationName: "[petriconNotation]",
      },
      "& [data-icon-detail=cells], & [data-icon-detail=node], & [data-icon-detail=test-result]":
        { animationName: "[petriconSignal]" },
      "& [data-icon-detail=distribution], & [data-icon-detail=liquid-level]": {
        animationName: "[petriconDistribution]",
      },
      "& [data-icon-detail=orbit], & [data-icon-detail=antenna]": {
        animationName: "[petriconOrbit]",
      },
      "& [data-icon-detail=eyes]": { animationName: "[petriconBlink]" },
      "& [data-icon-detail=scan-bar]": { animationName: "[petriconScan]" },
      "& [data-icon-detail=lid]": {
        transform: "[translateY(-1px) rotate(-6deg)]",
      },
      "& [data-icon-detail=sheet]": { transform: "[translate(0.7px, 0.7px)]" },
      "& [data-icon-detail=down]": { transform: "[translateY(1px)]" },
      "& [data-icon-detail=right]": { transform: "[translateX(1px)]" },
      "& [data-icon-detail=out]": { transform: "[translate(0.7px, -0.7px)]" },
      "& [data-icon-detail=dot]": { transform: "[scale(1.2)]" },
      "& [data-icon-detail=shackle]": { transform: "[translateY(-0.7px)]" },
      "& [data-icon-detail=pupil]": { transform: "[scale(1.15)]" },
      "& [data-icon-detail=clock-hand]": { transform: "[rotate(-12deg)]" },
      "& [data-icon-detail=bars]": { transform: "[scaleY(1.08)]" },
      "& [data-icon-detail=line-chart]": { transform: "[translateY(-0.7px)]" },
      "& [data-icon-detail=lines]": { transform: "[translateX(0.7px)]" },
      "& [data-icon-detail=target]": { transform: "[scale(0.9)]" },
      "& [data-icon-detail=sparkle]": {
        transform: "[scale(1.06) rotate(4deg)]",
      },
      "& [data-icon-detail=wave]": { transform: "[scaleY(0.85)]" },
      "& [data-icon-detail=bell-clapper]": { transform: "[translateX(0.7px)]" },
      "& [data-icon-detail=calendar-day]": { transform: "[scale(1.1)]" },
      "& [data-icon-detail=calendar-hand]": { transform: "[rotate(-12deg)]" },
      "& [data-icon-detail=filament]": { transform: "[translateY(-0.7px)]" },
      "& [data-icon-detail=slider]": {
        animationName: "[petrinautIconParameterScrub]",
      },
    },
  '&[data-hover="true"]:is(button:active *, a[href]:active *, [data-scope="segment-group"][data-part="item"]:active *):not(:is(button:disabled *, [aria-disabled="true"] *, [data-disabled] *))':
    {
      transform: "[scale(0.94)]",
    },
});

export const IconInteraction = ({
  name,
  enabled,
  transition,
  duration,
  children,
}: PropsWithChildren<{
  name: ExperimentalIconName;
  enabled: boolean;
  transition: string;
  duration: number;
}>) => (
  <g
    className={interactionStyle}
    data-hover={enabled}
    data-hint={petriconHints[name]}
    style={
      {
        transition,
        "--petricon-detail-duration": `${duration}ms`,
      } as React.CSSProperties
    }
  >
    <g data-icon-feedback="" style={{ transformOrigin: "12px 12px" }}>
      {children}
    </g>
  </g>
);
