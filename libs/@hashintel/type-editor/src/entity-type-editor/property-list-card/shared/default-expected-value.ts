import {
  CustomExpectedValueData,
  CustomExpectedValueTypeId,
} from "./expected-value-types";

export const arrayExpectedValueDataDefaults = {
  minItems: 0,
  maxItems: 0,
};

export const getDefaultExpectedValue = (
  typeId: CustomExpectedValueTypeId,
): CustomExpectedValueData => {
  if (typeId === "object") {
    return {
      typeId: "object",
      properties: [],
    };
  } else if (typeId === "array") {
    return {
      typeId: "array",
      itemIds: [],
      infinity: true,
      ...arrayExpectedValueDataDefaults,
    };
  }

  return { typeId };
};
