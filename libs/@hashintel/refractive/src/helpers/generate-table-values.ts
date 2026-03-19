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
 * @param ratioScale - Multiplier to remap the input ratio (e.g. radius/bezelWidth
 *   when bezelWidth < radius, compressing the bezel into a narrower band).
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
