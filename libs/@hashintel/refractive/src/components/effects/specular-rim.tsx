import { generateTableValues } from "../../helpers/generate-table-values";

/**
 * Generates a rim falloff lookup table.
 *
 * Maps distance-to-border ratio [0,1] to rim intensity [0,1].
 * The rim is always ~2px wide: `ratio = 2/radius` corresponds to 2px.
 * A subtle exponential tail extends a few pixels beyond.
 */
function generateRimTable(radius: number): string {
  // 2px expressed as a ratio of the total edge
  const onePixelRatio = radius > 0 ? 2 / radius : 1;

  return generateTableValues(256, (i) => {
    const ratio = i / 255;
    // Sharp peak at the border (first pixel), exponential decay after
    return Math.exp((-ratio / onePixelRatio) * 2);
  });
}

/**
 * Generates a directional highlight lookup table.
 *
 * Maps the polar map angle channel [0,255] → [0,2π] to a cosine
 * lobe centered on `lightAngle`. The lobe width is controlled by
 * `spread`: 1 = normal cosine, higher = tighter highlight.
 */
function generateDirectionalTable(lightAngle: number, spread: number): string {
  return generateTableValues(256, (i) => {
    // The polar map G channel encodes the displacement angle (toward center).
    const angle = (i / 255) * 2 * Math.PI;
    const dot = Math.cos(angle - lightAngle);
    // Raise to power for tighter highlights, clamp negative
    return Math.pow(Math.max(0, dot), spread);
  });
}

type SpecularRimProps = {
  /** Input result name containing the polar map (R=distance ratio, G=angle). */
  in: string;
  /** Input source image to overlay the specular rim onto. */
  source: string;
  /** Corner radius in pixels — used to scale the rim to always be ~1px wide. */
  radius: number;
  /** Light angle in radians (0 = right, π/2 = down, π = left, 3π/2 = up). */
  lightAngle?: number;
  /** Controls the tightness of the directional highlight (1 = broad, higher = tighter). */
  spread?: number;
  /** Brightness multiplier for the specular highlight [0,1]. */
  intensity?: number;
  /** Output result name. */
  result: string;
};

/**
 * @private
 * Specular rim effect: produces a directional edge highlight from the polar map
 * and composites it over a source image.
 *
 * Pipeline:
 * 1. Apply rim falloff table to R channel (distance-to-border → rim intensity)
 * 2. Copy G channel (angle) to R, apply directional cosine table
 * 3. Multiply rim × directional → combined specular intensity
 * 4. Convert to white highlight with alpha = intensity
 * 5. Composite over source
 */
export const SpecularRim: React.FC<SpecularRimProps> = ({
  in: inResult,
  source,
  radius,
  lightAngle = Math.PI / 4,
  spread = 2,
  intensity = 0.6,
  result,
}) => {
  const rimTable = generateRimTable(radius);
  const directionalTable = generateDirectionalTable(lightAngle, spread);

  return (
    <>
      {/* 1. Distance-based rim falloff: R channel → rim intensity */}
      <feComponentTransfer in={inResult} result={`${result}_rim`}>
        <feFuncR type="table" tableValues={rimTable} />
        <feFuncG type="discrete" tableValues="0" />
        <feFuncB type="discrete" tableValues="0" />
      </feComponentTransfer>

      {/* 2. Copy angle (G) into R for directional lookup */}
      <feColorMatrix
        in={inResult}
        type="matrix"
        values="0 1 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result={`${result}_angle`}
      />

      {/* 3. Apply directional cosine table to R channel */}
      <feComponentTransfer in={`${result}_angle`} result={`${result}_dir`}>
        <feFuncR type="table" tableValues={directionalTable} />
      </feComponentTransfer>

      {/* 4. Multiply rim × directional (both in R channel) */}
      <feComposite
        in={`${result}_rim`}
        in2={`${result}_dir`}
        operator="arithmetic"
        k1={1}
        k2={0}
        k3={0}
        k4={0}
        result={`${result}_combined`}
      />

      {/* 5. Convert to white highlight: RGB=1, A=R×intensity */}
      <feColorMatrix
        in={`${result}_combined`}
        type="matrix"
        values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${intensity} 0 0 0 0`}
        result={`${result}_highlight`}
      />

      {/* 6. Composite highlight over source */}
      <feComposite
        in={`${result}_highlight`}
        in2={source}
        operator="over"
        result={result}
      />
    </>
  );
};
