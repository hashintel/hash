/**
 * Safely gets nested properties from an object
 * @param {Array<string>} key List of properties
 * @param {object} object Object to query
 * @returns {*} value
 */
export const prop = ([key, ...rest], object) =>
  key == null ? object
  : object == null ? undefined
  : prop(rest, object[key]); // prettier-ignore
