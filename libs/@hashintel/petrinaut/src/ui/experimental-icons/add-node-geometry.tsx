import { useId } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { IconMotionLayer } from "./shared/icon-motion-layer";

export type ExperimentalIconBadgeVisibility = "hover" | "visible" | "hidden";

const badgeVisibilityStyle = css({
  "--add-icon-badge-opacity": "0",
  "--add-icon-badge-scale": "0.7",
  '&[data-badge="visible"], svg:hover &[data-badge="hover"], button:hover &[data-badge="hover"]':
    {
      "--add-icon-badge-opacity": "1",
      "--add-icon-badge-scale": "1",
    },
});

export const AddNodeGeometry = ({
  kind,
  filled,
  selected,
  badge,
  transition,
}: {
  kind: "place" | "transition";
  filled: boolean;
  selected: boolean;
  badge: ExperimentalIconBadgeVisibility;
  transition: string;
}) => {
  const id = useId();
  const cutoutId = `${id}-cutout`;
  const revealId = `${id}-reveal`;
  const frameStyle = { rx: kind === "place" ? "8px" : "2px", transition };
  const symbolStyle = {
    opacity: "var(--add-icon-badge-opacity)",
    transform: "scale(var(--add-icon-badge-scale))",
    transformOrigin: "19px 19px",
    transition,
  };

  return (
    <g className={badgeVisibilityStyle} data-badge={badge}>
      <defs>
        <mask
          id={cutoutId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="white" stroke="none" />
          <g style={symbolStyle}>
            <IconMotionLayer name="symbol" origin="19px 19px">
              <circle cx="19" cy="19" r="5" fill="black" stroke="none" />
            </IconMotionLayer>
          </g>
        </mask>
        <mask
          id={revealId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <path
            d="M3 12h18"
            stroke="white"
            strokeWidth="20"
            strokeLinecap="butt"
            pathLength="1"
            data-icon-draw={filled ? "reveal" : undefined}
          />
        </mask>
      </defs>
      <g mask={`url(#${cutoutId})`}>
        <IconMotionLayer name="frame">
          <g
            style={{
              transform: selected ? "scale(1.04)" : "scale(1)",
              transformOrigin: "12px 12px",
              transition,
            }}
          >
            <rect
              x="4"
              y="4"
              width="16"
              height="16"
              rx={kind === "place" ? 8 : 2}
              style={{ ...frameStyle, opacity: filled ? 0 : 1 }}
              fill="none"
              pathLength="1"
              data-icon-draw={filled ? undefined : "frame"}
            />
            <g style={{ opacity: filled ? 1 : 0, transition }}>
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx={kind === "place" ? 8 : 2}
                style={frameStyle}
                fill="currentColor"
                stroke="none"
                mask={`url(#${revealId})`}
              />
            </g>
          </g>
        </IconMotionLayer>
      </g>
      <g data-icon-part="badge" fill="none" style={symbolStyle}>
        <IconMotionLayer name="symbol" origin="19px 19px">
          <path d="M16 19h6" pathLength="1" data-icon-draw="horizontal" />
          <path d="M19 16v6" pathLength="1" data-icon-draw="vertical" />
        </IconMotionLayer>
      </g>
    </g>
  );
};
