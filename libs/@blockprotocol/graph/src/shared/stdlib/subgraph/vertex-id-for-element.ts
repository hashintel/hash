import {
  EntityRecordId,
  GraphElementVertexId,
  isEntityRecordId,
  isOntologyTypeRecordId,
  OntologyTypeRecordId,
  Subgraph,
} from "../../types.js";
import { typedEntries } from "../../util.js";

/**
 * Searches the vertices of the subgraph for an element that matches a given {@link EntityRecordId} or
 * {@link OntologyTypeRecordId}, and returns the associated {@link GraphElementVertexId}.
 *
 * @param subgraph
 * @param recordId
 * @throws if no {@link Vertex} is found that contains the provided RecordId within its metadata
 */
export const getVertexIdForRecordId = (
  subgraph: Subgraph<boolean>,
  recordId: EntityRecordId | OntologyTypeRecordId,
): GraphElementVertexId => {
  for (const [baseId, revisionObject] of typedEntries(subgraph.vertices)) {
    for (const [revisionId, vertex] of typedEntries(revisionObject)) {
      const { recordId: vertexRecordId } = vertex.inner.metadata;
      if (
        (isOntologyTypeRecordId(recordId) &&
          isOntologyTypeRecordId(vertexRecordId) &&
          recordId.baseUrl === vertexRecordId.baseUrl &&
          recordId.version === vertexRecordId.version) ||
        (isEntityRecordId(recordId) &&
          isEntityRecordId(vertexRecordId) &&
          recordId.entityId === vertexRecordId.entityId &&
          recordId.editionId === vertexRecordId.editionId)
      ) {
        return {
          baseId,
          revisionId,
        };
      }
    }
  }

  throw new Error(
    `Could not find vertex associated with recordId: ${JSON.stringify(
      recordId,
    )}`,
  );
};
