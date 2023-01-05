import { VersionedUri } from "@blockprotocol/type-system";

import { CustomExpectedValueData } from "./expected-value-types";

export type DefaultExpectedValueTypeId = VersionedUri | "array" | "object";

export const arrayExpectedValueDataDefaults = {
  minItems: 0,
  maxItems: 0,
};

export const getDefaultExpectedValue = (
  typeId: DefaultExpectedValueTypeId,
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
