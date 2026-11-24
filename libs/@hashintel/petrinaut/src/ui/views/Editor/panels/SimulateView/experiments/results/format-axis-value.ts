/**
 * A parameter value for a slider readout or a surface caption. With the axis
 * step known, the value keeps enough digits to tell adjacent positions apart.
 */
export const formatAxisValue = (value: number, step?: number): string => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.001 || abs >= 10_000)) {
    return value.toExponential(2);
  }
  const digits =
    step !== undefined && step > 0 && abs > 0
      ? Math.min(15, Math.max(4, Math.ceil(Math.log10(abs / step)) + 1))
      : 4;
  return String(Number(value.toPrecision(digits)));
};
