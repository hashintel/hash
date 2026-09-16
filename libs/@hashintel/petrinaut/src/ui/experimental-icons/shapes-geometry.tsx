import { css } from "@hashintel/ds-helpers/css";

import { IconMotionLayer } from "./shared/icon-motion-layer";

const shapesStyle = css({
  "--shapes-selected": "0",
  "--shapes-hover": "0",
  "--triangle-rotation": "0deg",
  "--triangle-hint": "75deg",
  '&[data-selected="true"], [data-scope="segment-group"][data-part="item"][data-state="checked"] &, button[aria-pressed="true"] &':
    {
      "--shapes-selected": "1",
      "--triangle-rotation": "90deg",
      "--triangle-hint": "12deg",
    },
  '&[data-hover="true"]:is(button:is(:hover, :focus-visible) *, a[href]:is(:hover, :focus-visible) *, [role="tab"]:is(:hover, :focus-visible) *, [role="menuitem"][data-highlighted] *, [data-icon-preview]:hover *, [data-scope="segment-group"][data-part="item"]:is(:hover, [data-focus-visible]) *):not(:is(button:disabled *, [aria-disabled="true"] *, [data-disabled] *))':
    { "--shapes-hover": "1" },
});

export const ShapesGeometry = ({
  selected,
  hover,
  strokeWidth,
  transition,
}: {
  selected: boolean;
  hover: boolean;
  strokeWidth: number | string;
  transition: string;
}) => (
  <IconMotionLayer name="whole">
    <g
      className={shapesStyle}
      data-selected={selected}
      data-hover={hover}
      fill="none"
    >
      <path
        data-icon-part="triangle"
        d="m7 3.5 3.5 7h-7Z"
        style={{
          transform:
            "rotate(calc(var(--triangle-rotation) + var(--shapes-hover) * var(--triangle-hint)))",
          transformOrigin: "7px 7px",
          transition,
        }}
      />
      <circle
        data-icon-part="circle"
        cx="17"
        cy="7"
        r="3.5"
        style={{
          transform: "translateY(calc(var(--shapes-hover) * -0.65px))",
          transition,
          transitionDelay: transition === "none" ? "0ms" : "20ms",
        }}
      />
      <rect
        data-icon-part="square"
        x="3.5"
        y="14"
        width="7"
        height="7"
        rx="1"
        style={{
          transform: "rotate(calc(var(--shapes-hover) * -10deg))",
          transformOrigin: "7px 17.5px",
          transition,
          transitionDelay: transition === "none" ? "0ms" : "30ms",
        }}
      />
      <path
        data-icon-part="diamond"
        d="m17 14 3.5 3.5-3.5 3.5-3.5-3.5Z"
        style={{
          strokeWidth: `calc(${strokeWidth} / (1 + var(--shapes-selected) * 0.41421356))`,
          transform:
            "rotate(calc(var(--shapes-selected) * 45deg + var(--shapes-hover) * 12deg)) scale(calc(1 + var(--shapes-selected) * 0.41421356))",
          transformOrigin: "17px 17.5px",
          transition,
          transitionDelay: transition === "none" ? "0ms" : "45ms",
        }}
      />
    </g>
  </IconMotionLayer>
);
