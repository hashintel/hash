export const formatNumber = (num: number) => {
  return num.toLocaleString(undefined, { maximumFractionDigits: 100 });
};
