import {
  DataType,
  EntityType,
  OneOf,
  PropertyType,
  PropertyValues,
  validateBaseUrl,
  validateVersionedUrl,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  DataType as DataTypeGraphApi,
  EntityMetadata as EntityMetadataGraphApi,
  EntityRecordId as EntityRecordIdGraphApi,
  EntityTemporalMetadata as EntityTemporalMetadataGraphApi,
  EntityType as EntityTypeGraphApi,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  LinkData as LinkDataGraphApi,
  OntologyElementMetadata as OntologyElementMetadataGraphApi,
  OntologyVertex as OntologyVertexGraphApi,
  PropertyType as PropertyTypeGraphApi,
  ProvenanceMetadata as ProvenanceMetadataGraphApi,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import {
  BaseUrl,
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  EntityRecordId,
  EntityTemporalVersioningMetadata,
  isEntityId,
  KnowledgeGraphVertex,
  LinkData,
  OntologyElementMetadata,
  OntologyTypeRecordId,
  OntologyVertex,
  ProvenanceMetadata,
  Timestamp,
  UpdatedById,
  Vertices,
} from "@local/hash-subgraph";

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
    ...dataType,
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
    oneOf: propertyType.oneOf as OneOf<PropertyValues>["oneOf"],
  };
};

const mapEntityType = (entityType: EntityTypeGraphApi): EntityType => {
  /** @todo - The OpenAPI spec generator fails to appropriately type `properties` or `links` */
  return entityType as EntityType;
};

const mapOntologyTypeRecordId = (
  recordId: OntologyElementMetadataGraphApi["recordId"],
): OntologyTypeRecordId => {
  return {
    baseUrl: recordId.baseUrl as BaseUrl,
    version: recordId.version,
  };
};

const mapProvenanceMetadata = (
  metadata: ProvenanceMetadataGraphApi,
): ProvenanceMetadata => {
  return {
    updatedById: metadata.updatedById as UpdatedById,
  };
};

const mapOntologyMetadata = (
  metadata: OntologyElementMetadataGraphApi,
): OntologyElementMetadata => {
  return {
    recordId: mapOntologyTypeRecordId(metadata.recordId),
    provenance: mapProvenanceMetadata(metadata.provenance),
    ...("fetchedAt" in metadata
      ? { fetchedAt: metadata.fetchedAt as Timestamp }
      : ({} as {
          fetchedAt: Timestamp;
        })),
  };
};

const mapOntologyVertex = (vertex: OntologyVertexGraphApi): OntologyVertex => {
  switch (vertex.kind) {
    case "dataType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapDataType(vertex.inner.schema),
        },
      };
    }
    case "propertyType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapPropertyType(vertex.inner.schema),
        },
      };
    }
    case "entityType": {
      return {
        kind: vertex.kind,
        inner: {
          metadata: mapOntologyMetadata(vertex.inner.metadata),
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
    editionId: recordId.editionId,
  };
};

const mapLinkData = (linkData: LinkDataGraphApi): LinkData => {
  return {
    leftEntityId: linkData.leftEntityId as EntityId,
    rightEntityId: linkData.rightEntityId as EntityId,
    leftToRightOrder: linkData.leftToRightOrder,
    rightToLeftOrder: linkData.rightToLeftOrder,
  };
};

const mapEntityTemporalVersioningMetadata = (
  temporalVersioning: EntityTemporalMetadataGraphApi,
): EntityTemporalVersioningMetadata => {
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
    entityTypeId: metadata.entityTypeId as VersionedUrl,
    temporalVersioning: mapEntityTemporalVersioningMetadata(
      metadata.temporalVersioning,
    ),
    provenance: mapProvenanceMetadata(metadata.provenance),
    archived: metadata.archived,
  };
};

const mapKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertexGraphApi,
): KnowledgeGraphVertex => {
  return {
    kind: vertex.kind,
    inner: {
      properties: vertex.inner.properties as EntityPropertiesObject,
      ...(vertex.inner.linkData
        ? {
            linkData: mapLinkData(vertex.inner.linkData),
          }
        : ({} as { linkData: never })),
      metadata: mapEntityMetadata(vertex.inner.metadata),
    },
  };
};

export const mapVertices = (vertices: VerticesGraphApi): Vertices => {
  const mappedVertices: Vertices = {};

  // Trying to build this with `Object.fromEntries` breaks tsc and leads to `any` typed values
  for (const [baseId, inner] of Object.entries(vertices)) {
    const result = validateBaseUrl(baseId);
    if (result.type === "Ok") {
      // ------------ Ontology Type case ----------------
      const baseUrl = result.inner as BaseUrl;

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
