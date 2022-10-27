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

export const getNestedPropertySummary = (properties: any) => {
  let empty = 0;
  let notEmpty = 0;

  for (const value of Object.values(properties)) {
    if (isPlainObject(value)) {
      const inner = getNestedPropertySummary(value);
      empty += inner.empty;
      notEmpty += inner.notEmpty;
    } else if (isValueEmpty(value)) {
      empty++;
    } else {
      notEmpty++;
    }
  }

  return {
    empty,
    notEmpty,
  };
};

export const getEmptyPropertyCount = (properties: any) => {
  let empty = 0;

  for (const value of Object.values(properties)) {
    if (isPlainObject(value)) {
      empty += getNestedPropertySummary(value).empty;
    } else if (isValueEmpty(value)) {
      empty++;
    }
  }

  return empty;
};
