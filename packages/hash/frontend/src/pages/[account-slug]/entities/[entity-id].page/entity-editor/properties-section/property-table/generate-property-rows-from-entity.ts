import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import { isPlainObject } from "lodash";
import { TableExpandStatus } from "../../../../../../../components/GlideGlid/utils";
import {
  getPersistedDataType,
  getPropertyTypesByBaseUri,
  getPersistedEntityType,
  RootEntityAndSubgraph,
  Subgraph,
} from "../../../../../../../lib/subgraph";
import { PropertyRow } from "./types";

const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  return propertyType.oneOf.map((propertyValue) => {
    if ("$ref" in propertyValue) {
      const dataTypeId = propertyValue?.$ref;
      const persistedDataType = getPersistedDataType(subgraph, dataTypeId);

      return persistedDataType ? persistedDataType?.inner.title : "undefined";
    }

    return capitalize(propertyValue.type);
  });
};

interface GenerateRowDataParams {
  propertyTypeBaseUri: string;
  properties: any;
  rootEntityAndSubgraph: RootEntityAndSubgraph;
  requiredPropertyTypes: string[];
  depth?: number;
  propertyExpandStatus: TableExpandStatus;
  propertyKeyChain: string[];
}

const generateRowDataFromPropertyTypeBaseUri = ({
  properties,
  propertyTypeBaseUri,
  requiredPropertyTypes,
  rootEntityAndSubgraph,
  depth = 0,
  propertyExpandStatus,
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
        generateRowDataFromPropertyTypeBaseUri({
          rootEntityAndSubgraph,
          propertyTypeBaseUri: subPropertyTypeBaseUri,
          properties: properties[propertyTypeBaseUri],
          requiredPropertyTypes,
          depth: depth + 1,
          propertyExpandStatus,
          propertyKeyChain: [...propertyKeyChain, subPropertyTypeBaseUri],
        }),
      );
    }
  }

  const indent = !depth ? 0 : children.length ? depth : depth - 1;

  const rowId = propertyKeyChain.join("-");

  return {
    ...propertyType,
    value,
    dataTypes,
    required,
    depth,
    expanded: !!propertyExpandStatus[rowId],
    children,
    indent,
    verticalLinesForEachIndent: [], // this will be filled by `fillRowDataIndentCalculations`
    propertyKeyChain,
    rowId,
  };
};

export const generatePropertyRowsFromEntity = (
  rootEntityAndSubgraph: RootEntityAndSubgraph,
  propertyExpandStatus: TableExpandStatus,
): PropertyRow[] => {
  const entity = rootEntityAndSubgraph.root;

  const entityType = getPersistedEntityType(
    rootEntityAndSubgraph.subgraph,
    entity.entityTypeId,
  );

  const requiredPropertyTypes = entityType?.inner.required ?? [];

  return Object.keys(entity.properties).map((propertyTypeBaseUri) =>
    generateRowDataFromPropertyTypeBaseUri({
      propertyTypeBaseUri,
      rootEntityAndSubgraph,
      requiredPropertyTypes,
      properties: entity.properties,
      propertyExpandStatus,
      propertyKeyChain: [propertyTypeBaseUri],
    }),
  );
};
