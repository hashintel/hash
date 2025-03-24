import type {
  BaseUrl,
  CreatedById,
  DataType,
  DataTypeMetadata,
  EditionArchivedById,
  EditionCreatedById,
  EntityEditionId,
  EntityId,
  EntityMetadata,
  EntityProvenance,
  EntityRecordId,
  EntityTemporalMetadata,
  EntityType,
  EntityTypeMetadata,
  LinkData,
  OneOfSchema,
  OntologyProvenance,
  OntologyTypeRecordId,
  OntologyTypeVersion,
  OriginProvenance,
  PropertyType,
  PropertyValues,
  SourceProvenance,
  Timestamp,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  isEntityId,
  validateBaseUrl,
  validateVersionedUrl,
} from "@blockprotocol/type-system";
import type {
  DataType as DataTypeGraphApi,
  DataTypeMetadata as DataTypeMetadataGraphApi,
  EntityMetadata as EntityMetadataGraphApi,
  EntityProvenance as EntityProvenanceGraphApi,
  EntityRecordId as EntityRecordIdGraphApi,
  EntityTemporalMetadata as EntityTemporalMetadataGraphApi,
  EntityType as EntityTypeGraphApi,
  EntityTypeMetadata as EntityTypeMetadataGraphApi,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  LinkData as LinkDataGraphApi,
  OntologyProvenance as OntologyProvenanceGraphApi,
  OntologyTypeRecordId as OntologyTypeRecordIdGraphApi,
  OntologyVertex as OntologyVertexGraphApi,
  PropertyType as PropertyTypeGraphApi,
  PropertyTypeMetadata as PropertyTypeMetadataGraphApi,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";

import type {
  KnowledgeGraphVertex,
  OntologyVertex,
  Vertices,
} from "../../src/main.js";

const mapDataType = (dataType: DataTypeGraphApi): DataType => {
  const idResult = validateVersionedUrl(dataType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URL:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...(dataType as DataType),
    $id,
  };
};

const mapPropertyType = (propertyType: PropertyTypeGraphApi): PropertyType => {
  if (propertyType.oneOf.length < 1) {
    throw new Error(
      `Property Type had an empty one of:\n${JSON.stringify(propertyType)}`,
    );
  }

  const idResult = validateVersionedUrl(propertyType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URL:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...propertyType,
    $id,
    // We checked the length above
    oneOf: propertyType.oneOf as OneOfSchema<PropertyValues>["oneOf"],
  };
};

const mapEntityType = (entityType: EntityTypeGraphApi): EntityType => {
  /** @todo - The OpenAPI spec generator fails to appropriately type `properties` or `links` */
  return entityType as EntityType;
};

const mapOntologyTypeRecordId = (
  recordId: OntologyTypeRecordIdGraphApi,
): OntologyTypeRecordId => {
  return {
    baseUrl: recordId.baseUrl as BaseUrl,
    version: recordId.version as OntologyTypeVersion,
  };
};

const mapOntologyProvenance = (
  metadata: OntologyProvenanceGraphApi,
): OntologyProvenance => {
  return {
    edition: {
      createdById: metadata.edition.createdById as EditionCreatedById,
      archivedById: metadata.edition.archivedById as EditionArchivedById,
      actorType: metadata.edition.actorType,
      origin: metadata.edition.origin as OriginProvenance,
      sources: metadata.edition.sources as SourceProvenance[],
    },
  };
};

const mapEntityProvenance = (
  metadata: EntityProvenanceGraphApi,
): EntityProvenance => {
  return {
    createdById: metadata.createdById as CreatedById,
    createdAtTransactionTime: metadata.createdAtTransactionTime as Timestamp,
    createdAtDecisionTime: metadata.createdAtDecisionTime as Timestamp,
    edition: {
      createdById: metadata.edition.createdById as EditionCreatedById,
      archivedById: metadata.edition.archivedById as EditionArchivedById,
      actorType: metadata.edition.actorType,
      origin: metadata.edition.origin as OriginProvenance,
      sources: metadata.edition.sources as SourceProvenance[],
    },
  };
};

const mapDataTypeMetadata = (
  metadata: DataTypeMetadataGraphApi,
): DataTypeMetadata => {
  return {
    recordId: mapOntologyTypeRecordId(metadata.recordId),
    provenance: mapOntologyProvenance(metadata.provenance),
    ...("fetchedAt" in metadata
      ? { fetchedAt: metadata.fetchedAt as Timestamp }
      : ({} as {
          fetchedAt: Timestamp;
        })),
    temporalVersioning: {
      transactionTime: {
        start: {
          kind: metadata.temporalVersioning.transactionTime.start.kind,
          limit: metadata.temporalVersioning.transactionTime.start
            .limit as Timestamp,
        },
        end:
          metadata.temporalVersioning.transactionTime.end.kind === "unbounded"
            ? {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
              }
            : {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
                limit: metadata.temporalVersioning.transactionTime.end
                  .limit as Timestamp,
              },
      },
    },
  };
};

const mapPropertyTypeMetadata = (
  metadata: PropertyTypeMetadataGraphApi,
): DataTypeMetadata => {
  return {
    recordId: mapOntologyTypeRecordId(metadata.recordId),
    provenance: mapOntologyProvenance(metadata.provenance),
    ...("fetchedAt" in metadata
      ? { fetchedAt: metadata.fetchedAt as Timestamp }
      : ({} as {
          fetchedAt: Timestamp;
        })),
    temporalVersioning: {
      transactionTime: {
        start: {
          kind: metadata.temporalVersioning.transactionTime.start.kind,
          limit: metadata.temporalVersioning.transactionTime.start
            .limit as Timestamp,
        },
        end:
          metadata.temporalVersioning.transactionTime.end.kind === "unbounded"
            ? {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
              }
            : {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
                limit: metadata.temporalVersioning.transactionTime.end
                  .limit as Timestamp,
              },
      },
    },
  };
};

const mapEntityTypeMetadata = (
  metadata: EntityTypeMetadataGraphApi,
): EntityTypeMetadata => {
  return {
    recordId: mapOntologyTypeRecordId(metadata.recordId),
    provenance: mapOntologyProvenance(metadata.provenance),
    ...("fetchedAt" in metadata
      ? { fetchedAt: metadata.fetchedAt as Timestamp }
      : ({} as {
          fetchedAt: Timestamp;
        })),
    temporalVersioning: {
      transactionTime: {
        start: {
          kind: metadata.temporalVersioning.transactionTime.start.kind,
          limit: metadata.temporalVersioning.transactionTime.start
            .limit as Timestamp,
        },
        end:
          metadata.temporalVersioning.transactionTime.end.kind === "unbounded"
            ? {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
              }
            : {
                kind: metadata.temporalVersioning.transactionTime.end.kind,
                limit: metadata.temporalVersioning.transactionTime.end
                  .limit as Timestamp,
              },
      },
    },
  };
};

const mapOntologyVertex = (vertex: OntologyVertexGraphApi): OntologyVertex => {
  switch (vertex.kind) {
    case "dataType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapDataTypeMetadata(vertex.inner.metadata),
          schema: mapDataType(vertex.inner.schema),
        },
      };
    }
    case "propertyType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapPropertyTypeMetadata(vertex.inner.metadata),
          schema: mapPropertyType(vertex.inner.schema),
        },
      };
    }
    case "entityType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapEntityTypeMetadata(vertex.inner.metadata),
          schema: mapEntityType(vertex.inner.schema),
        },
      };
    }
  }
};

