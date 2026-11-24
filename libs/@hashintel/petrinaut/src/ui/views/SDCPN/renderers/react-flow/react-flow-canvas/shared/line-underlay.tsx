import { ARC_STROKE_WIDTH } from "../arc-head";

/**
 * How far each casing stands out either side of the line it wraps: white
 * first, lifting the line off the canvas, then the role's colour around that.
 * The two match the bands a highlighted node wears outside its border.
 */
const whiteOverhang = 2;
const haloOverhang = whiteOverhang + 2;

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
  strokeDasharray?: string;
  strokeLinecap: "round" | "butt";
}> = ({ path, selected, haloColor, strokeDasharray, strokeLinecap }) => {
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
            strokeWidth={ARC_STROKE_WIDTH + haloOverhang * 2}
          />
          <path
            {...casing}
            stroke="white"
            strokeWidth={ARC_STROKE_WIDTH + whiteOverhang * 2}
          />
        </>
      )}
    </>
  );
};
