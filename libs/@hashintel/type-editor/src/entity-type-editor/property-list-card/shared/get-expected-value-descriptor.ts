import {
  ExpectedValue,
  FlattenedCustomExpectedValueList,
} from "./expected-value-types";

export const getExpectedValueDescriptor = (
  id: string,
  flattenedExpectedValues: FlattenedCustomExpectedValueList,
): ExpectedValue => {
  const data = flattenedExpectedValues[id]?.data;

  if (!data) {
    throw new Error("Cannot get expected value descriptor, data missing");
  }

  switch (data.typeId) {
    case "array":
      return {
        typeId: "array",
        id,
      };
    case "object":
      return {
        typeId: "object",
        id,
      };

    default:
      return data.typeId;
  }
};
