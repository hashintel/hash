import { type Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import * as temporal from "@blockprotocol/graph/temporal/stdlib";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import type {
  BaseUrl,
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
  temporal.getDataTypes(
    subgraph as unknown as SubgraphBp,
  ) as DataTypeWithMetadata[];

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
  temporal.getDataTypeById(subgraph as unknown as SubgraphBp, dataTypeId) as
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
  temporal.getDataTypeByVertexId(
    subgraph as unknown as SubgraphBp,
    vertexId,
  ) as DataTypeWithMetadata | undefined;

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
  temporal.getDataTypesByBaseUrl(
    subgraph as unknown as SubgraphBp,
    baseUrl,
  ) as DataTypeWithMetadata[];
