/**
 * Generate a space-separated string of `size` values from a mapping function,
 * suitable for SVG `feComponentTransfer` `tableValues`.
 */
export function generateTableValues(
  size: number,
  fn: (index: number) => number,
): string {
  return Array.from({ length: size }, (_, i) => fn(i).toFixed(6)).join(" ");
}

/**
 * Generate a magnitude lookup table that maps border distance ratio
 * to signed normalized displacement, centered at 0.5.
 *
 * @param displacementRadius - Pre-computed displacement samples from Snell's law.
 * @param maximumDisplacement - Max absolute displacement value.
 * @param ratioScale - Multiplier to remap the input ratio (e.g. radius/edgeSize
 *   when edgeSize < radius, compressing the bezel into a narrower band).
 */
export function generateMagnitudeTable(
  displacementRadius: number[],
  maximumDisplacement: number,
  ratioScale: number = 1,
): string {
  return generateTableValues(256, (i) => {
    if (i === 0 || maximumDisplacement === 0) {
      return 0.5;
    }
    const ratio = Math.min(1, (i / 255) * ratioScale);
    const sampleIndex = Math.min(
      Math.round(ratio * displacementRadius.length),
      displacementRadius.length - 1,
    );
    const displacement = displacementRadius[sampleIndex] ?? 0;
    return Math.max(
      0,
      Math.min(1, (displacement / maximumDisplacement + 1) / 2),
    );
  });
}

/**
 * Generate a surface tilt lookup table from an edge profile function.
 *
 * Maps border distance ratio [0,1] to normalized surface tilt [0,1],
 * where 0 = flat surface (no diffuse contribution) and 1 = maximum tilt.
 *
 * The tilt is `sin(atan(derivative))` = `|d| / sqrt(1 + d²)` where d is
 * the edge profile's derivative at the given ratio.
 *
 * @param edgeProfile - Surface equation function (e.g. convex, concave).
 * @param ratioScale - Multiplier to remap the input ratio (e.g. radius/edgeSize).
 */
export function generateSurfaceTiltTable(
  edgeProfile: (x: number) => number,
  ratioScale: number = 1,
): string {
  return generateTableValues(256, (i) => {
    if (i === 0) return 0; // border/outside → no effect
    const ratio = Math.min(1, (i / 255) * ratioScale);
    if (ratio >= 1) return 0; // past the edge → flat
    const dx = 0.0001;
    const derivative =
      (edgeProfile(Math.min(1, ratio + dx)) - edgeProfile(ratio)) / dx;
    // sin(atan(d)) = |d| / sqrt(1 + d²)
    return Math.abs(derivative) / Math.sqrt(1 + derivative * derivative);
  });
}
