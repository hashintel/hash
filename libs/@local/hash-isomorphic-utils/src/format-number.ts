export const formatNumber = (num: number): string =>
  num.toLocaleString(undefined, { maximumFractionDigits: 100 });
