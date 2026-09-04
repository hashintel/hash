/** A number as the drawer prints it: integers whole, the rest to six digits. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toPrecision(6);

export const formatScalar = (value: number | boolean): string =>
  typeof value === "boolean" ? String(value) : formatNumber(value);

/** A trial's parameters on one line: `population=1744, infected_ratio=0.8`. */
export const formatParameters = (
  parameters: Readonly<Record<string, number | boolean>>,
): string =>
  Object.entries(parameters)
    .map(([identifier, value]) => `${identifier}=${formatScalar(value)}`)
    .join(", ");
