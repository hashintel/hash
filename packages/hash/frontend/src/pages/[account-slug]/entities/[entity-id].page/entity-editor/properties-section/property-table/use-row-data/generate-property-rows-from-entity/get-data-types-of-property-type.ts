import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import {
  getPersistedDataType,
  Subgraph,
} from "../../../../../../../../../lib/subgraph";

export const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  return propertyType.oneOf.map((propertyValue) => {
    if ("$ref" in propertyValue) {
      const dataTypeId = propertyValue?.$ref;
      const persistedDataType = getPersistedDataType(subgraph, dataTypeId);

      return persistedDataType?.inner.title ?? "undefined";
    }

    return capitalize(propertyValue.type);
  });
};