const mapEntityRecordId = (
  recordId: EntityRecordIdGraphApi,
): EntityRecordId => {
  return {
    entityId: recordId.entityId as EntityId,
    editionId: recordId.editionId as EntityEditionId,
  };
};

const mapLinkData = (linkData: LinkDataGraphApi): LinkData => {
  return {
    leftEntityId: linkData.leftEntityId as EntityId,
    rightEntityId: linkData.rightEntityId as EntityId,
  };
};

const mapEntityTemporalVersioningMetadata = (
  temporalVersioning: EntityTemporalMetadataGraphApi,
): EntityTemporalMetadata => {
  return {
    transactionTime: {
      start: {
        kind: temporalVersioning.transactionTime.start.kind,
        limit: temporalVersioning.transactionTime.start.limit as Timestamp,
      },
      end:
        temporalVersioning.transactionTime.end.kind === "unbounded"
          ? {
              kind: temporalVersioning.transactionTime.end.kind,
            }
          : {
              kind: temporalVersioning.transactionTime.end.kind,
              limit: temporalVersioning.transactionTime.end.limit as Timestamp,
            },
    },
    decisionTime: {
      start: {
        kind: "inclusive",
        limit: temporalVersioning.decisionTime.start.limit as Timestamp,
      },
      end:
        temporalVersioning.transactionTime.end.kind === "unbounded"
          ? { kind: temporalVersioning.transactionTime.end.kind }
          : {
              kind: temporalVersioning.transactionTime.end.kind,
              limit: temporalVersioning.transactionTime.end.limit as Timestamp,
            },
    },
  };
};

