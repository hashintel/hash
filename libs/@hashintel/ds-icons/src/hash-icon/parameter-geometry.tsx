import { useId } from "react";

import { css } from "@hashintel/ds-helpers/css";

const scrubStyle = css({
  "--parameter-scrub-direction": "1",
  '&[data-slider="bottom"]': { "--parameter-scrub-direction": "-1" },
  animationName: "[none]",
  animationTimingFunction: "[cubic-bezier(0.4, 0, 0.2, 1)]",
  animationIterationCount: "[1]",
});

const ParameterKnobs = ({
  duration,
  animated,
  masked = false,
}: {
  duration: number;
  animated: boolean;
  masked?: boolean;
}) => (
  <>
    {(["top", "bottom"] as const).map((slider) => (
      <g
        key={slider}
        className={scrubStyle}
        data-icon-detail={animated ? "slider" : undefined}
        data-slider={slider}
        style={{ animationDuration: `${duration}ms` }}
      >
        <circle
          pathLength="1"
          data-icon-draw={masked ? undefined : `knob-${slider}`}
          cx={slider === "top" ? 10 : 14}
          cy={slider === "top" ? 7 : 17}
          r="3"
          fill={masked ? "black" : "none"}
          stroke={masked ? "none" : undefined}
        />
      </g>
    ))}
  </>
);

export const ParameterGeometry = ({
  duration,
  animated,
}: {
  duration: number;
  animated: boolean;
}) => {
  const trackMaskId = useId();

  return (
    <g fill="none">
      <defs>
        <mask
          id={trackMaskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="white" stroke="none" />
          <ParameterKnobs duration={duration} animated={animated} masked />
        </mask>
      </defs>
      <path
        pathLength="1"
        data-icon-draw="tracks"
        data-icon-part="tracks"
        d="M4 7h16M4 17h16"
        mask={`url(#${trackMaskId})`}
      />
      <ParameterKnobs duration={duration} animated={animated} />
    </g>
  );
};
