export const isEmptyString = (value: string | null | undefined): boolean =>
  value == null || value.trim().length === 0;
