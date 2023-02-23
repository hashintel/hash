import { type Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getDataTypeById as getDataTypeByIdBp,
  getDataTypeByVertexId as getDataTypeByVertexIdBp,
  getDataTypes as getDataTypesBp,
  getDataTypesByBaseUri as getDataTypesByBaseUriBp,
} from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUri } from "@blockprotocol/type-system/slim";

import {
  BaseUri,
  DataTypeWithMetadata,
  OntologyTypeVertexId,
  Subgraph,
} from "../../../main";

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getDataTypes = (subgraph: Subgraph): DataTypeWithMetadata[] =>
  getDataTypesBp(subgraph as unknown as SubgraphBp) as DataTypeWithMetadata[];

/**
 * Gets a `DataTypeWithMetadata` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeById = (
  subgraph: Subgraph,
  dataTypeId: VersionedUri,
): DataTypeWithMetadata | undefined =>
  getDataTypeByIdBp(subgraph as unknown as SubgraphBp, dataTypeId) as
    | DataTypeWithMetadata
    | undefined;

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
  getDataTypeByVertexIdBp(subgraph as unknown as SubgraphBp, vertexId) as
    | DataTypeWithMetadata
    | undefined;

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getDataTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): DataTypeWithMetadata[] =>
  getDataTypesByBaseUriBp(
    subgraph as unknown as SubgraphBp,
    baseUri,
  ) as DataTypeWithMetadata[];
