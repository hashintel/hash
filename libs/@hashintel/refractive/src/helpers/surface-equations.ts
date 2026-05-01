export type EdgeProfile = (x: number) => number;

export const convexCircle: EdgeProfile = (x) => Math.sqrt(1 - (1 - x) ** 2);

export const convex: EdgeProfile = (x) => (1 - (1 - x) ** 4) ** (1 / 4);

export const concave: EdgeProfile = (x) => 1 - convexCircle(x);

export const lip: EdgeProfile = (x) => {
  const cvx = convex(x * 2);
  const ccv = concave(x) + 0.1;
  const smootherstep = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
  return cvx * (1 - smootherstep) + ccv * smootherstep;
};
