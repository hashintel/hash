import { generateTableValues } from "../helpers/generate-table-values";

// Trig tables are constant — computed once at module level.
const cosTable = generateTableValues(256, (i) => {
  const angle = (i / 255) * 2 * Math.PI;
  return (Math.cos(angle) + 1) / 2;
});

const sinTable = generateTableValues(256, (i) => {
  const angle = (i / 255) * 2 * Math.PI;
  return (Math.sin(angle) + 1) / 2;
});

type PolarToCartesianProps = {
  /** Magnitude lookup table (from generateMagnitudeTable). */
  magnitudeTable: string;
  /** Input result name containing the polar map (R=ratio, G=angle). */
  in: string;
  /** Output result name for the cartesian displacement map. */
  result: string;
};

/**
 * @private
 * SVG filter primitives that convert a polar distance map (R = border distance
 * ratio, G = displacement angle) into a cartesian displacement map (R = dx,
 * G = dy, centered at 0.5).
 *
 * Pipeline:
 * 1. Extract angle (G) → apply cos/sin lookup tables via feComponentTransfer
 * 2. Extract distance ratio (R) → apply magnitude lookup table
 * 3. Signed multiplication via feComposite arithmetic: magnitude × trig
 *
 * The signed multiplication formula `result = 2·A·B − A − B + 1` correctly
 * multiplies two values encoded in [0,1] centered at 0.5.
 */
export const PolarToCartesian: React.FC<PolarToCartesianProps> = ({
  magnitudeTable,
  in: inResult,
  result,
}) => (
  <>
    {/* Copy angle (G) into R and G for trig lookup */}
    <feColorMatrix
      in={inResult}
      type="matrix"
      values="0 1 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
      result={`${result}_trig_in`}
    />

    {/* Apply cos table to R, sin table to G */}
    <feComponentTransfer in={`${result}_trig_in`} result={`${result}_trig`}>
      <feFuncR type="table" tableValues={cosTable} />
      <feFuncG type="table" tableValues={sinTable} />
    </feComponentTransfer>

    {/* Copy distance ratio (R) into R and G for magnitude lookup */}
    <feColorMatrix
      in={inResult}
      type="matrix"
      values="1 0 0 0 0  1 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
      result={`${result}_mag_in`}
    />

    {/* Apply optical transfer function (Snell's law) to both channels */}
    <feComponentTransfer in={`${result}_mag_in`} result={`${result}_mag`}>
      <feFuncR type="table" tableValues={magnitudeTable} />
      <feFuncG type="table" tableValues={magnitudeTable} />
    </feComponentTransfer>

    {/* Signed multiplication: magnitude × trig → cartesian displacement */}
    <feComposite
      in={`${result}_mag`}
      in2={`${result}_trig`}
      operator="arithmetic"
      k1={2}
      k2={-1}
      k3={-1}
      k4={1}
      result={result}
    />
  </>
);
