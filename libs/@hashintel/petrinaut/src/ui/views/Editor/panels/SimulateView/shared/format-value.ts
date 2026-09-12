/** A number as the study surfaces print it: integers whole, the rest to six significant digits. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toPrecision(6);

/** A number as the experiment surfaces print it: integers whole, the rest to three decimals. */
export const formatFixed = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3);

const countFormat = new Intl.NumberFormat("en-US");

/** An integer count with thousands separators: `1,000`. */
export const formatCount = (value: number): string => countFormat.format(value);

const formatScalar = (value: number | boolean): string =>
  typeof value === "boolean" ? String(value) : formatNumber(value);

/** A point's parameters on one line: `population=1744, infected_ratio=0.8`. */
export const formatParameters = (
  parameters: Readonly<Record<string, number | boolean>>,
): string =>
  Object.entries(parameters)
    .map(([identifier, value]) => `${identifier}=${formatScalar(value)}`)
    .join(", ");
