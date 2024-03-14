/**
 * Stringify an arbitrary value to be as human readable as possible, where:
 *  - `null` values are treated as empty strings
 *  - `boolean` values are converted to "true" or "false"
 *  - arrays are converted to comma separated strings
 *  - objects are stringified
 */
export const stringifyPropertyValue = (propertyValue: unknown): string => {
  if (propertyValue === undefined) {
    return "";
  }
  if (typeof propertyValue === "string") {
    // If the property value is a string, we can return it directly
    return propertyValue;
  } else if (typeof propertyValue === "object") {
    if (propertyValue === null) {
      // If the property value is null, we treat this as an empty string
      return "";
    } else if (Array.isArray(propertyValue)) {
      /**
       * If the property value is an array, we stringify each element and
       * join them with a comma surrounding them with square brackets
       */
      return `[${propertyValue.map((value) => stringifyPropertyValue(value)).join(", ")}]`;
    } else {
      // If the property value is an object, we stringify it
      return JSON.stringify(propertyValue);
    }
  } else if (typeof propertyValue === "boolean") {
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
  return String(propertyValue);
};
