/**
 * 'Omit' for use on a union, to 'distribute' the omit across the union, rather than applying it to an interaction of the union
 * – 'Omit' applys to an interaction because of its use of keyof, which returns the common keys of the union,
 *    which results in also losing keys which are not present on all members of the union.
 */
export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;
