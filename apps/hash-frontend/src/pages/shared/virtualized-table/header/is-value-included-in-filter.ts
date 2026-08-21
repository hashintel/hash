export const isValueIncludedInFilter = ({
  valueToCheck,
  currentValue,
}: {
  valueToCheck: string[] | string | null;
  currentValue: string | Set<string | null>;
}) => {
  if (typeof currentValue === "string") {
    if (typeof valueToCheck === "string" || valueToCheck === null) {
      return currentValue === valueToCheck;
    }
    return valueToCheck.includes(currentValue);
  }

  if (typeof valueToCheck === "string" || valueToCheck === null) {
    return currentValue.has(valueToCheck);
  }

  return valueToCheck.some((value) => currentValue.has(value));
};
