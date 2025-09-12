import type {
  DataTypeWithMetadata,
  Entity,
  EntityRecordId,
  EntityTypeWithMetadata,
  OntologyTypeRecordId,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";

import {
  inferDataTypeEdgesInSubgraphByMutation,
  inferEntityEdgesInSubgraphByMutation,
  inferEntityTypeEdgesInSubgraphByMutation,
  inferPropertyTypeEdgesInSubgraphByMutation,
} from "../../internal/mutate-subgraph/edge.js";
import {
  addDataTypeVerticesToSubgraphByMutation,
  addEntityTypeVerticesToSubgraphByMutation,
  addEntityVerticesToSubgraphByMutation,
  addPropertyTypeVerticesToSubgraphByMutation,
} from "../../internal/mutate-subgraph/element.js";
import type {
  EntityRootType,
  EntityVertexId,
  Subgraph,
  SubgraphTemporalAxes,
} from "../../types.js";
import { isEntityRecordId, isOntologyTypeRecordId } from "../../types.js";
import { getVertexIdForRecordId } from "./vertex-id-for-element.js";

/**
 * Builds a {@link Subgraph} from a given set of graph elements.
 *
 * The sets of elements should represent the result of a query on a graph.
 * The 'roots' and 'depths' used for that query should be provided along with the data.
 *
 * The maximum value for any single depth is 255.
 *
 * This function does NOT verify that the provided depths are accurate for the data.
 * This function does NOT verify if provided temporal axes are accurate for the data.
 *   - the caller is responsible for both of the above.
 * It DOES check that the provided roots are present in the data.
 *
 * @param data – the data to build the subgraph from (which becomes the vertices)
 * @param data.dataTypes – the data types to include in the subgraph
 * @param data.propertyTypes – the property types to include in the subgraph
 * @param data.entityTypes – the entity types to include in the subgraph
 * @param data.entities – the entities to include in the subgraph
 * @param depths – the depth values to provide in the returned subgraph
 * @param rootRecordIds – the {@link EntityRecordId}s and {@link OntologyTypeRecordId}s of the root elements to provide
 *   in the returned subgraph
 * @param {SubgraphTemporalAxes} subgraphTemporalAxes - the sets of temporal axes that were used when originally
 *   selecting the provided data
 *
 * @returns a Subgraph containing:
 *   - 'vertices' containing the provided entities
 *   - 'edges' calculated by the function, representing connections between vertices
 *   - 'depths' as provided by the caller
 *   - 'roots' as provided by the caller
 *   - 'temporalAxes' where both the `initial` and `resolved` are as provided by the caller
 *
 * @throws if the provided roots are not present in the data
 */
export const buildSubgraph = (
  data: {
    entities: Entity[];
    entityTypes: EntityTypeWithMetadata[];
    propertyTypes: PropertyTypeWithMetadata[];
    dataTypes: DataTypeWithMetadata[];
  },
  rootRecordIds: (EntityRecordId | OntologyTypeRecordId)[],
  subgraphTemporalAxes: SubgraphTemporalAxes,
): Subgraph<EntityRootType> => {
  const missingRoots = rootRecordIds.filter(
    (recordId) =>
      !(
        (isEntityRecordId(recordId) &&
          data.entities.find(
            (entity) =>
              entity.metadata.recordId.entityId === recordId.entityId &&
              entity.metadata.recordId.editionId === recordId.editionId,
          )) ||
        (isOntologyTypeRecordId(recordId) &&
          [...data.dataTypes, ...data.propertyTypes, ...data.entityTypes].find(
            (ontologyType) =>
              ontologyType.metadata.recordId.baseUrl === recordId.baseUrl &&
              ontologyType.metadata.recordId.version === recordId.version,
          ))
      ),
  );

  if (missingRoots.length > 0) {
    throw new Error(
      `Elements associated with these root RecordId(s) were not present in data: ${missingRoots
        .map((missingRoot) => `${JSON.stringify(missingRoot)}`)
        .join(", ")}`,
    );
  }

  const subgraph: Subgraph<EntityRootType> = {
    roots: [],
    vertices: {},
    edges: {},
    temporalAxes: subgraphTemporalAxes,
  };

  const dataTypeVertexIds = addDataTypeVerticesToSubgraphByMutation(
    subgraph,
    data.dataTypes,
  );
  const propertyTypeVertexIds = addPropertyTypeVerticesToSubgraphByMutation(
    subgraph,
    data.propertyTypes,
  );
  const entityTypeVertexIds = addEntityTypeVerticesToSubgraphByMutation(
    subgraph,
    data.entityTypes,
  );
  const entityVertexIds = addEntityVerticesToSubgraphByMutation(
    subgraph,
    data.entities,
  );

  inferDataTypeEdgesInSubgraphByMutation(subgraph, dataTypeVertexIds);
  inferPropertyTypeEdgesInSubgraphByMutation(subgraph, propertyTypeVertexIds);
  inferEntityTypeEdgesInSubgraphByMutation(subgraph, entityTypeVertexIds);
  inferEntityEdgesInSubgraphByMutation(subgraph, entityVertexIds);

  const missingRootVertexIds = [];
  for (const rootRecordId of rootRecordIds) {
    try {
      const vertexId = getVertexIdForRecordId(subgraph, rootRecordId);
      subgraph.roots.push(vertexId as EntityVertexId);
    } catch {
      missingRootVertexIds.push(rootRecordId);
    }
  }

  if (missingRootVertexIds.length > 0) {
    throw new Error(
      // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      `Internal implementation error, could not find VertexId for root RecordId(s): ${missingRootVertexIds.join(
        ", ",
      )}`,
    );
  }

  return subgraph;
};
