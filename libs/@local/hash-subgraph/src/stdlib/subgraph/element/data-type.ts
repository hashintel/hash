import type { Subgraph as SubgraphBp } from "@blockprotocol/graph";
import {
  getDataTypeById as getDataTypeByIdBp,
  getDataTypeByVertexId as getDataTypeByVertexIdBp,
  getDataTypes as getDataTypesBp,
  getDataTypesByBaseUrl as getDataTypesByBaseUrlBp,
} from "@blockprotocol/graph/stdlib";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { DataType } from "@local/hash-graph-client";
import type {
  BaseUrl,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

import type { OntologyTypeVertexId, Subgraph } from "../../../main.js";

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph.
 *
 * @param subgraph
 */
export const getDataTypes = (subgraph: Subgraph): DataTypeWithMetadata[] =>
  getDataTypesBp(subgraph as unknown as SubgraphBp) as DataTypeWithMetadata[];

/**
 * Gets a `DataTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws If the vertex isn't a `DataTypeVertex`.
 */
export const getDataTypeById = (
  subgraph: Subgraph,
  dataTypeId: VersionedUrl,
): DataTypeWithMetadata | undefined =>
  getDataTypeByIdBp(subgraph as unknown as SubgraphBp, dataTypeId) as
    | DataTypeWithMetadata
    | undefined;

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
 * @throws If the vertex isn't a `DataTypeVertex`.
 */
export const getDataTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): DataTypeWithMetadata | undefined =>
  getDataTypeByVertexIdBp(subgraph as unknown as SubgraphBp, vertexId) as
    | DataTypeWithMetadata
    | undefined;

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`.
 *
 * @param subgraph
 * @param baseUrl
 */
export const getDataTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): DataTypeWithMetadata[] =>
  getDataTypesByBaseUrlBp(
    subgraph as unknown as SubgraphBp,
    baseUrl,
  ) as DataTypeWithMetadata[];

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
    case "bigint": {
      return "number";
    }
    default: {
      return typeof value;
    }
  }
};
