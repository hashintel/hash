import { isPlainObject } from "lodash";

const isValueEmpty = (val: any) => {
  if (val === "" || val === null || val === undefined) {
    return true;
  }

  if (Array.isArray(val) && !val.length) {
    return true;
  }

  return false;
};

export const getPropertyCountSummary = (properties: any) => {
  let emptyCount = 0;
  let notEmptyCount = 0;

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
