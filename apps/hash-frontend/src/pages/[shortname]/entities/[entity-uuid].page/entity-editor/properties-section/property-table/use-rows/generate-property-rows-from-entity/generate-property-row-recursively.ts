import {
  BaseUri,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { Entity, Subgraph, SubgraphRootTypes } from "@local/hash-subgraph/main";
import { getPropertyTypesByBaseUri } from "@local/hash-subgraph/stdlib/element/property-type";
import { get } from "lodash";

import {
  isPropertyValueArray,
  isPropertyValueNested,
} from "../../../../../../../../../lib/typeguards";
import { PropertyRow } from "../../types";
import { getExpectedTypesOfPropertyType } from "./get-expected-types-of-property-type";

/**
 * This function generates property row data,
 * and calls itself again for each nested property. Then puts results of these recursive calls into `children` array
 *
 * @param propertyTypeBaseUri
 * Name of the specific property inside `properties` object
 *
 * @param propertyKeyChain
 * An array of `propertyTypeBaseUri`'s to store the path to each nested property.
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
 * An array of `propertyTypeBaseUri`'s.
 * This is used to check if a property should be shown as `required` or not
 *
 * @param depth
 * Depth of the property. For properties at root, depth starts from `0`
 *
 * @returns property row (and nested rows as `children` if it's a nested property)
 */
export const generatePropertyRowRecursively = ({
  propertyTypeBaseUri,
  propertyKeyChain,
  entity,
  entitySubgraph,
  requiredPropertyTypes,
  depth = 0,
  propertyOnEntityTypeSchema,
}: {
  propertyTypeBaseUri: BaseUri;
  propertyKeyChain: BaseUri[];
  entity: Entity;
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
  requiredPropertyTypes: BaseUri[];
  depth?: number;

  propertyOnEntityTypeSchema?: ValueOrArray<PropertyTypeReference>;
}): PropertyRow => {
  const propertyTypeVersions = getPropertyTypesByBaseUri(
    entitySubgraph,
    propertyTypeBaseUri,
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
  if (!propertyTypeVersions) {
    throw new Error(
      `propertyType not found for base URI: ${propertyTypeBaseUri}`,
    );
  }

  const propertyType = propertyTypeVersions[0]!.schema;

  const { isArray: isPropertyTypeArray, expectedTypes } =
    getExpectedTypesOfPropertyType(propertyType, entitySubgraph);

  const isAllowMultiple =
    !!propertyOnEntityTypeSchema && "type" in propertyOnEntityTypeSchema;

  const isArray = isPropertyTypeArray || isAllowMultiple;

  const required = !!requiredPropertyTypes.includes(propertyTypeBaseUri);

  const value = get(entity.properties, propertyKeyChain);

  const children: PropertyRow[] = [];

  const firstOneOf = propertyType.oneOf[0];
  const isFirstOneOfNested = isPropertyValueNested(firstOneOf);
  const isFirstOneOfArray = isPropertyValueArray(firstOneOf);

  // if first `oneOf` of property type is nested property, it means it should have children
  if (isFirstOneOfNested) {
    for (const subPropertyTypeBaseUri of Object.keys(firstOneOf.properties)) {
      children.push(
        generatePropertyRowRecursively({
          propertyTypeBaseUri: subPropertyTypeBaseUri,
          propertyKeyChain: [...propertyKeyChain, subPropertyTypeBaseUri],
          entity,
          entitySubgraph,
          requiredPropertyTypes,
          depth: depth + 1,
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
      minMaxConfig.maxItems = propertyOnEntityTypeSchema.maxItems;
      minMaxConfig.minItems = propertyOnEntityTypeSchema.minItems;
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
