import { isPlainObject } from "lodash";
import { isValueEmpty } from "./is-value-empty";

export const getPropertyCountSummary = (properties: unknown) => {
  let emptyCount = 0;
  let notEmptyCount = 0;

  if (!properties) {
    throw new Error(`'properties' should be an object`);
  }

  for (const value of Object.values(properties)) {
    if (isPlainObject(value)) {
      const inner = getPropertyCountSummary(value);
      emptyCount += inner.emptyCount;
      notEmptyCount += inner.notEmptyCount;
    } else if (isValueEmpty(value)) {
      emptyCount++;
    } else {
      notEmptyCount++;
    }
  }

  return {
    emptyCount,
    notEmptyCount,
  };
};
