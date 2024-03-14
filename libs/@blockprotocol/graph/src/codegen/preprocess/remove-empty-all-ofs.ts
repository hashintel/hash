import { typedValues } from "../../shared/util/typed-object-iter.js";
import type { PreprocessContext } from "../context.js";

/** Iteratively loop through the full object and remove any occurrence of `allOf: []` */
const removeEmptyAllOfsFromObject = (obj: object) => {
  const stack = [obj];
  while (stack.length > 0) {
    const currentObj = stack.pop()!;
    for (const [key, value] of Object.entries(currentObj)) {
      if (key === "allOf" && Array.isArray(value) && value.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        delete (currentObj as any)[key];
      } else if (typeof value === "object" && value !== null) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        stack.push(value);
      }
    }
  }
};

/**
 * Removes any occurrence of `allOf: []` from the given types.
 *
 * Without this, the generator generates superfluous types which look something like `type Link = {}`
 */
export const removeEmptyAllOfs = (context: PreprocessContext) => {
  context.logDebug("Removing empty allOfs from types");
  for (const type of typedValues(context.allTypes)) {
    removeEmptyAllOfsFromObject(type);
  }
};
