/**
 * Stringify an arbitrary value to be as human readable as possible, where:
 *  - `null` values are treated as empty strings
 *  - `boolean` values are converted to "True" or "False"
 *  - arrays are converted to comma separated strings
 *  - objects are stringified
 */
export const stringifyPropertyValue = (propertyValue: unknown): string => {
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
      return `[${propertyValue.map(stringifyPropertyValue).join(", ")}]`;
    } else {
      // If the property value is an object, we stringify it
      return JSON.stringify(propertyValue);
    }
  } else if (typeof propertyValue === "boolean") {
    // If the property value is a boolean, return "True" or "False"
    return propertyValue ? "True" : "False";
  }

  // Otherwise directly stringify the property value (for example if it's a number)
  return String(propertyValue);
};
