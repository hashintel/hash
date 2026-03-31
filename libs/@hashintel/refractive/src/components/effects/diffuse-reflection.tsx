import { generateTableValues } from "../../helpers/generate-table-values";

/**
 * Generates a directional cosine table centered at 0.5 (signed encoding).
 *
 * Maps the polar map angle channel [0,255] → [0,2π] to
 * `(cos(angle - lightAngle) + 1) / 2`, where 0.5 = perpendicular,
 * 1 = facing light, 0 = facing away.
 */
function generateCosAngleTable(lightAngle: number): string {
  return generateTableValues(256, (i) => {
    const angle = (i / 255) * 2 * Math.PI;
    return (Math.cos(angle - lightAngle) + 1) / 2;
  });
}

type DiffuseReflectionProps = {
  /** Input result name containing the polar map (R=distance ratio, G=angle). */
  in: string;
  /** Input source image to apply diffuse shading to. */
  source: string;
  /** Light angle in radians (0 = right, π/2 = down, π = left, 3π/2 = up). */
  lightAngle: number;
  /**
   * Pre-computed surface tilt lookup table (from generateSurfaceTiltTable).
   * Maps distance ratio → normalized tilt [0,1].
   */
  surfaceTiltTable: string;
  /** Strength of the diffuse shading [0,1]. */
  intensity?: number;
  /** Output result name. */
  result: string;
};

/**
 * @private
 * Diffuse reflection effect: applies Lambertian-style shading based on the
 * surface normal (derived from the edge profile) and light direction.
 *
 * Surfaces facing the light are brightened (white overlay), surfaces facing
 * away are darkened (black overlay). Neutral areas have alpha=0 and don't
 * affect the source at all — no gray wash on dark backgrounds.
 *
 * Pipeline:
 * 1. Extract angle (G) → cosine of angle relative to light direction (signed, centered at 0.5)
 * 2. Extract distance ratio (R) → surface tilt from edge profile (unsigned [0,1])
 * 3. Signed × unsigned multiply → diffuse value centered at 0.5
 * 4. Light pass: white with alpha = max(0, diffuse - 0.5) × 2 × intensity
 * 5. Dark pass: black with alpha = max(0, 0.5 - diffuse) × 2 × intensity
 */
export const DiffuseReflection: React.FC<DiffuseReflectionProps> = ({
  in: inResult,
  source,
  lightAngle,
  surfaceTiltTable,
  intensity = 0.3,
  result,
}) => {
  const cosAngleTable = generateCosAngleTable(lightAngle);
  const lightAlphaScale = 2 * intensity;

  return (
    <>
      {/* 1. Copy angle (G) into R, apply signed cosine table */}
      <feColorMatrix
        in={inResult}
        type="matrix"
        values="0 1 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result={`${result}_cos_in`}
      />
      <feComponentTransfer in={`${result}_cos_in`} result={`${result}_cos`}>
        <feFuncR type="table" tableValues={cosAngleTable} />
      </feComponentTransfer>

      {/* 2. Apply surface tilt table to R channel (distance ratio → tilt) */}
      <feComponentTransfer in={inResult} result={`${result}_tilt`}>
        <feFuncR type="table" tableValues={surfaceTiltTable} />
      </feComponentTransfer>

      {/* 3. Signed × unsigned multiply: cos(centered 0.5) × tilt(unsigned)
           result = A·B - 0.5·B + 0.5
           Maps to [0,1] centered at 0.5: >0.5 = lit, <0.5 = shadow */}
      <feComposite
        in={`${result}_cos`}
        in2={`${result}_tilt`}
        operator="arithmetic"
        k1={1}
        k2={0}
        k3={-0.5}
        k4={0.5}
        result={`${result}_diffuse`}
      />

      {/* 4. Light pass: white overlay where diffuse > 0.5
           A = intensity × 2 × (R - 0.5), clamped to 0 when R < 0.5 */}
      <feColorMatrix
        in={`${result}_diffuse`}
        type="matrix"
        values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${lightAlphaScale} 0 0 0 ${-intensity}`}
        result={`${result}_light`}
      />
      <feComposite
        in={`${result}_light`}
        in2={source}
        operator="over"
        result={`${result}_lit`}
      />

      {/* 5. Dark pass: black overlay where diffuse < 0.5
           A = intensity × 2 × (0.5 - R), clamped to 0 when R > 0.5 */}
      <feColorMatrix
        in={`${result}_diffuse`}
        type="matrix"
        values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-lightAlphaScale} 0 0 0 ${intensity}`}
        result={`${result}_dark`}
      />
      <feComposite
        in={`${result}_dark`}
        in2={`${result}_lit`}
        operator="over"
        result={result}
      />
    </>
  );
};
