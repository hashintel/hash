export const fuzzySearchBy = <T>(
  choices: T[],
  search: string,
  getter: (choice: T) => string,
): T[] => {
  return choices.filter((choice) => {
    const match = getter(choice).toLowerCase();

    if (match.includes(search)) {
      return true;
    }

    return false;
  });
};
