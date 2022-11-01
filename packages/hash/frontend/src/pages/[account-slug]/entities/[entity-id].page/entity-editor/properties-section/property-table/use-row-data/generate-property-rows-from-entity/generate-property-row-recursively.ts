import { isPlainObject } from "lodash";
import {
  getPropertyTypesByBaseUri,
  RootEntityAndSubgraph,
} from "../../../../../../../../../lib/subgraph";
import { PropertyRow } from "../../types";
import { getDataTypesOfPropertyType } from "./get-data-types-of-property-type";

interface GenerateRowDataParams {
  propertyTypeBaseUri: string;
  properties: any;
  rootEntityAndSubgraph: RootEntityAndSubgraph;
  requiredPropertyTypes: string[];
  depth?: number;
  propertyKeyChain: string[];
}

export const generatePropertyRowRecursively = ({
  properties,
  propertyTypeBaseUri,
  requiredPropertyTypes,
  rootEntityAndSubgraph,
  depth = 0,
  propertyKeyChain,
}: GenerateRowDataParams): PropertyRow => {
  const propertyTypeVersions = getPropertyTypesByBaseUri(
    rootEntityAndSubgraph.subgraph,
    propertyTypeBaseUri,
  );

  if (!propertyTypeVersions) {
    throw new Error(
      `propertyType not found for base URI: ${propertyTypeBaseUri}`,
    );
  }

  const propertyType = propertyTypeVersions[0]!.inner;

  const dataTypes = getDataTypesOfPropertyType(
    propertyType,
    rootEntityAndSubgraph.subgraph,
  );

  const required = !!requiredPropertyTypes?.includes(propertyTypeBaseUri);

  const value = properties[propertyTypeBaseUri];

  const children: PropertyRow[] = [];

  // generate rows for nested properties and push them to children array
  if (isPlainObject(value)) {
    for (const subPropertyTypeBaseUri of Object.keys(value)) {
      children.push(
        generatePropertyRowRecursively({
          rootEntityAndSubgraph,
          propertyTypeBaseUri: subPropertyTypeBaseUri,
          properties: properties[propertyTypeBaseUri],
          requiredPropertyTypes,
          depth: depth + 1,
          propertyKeyChain: [...propertyKeyChain, subPropertyTypeBaseUri],
        }),
      );
    }
  }

  const indent = !depth ? 0 : children.length ? depth : depth - 1;

  const rowId = propertyKeyChain.join("-");

  return {
    rowId,
    title: propertyType.title,
    value,
    dataTypes,
    required,
    depth,
    children,
    indent,
    verticalLinesForEachIndent: [], // this will be filled by `fillRowDataIndentCalculations`
    propertyKeyChain,
  };
};
