import { PropertyType } from "@blockprotocol/type-system-web";
import { Subgraph } from "../../../../../../lib/subgraph";
import {
  isPropertyValueArray,
  isPropertyValueNested,
} from "../../../../../../lib/typeguards";
import { generateDefaultProperties } from "./generate-default-properties";

/**
 * @todo this will be deleted when https://app.asana.com/0/1203312852763953/1203433085114587/f (internal) is implemented
 */
export const getDefaultValueOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  /**
   * if there are multiple expected types, those are not expected to be arrays or nested properties.
   * So it's safe to return empty string on this case
   */
  if (propertyType.oneOf.length > 1) {
    return "";
  }

  const propertyValue = propertyType.oneOf[0]!;

  // return empty array for arrays
  if (isPropertyValueArray(propertyValue)) {
    return [];
  }

  // recursively get default properties for nested properties
  if (isPropertyValueNested(propertyValue)) {
    return generateDefaultProperties(propertyValue.properties, subgraph);
  }

  // empty string works for number, text & boolean
  return "";
};
