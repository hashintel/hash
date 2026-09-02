/** A parameter value for a slider readout or a surface caption. */
export const formatAxisValue = (value: number): string => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const abs = Math.abs(value);
  return abs !== 0 && (abs < 0.001 || abs >= 10_000)
    ? value.toExponential(2)
    : String(Number(value.toPrecision(4)));
};
