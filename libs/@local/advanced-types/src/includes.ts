/**
 * Narrows the type of a search term to a member of T
 *
 * Array MUST be passed as a tuple
 * @example includes(["foo", "bar"] as const, "foo") // true
 */
export function tupleIncludes<T>(
  array: readonly T[],
  searchElement: unknown,
): searchElement is T {
  return array.includes(searchElement as T);
}
