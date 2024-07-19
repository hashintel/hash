/**
 * 'Omit' for use on a union, to 'distribute' the omit across the union, rather than applying it to an intersection of the union
 * – 'Omit' applies to an intersection because it applies keyof to T, which gives an interaction of the keys of union T.
 * We must use a conditional mapped type to apply the Omit to each member of the union instead.
 *
 * @see https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
 */
export type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

export type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;
