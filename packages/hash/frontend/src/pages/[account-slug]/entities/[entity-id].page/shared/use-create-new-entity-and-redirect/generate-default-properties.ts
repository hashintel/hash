import { EntityType } from "@blockprotocol/type-system-web";
import {
  getPersistedPropertyType,
  Subgraph,
} from "../../../../../../lib/subgraph";
import { getDefaultValueOfPropertyType } from "./get-default-value-of-property-type";

/**
 * @todo this will be deleted when https://app.asana.com/0/1203312852763953/1203433085114587/f (internal) is implemented
 */
export const generateDefaultProperties = (
  properties: EntityType["properties"],
  subgraph: Subgraph,
) => {
  const result: Record<string, unknown> = {};

  for (const propertyKey of Object.keys(properties)) {
    const property = properties[propertyKey];

    if (property && "$ref" in property) {
      const { inner: propertyType } =
        getPersistedPropertyType(subgraph, property.$ref) ?? {};

      result[propertyKey] = getDefaultValueOfPropertyType(
        propertyType!,
        subgraph,
      );
    }
  }

  return result;
};
