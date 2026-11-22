import {
  ARC_HALO_OVERHANG,
  ARC_WHITE_OVERHANG,
} from "../../../../styles/focus";

const selectionBand = {
  stroke: "rgba(249, 115, 22, 0.4)",
  strokeWidth: 8,
} as const;

/**
 * What a line on the canvas wears beneath its own stroke: a thick band while
 * it is selected, and the focus casing, white around the stroke and the
 * role's colour around that, matching the bands a highlighted node wears.
 * None of it takes the pointer: the line it lies under does.
 */
export const LineUnderlay: React.FC<{
  path: string;
  selected: boolean | undefined;
  /** The focus role's colour, or `undefined` for a line with no role. */
  haloColor: string | undefined;
  /** The line's own stroke, which the casing follows. */
  strokeWidth: number;
  strokeDasharray: string | undefined;
  strokeLinecap: "round" | "butt";
}> = ({
  path,
  selected,
  haloColor,
  strokeWidth,
  strokeDasharray,
  strokeLinecap,
}) => {
  const casing = {
    d: path,
    fill: "none",
    strokeDasharray,
    strokeLinecap,
    pointerEvents: "none",
  } as const;

  return (
    <>
      {selected ? (
        <path d={path} fill="none" pointerEvents="none" {...selectionBand} />
      ) : null}
      {haloColor === undefined ? null : (
        <>
          <path
            {...casing}
            stroke={haloColor}
            strokeWidth={strokeWidth + ARC_HALO_OVERHANG * 2}
          />
          <path
            {...casing}
            stroke="white"
            strokeWidth={strokeWidth + ARC_WHITE_OVERHANG * 2}
          />
        </>
      )}
    </>
  );
};
