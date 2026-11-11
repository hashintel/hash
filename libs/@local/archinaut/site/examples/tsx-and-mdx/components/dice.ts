/** The sums two six-sided dice can land on, 2 to 12. */
export const sums = Array.from({ length: 11 }, (_, index) => index + 2);

/** In how many of the 36 ways two dice land each sum. */
export const waysToRoll = sums.map((sum) => 6 - Math.abs(sum - 7));

/** One roll of two dice, from a source of numbers in [0, 1). */
export const rollTwo = (random: () => number): number =>
  2 + Math.floor(random() * 6) + Math.floor(random() * 6);

/** The counts per sum, with the rolls added. */
export const addRolls = (
  counts: readonly number[],
  rolls: readonly number[],
): number[] => {
  const next = [...counts];
  for (const roll of rolls) {
    next[roll - 2] = (next[roll - 2] ?? 0) + 1;
  }
  return next;
};
