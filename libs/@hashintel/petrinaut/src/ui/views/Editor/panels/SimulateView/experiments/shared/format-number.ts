/** Integers as they are; other numbers to three decimals. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3);
