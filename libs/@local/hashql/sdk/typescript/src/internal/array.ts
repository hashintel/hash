/**
 * Array helpers that narrow readonly unions, which `Array.isArray` does not.
 *
 * @internal
 */

/** Narrows `value` to its readonly array members. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- `T` accepts the non-array members without widening to `unknown`
export const isReadonlyArray = <T, E>(
  value: T | readonly E[],
): value is readonly E[] => Array.isArray(value);
