/**
 * used to find matches of search in the given choices using the fuzzy search algorithm
 * @see https://en.wikipedia.org/wiki/Approximate_string_matching
 */
export const fuzzySearchBy = <T>(
  choices: T[],
  search: string,
  getter: (choice: T) => string,
): T[] => {
  const lowerSearch = search.toLowerCase();
  const searchLength = search.length;

  return choices.filter((choice) => {
    const match = getter(choice).toLowerCase();

    let offset = 0;
    for (let searchIndex = 0; searchIndex < searchLength; searchIndex++) {
      const matchIndex = match.indexOf(lowerSearch.charAt(searchIndex), offset);
      if (matchIndex < 0) {
        return false;
      }
      offset = matchIndex + 1;
    }

    return true;
  });
};