const mapEntityMetadata = (
  metadata: EntityMetadataGraphApi,
): EntityMetadata => {
  return {
    recordId: mapEntityRecordId(metadata.recordId),
    entityTypeIds: metadata.entityTypeIds as [VersionedUrl, ...VersionedUrl[]],
    temporalVersioning: mapEntityTemporalVersioningMetadata(
      metadata.temporalVersioning,
    ),
    provenance: mapEntityProvenance(metadata.provenance),
    archived: metadata.archived,
  };
};

const mapKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertexGraphApi,
): KnowledgeGraphVertex => {
  const _metadata = mapEntityMetadata(vertex.inner.metadata);
  const _linkData = vertex.inner.linkData
    ? mapLinkData(vertex.inner.linkData)
    : undefined;
  return {
    kind: vertex.kind,
    inner: new Entity(vertex.inner),
  };
};

export const mapVertices = (vertices: VerticesGraphApi): Vertices => {
  const mappedVertices: Vertices = {};

  // Trying to build this with `Object.fromEntries` breaks tsc and leads to `any` typed values
  for (const [baseId, inner] of Object.entries(vertices)) {
    const result = validateBaseUrl(baseId);
    if (result.type === "Ok") {
      // ------------ Ontology Type case ----------------
      const baseUrl = result.inner;

      mappedVertices[baseUrl] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const versionNumber = Number(version);

          if (Number.isNaN(versionNumber)) {
            throw new Error(
              `Unrecognized ontology type version, expected a number but got: ${version}`,
            );
          }

          if (
            vertex.kind !== "dataType" &&
            vertex.kind !== "propertyType" &&
            vertex.kind !== "entityType"
          ) {
            throw new Error(
              `Expected an ontology vertex but found:\n${JSON.stringify(
                vertex,
              )}`,
            );
          }

          const mappedVertex = mapOntologyVertex(vertex);
          return [versionNumber, mappedVertex];
        }),
      );
    } else if (isEntityId(baseId)) {
      // ------------ Entity (knowledge-graph) case ----------------
      mappedVertices[baseId] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const timestamp = Date.parse(version);

          if (Number.isNaN(timestamp)) {
            throw new Error(
              `Unrecognized entity version, expected an ISO-formatted timestamp but got: ${version}`,
            );
          }

          if (vertex.kind !== "entity") {
            throw new Error(
              `Expected an entity vertex but found:\n${JSON.stringify(vertex)}`,
            );
          }

          const mappedVertex = mapKnowledgeGraphVertex(vertex);
          return [version, mappedVertex];
        }),
      );
    } else {
      throw new Error(
        `Unrecognized or invalid vertices outer key type: ${baseId}`,
      );
    }
  }

  return mappedVertices;
};
