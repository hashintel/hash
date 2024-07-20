/**
 * Narrows the type of a search term to a member of a tuple.
 */
export function tupleIncludes<const T>(
  array: readonly T[],
  searchElement: unknown,
): searchElement is T {
  return array.includes(searchElement as T);
}
