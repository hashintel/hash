import { type Subgraph as SubgraphBp } from "@blockprotocol/graph";
import {
  getDataTypeById as getDataTypeByIdBp,
  getDataTypeByVertexId as getDataTypeByVertexIdBp,
  getDataTypes as getDataTypesBp,
  getDataTypesByBaseUrl as getDataTypesByBaseUrlBp,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DataType } from "@local/hash-graph-client";

import type { OntologyTypeVertexId, Subgraph } from "../../../main.js";

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getDataTypes = (subgraph: Subgraph): DataTypeWithMetadata[] =>
  getDataTypesBp(subgraph as SubgraphBp);

/**
 * Gets a `DataTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeById = (
  subgraph: Subgraph,
  dataTypeId: VersionedUrl,
): DataTypeWithMetadata | undefined =>
  getDataTypeByIdBp(subgraph as SubgraphBp, dataTypeId);

export const mustGetDataTypeById = (
  subgraph: Subgraph,
  dataTypeId: VersionedUrl,
): DataTypeWithMetadata => {
  const dataType = getDataTypeById(subgraph, dataTypeId);
  if (!dataType) {
    throw new Error(`Data type with id ${dataTypeId} not found in subgraph`);
  }
  return dataType;
};

/**
 * Gets a `DataTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the data type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): DataTypeWithMetadata | undefined =>
  getDataTypeByVertexIdBp(subgraph as SubgraphBp, vertexId);

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getDataTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): DataTypeWithMetadata[] =>
  getDataTypesByBaseUrlBp(subgraph as SubgraphBp, baseUrl);

export const getJsonSchemaTypeFromValue = (
  value: unknown,
): DataType["type"] => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  switch (typeof value) {
    case "number":
    case "bigint":
      return "number";
    default:
      return typeof value;
  }
};
