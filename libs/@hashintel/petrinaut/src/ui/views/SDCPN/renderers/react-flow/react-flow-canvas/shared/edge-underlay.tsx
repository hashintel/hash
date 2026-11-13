import { BaseEdge } from "@xyflow/react";

import {
  ARC_HALO_OVERHANG,
  ARC_WHITE_OVERHANG,
} from "../../../../styles/focus";

const selectionBandStyle = {
  stroke: "rgba(249, 115, 22, 0.4)",
  strokeWidth: 8,
} as const;

/**
 * What a line on the canvas wears beneath its own stroke: a thick band while
 * it is selected, and the focus casing, white around the stroke and the
 * role's colour around that, matching the bands a highlighted node wears.
 */
export const EdgeUnderlay: React.FC<{
  id: string;
  path: string;
  selected: boolean | undefined;
  /** The focus role's colour, or `undefined` for a line with no role. */
  haloColor: string | undefined;
  /** The line's own stroke, which the casing follows. */
  strokeWidth: number;
  strokeDasharray: string | undefined;
  strokeLinecap: "round" | "butt";
}> = ({
  id,
  path,
  selected,
  haloColor,
  strokeWidth,
  strokeDasharray,
  strokeLinecap,
}) => (
  <>
    {selected ? (
      <BaseEdge id={`${id}-selection`} path={path} style={selectionBandStyle} />
    ) : null}
    {haloColor === undefined
      ? null
      : [
          [haloColor, ARC_HALO_OVERHANG] as const,
          ["white", ARC_WHITE_OVERHANG] as const,
        ].map(([stroke, overhang]) => (
          <path
            key={stroke}
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth + overhang * 2}
            strokeDasharray={strokeDasharray}
            strokeLinecap={strokeLinecap}
            style={{ pointerEvents: "none" }}
          />
        ))}
  </>
);
