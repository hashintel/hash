/**
 * Stringify an arbitrary value to be as human readable as possible, where:
 *  - `null` values are treated as empty strings
 *  - `boolean` values are converted to "true" or "false"
 *  - arrays are converted to comma separated strings
 *  - objects are stringified
 */
// oxlint-disable-next-line typescript/no-restricted-types -- accepts any value in order to stringify it
export const stringifyPropertyValue = (propertyValue: unknown): string => {
  if (propertyValue === undefined) {
    return "";
  }
  if (typeof propertyValue === "string") {
    // If the property value is a string, we can return it directly
    return propertyValue;
  }
  if (typeof propertyValue === "object") {
    if (propertyValue === null) {
      // If the property value is null, we treat this as an empty string
      return "";
    }
    if (Array.isArray(propertyValue)) {
      return propertyValue
        .map((value) => stringifyPropertyValue(value))
        .join(",\n");
    }
    // If the property value is an object, we stringify it
    return JSON.stringify(propertyValue);
  }
  if (typeof propertyValue === "boolean") {
    /**
     * Use a lower case 'true' and 'false' to match the behavior of JSON.stringify
     * – if machines are parsing the value (e.g. in a CSV) this is more expected / coercible back into a boolean.
     * If we want to display 'True' or 'False' in human-facing contexts, we can either
     * 1. Introduce a 'machineReadable' argument to this function and vary its behavior
     * 2. Convert at the point of display
     */
    return propertyValue ? "true" : "false";
  }

  // Otherwise directly stringify the property value (for example if it's a number)
  // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see the todo above
  return String(propertyValue);
};
