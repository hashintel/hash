export type SurfaceFnDef = (x: number) => number;

export const CONVEX_CIRCLE: SurfaceFnDef = (x) => Math.sqrt(1 - (1 - x) ** 2);

export const CONVEX: SurfaceFnDef = (x) => (1 - (1 - x) ** 4) ** (1 / 4);

export const CONCAVE: SurfaceFnDef = (x) => 1 - CONVEX_CIRCLE(x);

export const LIP: SurfaceFnDef = (x) => {
  const convex = CONVEX(x * 2);
  const concave = CONCAVE(x) + 0.1;
  const smootherstep = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
  return convex * (1 - smootherstep) + concave * smootherstep;
};
