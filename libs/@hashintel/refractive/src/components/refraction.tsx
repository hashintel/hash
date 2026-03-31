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

type RefractionProps = {
  /** Magnitude lookup table (from generateMagnitudeTable). */
  magnitudeTable: string;
  /** Displacement scale factor. */
  scale: number;
  /** Input result name containing the polar map (R=ratio, G=angle). */
  in: string;
  /** Input result name for the source to be displaced. */
  source: string;
  /** Output result name for the displaced image. */
  result: string;
};

/**
 * @private
 * Refraction effect: converts a polar distance map into a cartesian displacement
 * field and applies it to a source image via feDisplacementMap.
 *
 * Pipeline:
 * 1. Extract angle (G) → apply cos/sin lookup tables via feComponentTransfer
 * 2. Extract distance ratio (R) → apply magnitude lookup table (Snell's law)
 * 3. Signed multiplication via feComposite arithmetic: magnitude × trig
 * 4. Apply displacement to source
 *
 * The signed multiplication formula `result = 2·A·B − A − B + 1` correctly
 * multiplies two values encoded in [0,1] centered at 0.5.
 */
export const Refraction: React.FC<RefractionProps> = ({
  magnitudeTable,
  scale,
  in: inResult,
  source,
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
      result={`${result}_displacement`}
    />

    {/* Apply displacement to source */}
    <feDisplacementMap
      in={source}
      in2={`${result}_displacement`}
      scale={scale}
      xChannelSelector="R"
      yChannelSelector="G"
      result={result}
    />
  </>
);
