/**
 * Number formatting for the event timeline's tooltip and value axis. Token
 * counts and most metrics sit in a range three decimals show; a solver's
 * error is many orders of magnitude smaller, and would read as zero.
 */

/** A value for the tooltip: three decimals, or two significant digits in exponent form when they would all be zero. */
export const formatValue = (value: number): string => {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value !== 0 && Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return String(Math.round(value * 1000) / 1000);
};

/**
 * An axis tick: as many decimals as the spacing between ticks calls for,
 * or exponent form once that spacing drops below a thousandth.
 */
export const formatTick = (value: number, spacing: number): string => {
  if (value === 0) {
    return "0";
  }
  if (spacing > 0 && spacing < 0.001) {
    return value.toExponential(1);
  }
  const decimals =
    spacing > 0 ? Math.max(0, Math.ceil(-Math.log10(spacing))) : 3;
  return Number(value.toFixed(Math.min(decimals, 6))).toString();
};
