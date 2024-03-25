import type {
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import type {
  BaseUrl,
  Entity,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getPropertyTypeById } from "@local/hash-subgraph/stdlib";
import get from "lodash/get";

import {
  isPropertyValueArray,
  isPropertyValuePropertyObject,
} from "../../../../../../../../../lib/typeguards";
import type { PropertyRow } from "../../types";
import { getExpectedTypesOfPropertyType } from "./get-expected-types-of-property-type";

/**
 * This function generates property row data,
 * and calls itself again for each nested property. Then puts results of these recursive calls into `children` array
 *
 * @param propertyTypeBaseUrl
 * Name of the specific property inside `properties` object
 *
 * @param propertyKeyChain
 * An array of `propertyTypeBaseUrl`'s to store the path to each nested property.
 * ```js
 * // Example: `propertyKeyChain` of `c`
 * properties = { a: { b: { c: "John" } } };
 * propertyKeyChain = ["a", "b", "c"]
 * ```
 *
 * @param entity
 * The entity object
 *
 * @param entitySubgraph
 * An object storing root entity & subgraph of that entity
 *
 * @param requiredPropertyTypes
 * An array of `propertyTypeBaseUrl`'s.
 * This is used to check if a property should be shown as `required` or not
 *
 * @param depth
 * Depth of the property. For properties at root, depth starts from `0`
 *
 * @param propertyRefSchema
 * The schema referring to this property, which might be found on the entity type or a property type object
 *
 * @returns property row (and nested rows as `children` if it's a nested property)
 */
export const generatePropertyRowRecursively = ({
  propertyTypeBaseUrl,
  propertyKeyChain,
  entity,
  entitySubgraph,
  requiredPropertyTypes,
  depth = 0,
  propertyRefSchema,
}: {
  propertyTypeBaseUrl: BaseUrl;
  propertyKeyChain: BaseUrl[];
  entity: Entity;
  entitySubgraph: Subgraph<EntityRootType>;
  requiredPropertyTypes: BaseUrl[];
  depth?: number;
  propertyRefSchema: ValueOrArray<PropertyTypeReference>;
}): PropertyRow => {
  const propertyTypeId =
    "$ref" in propertyRefSchema
      ? propertyRefSchema.$ref
      : propertyRefSchema.items.$ref;

  const propertyType = getPropertyTypeById(
    entitySubgraph,
    propertyTypeId,
  )?.schema;
  if (!propertyType) {
    throw new Error(`Property type ${propertyTypeId} not found in subgraph`);
  }

  const { isArray: isPropertyTypeArray, expectedTypes } =
    getExpectedTypesOfPropertyType(propertyType, entitySubgraph);

  const isAllowMultiple = "type" in propertyRefSchema;

  const isArray = isPropertyTypeArray || isAllowMultiple;

  const required = requiredPropertyTypes.includes(propertyTypeBaseUrl);

  const value = get(entity.properties, propertyKeyChain);

  const children: PropertyRow[] = [];

  const firstOneOf = propertyType.oneOf[0];
  const isFirstOneOfNested = isPropertyValuePropertyObject(firstOneOf);
  const isFirstOneOfArray = isPropertyValueArray(firstOneOf);

  // if first `oneOf` of property type is nested property, it means it should have children
  if (isFirstOneOfNested) {
    for (const [subPropertyTypeBaseUrl, subPropertyRefSchema] of Object.entries(
      firstOneOf.properties,
    )) {
      children.push(
        generatePropertyRowRecursively({
          propertyTypeBaseUrl: subPropertyTypeBaseUrl as BaseUrl,
          propertyKeyChain: [
            ...propertyKeyChain,
            // @todo H-1785 handle arrays of property objects in the entity editor – this will just take the first for now
            ...(isArray ? [0] : []),
            subPropertyTypeBaseUrl,
          ] as BaseUrl[],
          entity,
          entitySubgraph,
          requiredPropertyTypes,
          depth: depth + 1,
          propertyRefSchema: subPropertyRefSchema,
        }),
      );
    }
  }

  const indent = !depth ? 0 : children.length ? depth : depth - 1;

  const rowId = propertyKeyChain.join(".");

  const minMaxConfig: Pick<PropertyRow, "maxItems" | "minItems"> = {};

  // set minItems - maxItems
  if (isArray) {
    /**
     * since "array of arrays" is not supported on entity editor yet,
     * we're checking if "entity type schema allows multiple of one property"
     * or
     * "property type is an array"
     */
    if (isAllowMultiple) {
      minMaxConfig.maxItems = propertyRefSchema.maxItems;
      minMaxConfig.minItems = propertyRefSchema.minItems;
    } else if (isFirstOneOfArray) {
      minMaxConfig.maxItems = firstOneOf.maxItems;
      minMaxConfig.minItems = firstOneOf.minItems;
    }
  }

  return {
    rowId,
    title: propertyType.title,
    value,
    expectedTypes,
    isArray,
    ...minMaxConfig,
    required,
    depth,
    children,
    indent,
    /**
     * this will be filled by `fillRowIndentCalculations`
     * this is not filled here, because we'll use the whole flattened tree,
     * and check some values of prev-next items on the flattened tree while calculating this
     */
    verticalLinesForEachIndent: [],
    propertyKeyChain,
  };
};
