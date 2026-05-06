/**
 * Pre-computes per-sample ray deviation using Snell's law.
 *
 * Given optical parameters, returns an array of displacement values
 * (one per sample across the edge size) encoding how far a vertical
 * ray is deflected horizontally after passing through the surface.
 */
export function calculateDisplacementMapRadius(
  thickness: number = 200,
  edgeSize: number = 50,
  edgeProfile: (x: number) => number = (x) => x,
  refractiveIndex: number = 1.5,
  samples: number = 128,
): number[] {
  // Pre-calculate the distance the ray will be deviated
  // given the distance to border (ratio of edge)
  // and thickness of the material
  const eta = 1 / refractiveIndex;

  // Simplified refraction, which only handles fully vertical incident ray [0, 1]
  function refract(normalX: number, normalY: number): [number, number] | null {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
      // Total internal reflection
      return null;
    }
    const kSqrt = Math.sqrt(k);
    return [
      -(eta * dot + kSqrt) * normalX,
      eta - (eta * dot + kSqrt) * normalY,
    ] as const;
  }

  return Array.from({ length: samples }, (_, i) => {
    const x = i / samples;
    const y = edgeProfile(x);

    // Calculate derivative in x
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = edgeProfile(x + dx);
    const derivative = (y2 - y) / dx;
    const magnitude = Math.sqrt(derivative * derivative + 1);
    const normal = [-derivative / magnitude, -1 / magnitude] as const;
    const refracted = refract(normal[0], normal[1]);

    if (!refracted) {
      return 0;
    } else {
      const remainingHeightOnEdge = y * edgeSize;
      const remainingHeight = remainingHeightOnEdge + thickness;

      // Return displacement (rest of travel on x-axis, depends on remaining height to hit bottom)
      return refracted[0] * (remainingHeight / refracted[1]);
    }
  });
}
