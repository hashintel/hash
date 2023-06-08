import { isPlainObject } from "lodash";

import { editorSpecs } from "./editor-specs";

export const arrayValueToString = (array: unknown[]) => {
  return array
    .map((val) => {
      if (typeof val === "boolean") {
        return editorSpecs.boolean.valueToString(val);
      }

      if (val === null) {
        return "Null";
      }

      if (Array.isArray(val)) {
        return "Array";
      }

      if (isPlainObject(val)) {
        return "Object";
      }

      return val;
    })
    .join(", ");
};
